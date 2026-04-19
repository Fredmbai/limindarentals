"""
Celery tasks for:
  - B2B disbursement flow (initiate_b2b_disbursement, retry_b2b_disbursement)
  - Automatic rent collection (trigger_automatic_payments, auto_mpesa_retry)

B2B disbursement flow:
  1. MpesaCallbackView triggers initiate_b2b_disbursement after M-Pesa C2B success.
  2. initiate_b2b_disbursement looks up the landlord payment method, calls Daraja B2B API,
     and stores the OriginatorConversationID as disbursement_reference.
  3. MpesaB2BResultView / MpesaB2BQueueTimeoutView receive callbacks from Safaricom,
     mark the payment SUCCESS or FAILED, and schedule retry_b2b_disbursement on failure.
  4. retry_b2b_disbursement retries up to MAX_RETRIES times; on exhaustion it e-mails admin.

Automatic payments flow:
  1. trigger_automatic_payments runs daily at 8 AM EAT (via Celery Beat).
  2. For each ACTIVE AutoPayment whose next_due_date == today:
     - M-Pesa: triggers STK push → on callback success creates Payment + B2B disbursement.
     - Card:   charges stored card_token via Paystack charge_authorization.
  3. On failure a single SMS retry is scheduled after 2 hours.
"""

import logging
from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

MAX_RETRIES = 3


@shared_task(bind=True, max_retries=MAX_RETRIES)
def initiate_b2b_disbursement(self, payment_id: str, landlord_amount: int):
    """
    Triggered after a successful M-Pesa C2B callback.
    Looks up the landlord's payment method and initiates a B2B transfer.

    If no payment method is configured:
      - marks disbursement_status = FAILED
      - notifies admin and landlord to add a payout method

    Priority:
      1. payment.tenancy.unit.property.payment_method  (per-property override)
      2. landlord's is_default=True PaymentMethod
      3. neither → FAILED + notify
    """
    from .models import Payment, PaymentMethod
    from .mpesa.daraja import daraja
    from notifications.service import notify_disbursement_failed_no_method

    try:
        payment = Payment.objects.select_related(
            "tenancy__unit__property",
            "tenancy__unit__property__payment_method",
        ).get(id=payment_id)
    except Payment.DoesNotExist:
        logger.error(f"initiate_b2b_disbursement: payment {payment_id} not found")
        return

    # Already disbursed (idempotency guard)
    if payment.disbursement_status == Payment.DisbursementStatus.SUCCESS:
        return

    # ── Resolve payment method ─────────────────────────────────────────────────
    prop   = payment.tenancy.unit.property
    method = (
        prop.payment_method
        if prop.payment_method_id and prop.payment_method.is_active
        else None
    )
    if method is None:
        method = PaymentMethod.objects.filter(
            landlord  = prop.landlord,
            is_default= True,
            is_active = True,
        ).first()

    if method is None:
        # No payout destination — mark failed and notify
        payment.disbursement_status = Payment.DisbursementStatus.FAILED
        payment.save(update_fields=["disbursement_status", "updated_at"])
        try:
            notify_disbursement_failed_no_method(payment)
        except Exception:
            logger.exception("notify_disbursement_failed_no_method failed")
        logger.warning(
            f"No payment method for landlord {prop.landlord_id}; "
            f"payment {payment_id} disbursement skipped."
        )
        return

    # ── Call Daraja B2B ───────────────────────────────────────────────────────
    try:
        if method.method_type == PaymentMethod.MethodType.TILL:
            result = daraja.b2b_pay_till(
                till_number                = method.account_number,
                amount                     = landlord_amount,
                originator_conversation_id = str(payment.id),
                remarks                    = f"Rent unit {payment.tenancy.unit.unit_number}",
            )
        else:
            result = daraja.b2b_pay_paybill(
                paybill_number             = method.account_number,
                account_reference          = method.paybill_account_number or str(payment.id),
                amount                     = landlord_amount,
                originator_conversation_id = str(payment.id),
                remarks                    = f"Rent unit {payment.tenancy.unit.unit_number}",
            )

        conv_id = result.get("OriginatorConversationID") or result.get("ConversationID", "")
        payment.disbursement_reference = conv_id
        payment.save(update_fields=["disbursement_reference", "updated_at"])

        logger.info(
            f"B2B disbursement initiated: payment={payment_id} "
            f"conversation={conv_id} amount={landlord_amount}"
        )

    except Exception as exc:
        logger.exception(f"B2B API call failed for payment {payment_id}: {exc}")
        # Retry with exponential back-off: 5m, 25m, 125m
        raise self.retry(exc=exc, countdown=300 * (5 ** self.request.retries))


@shared_task(bind=True, max_retries=MAX_RETRIES)
def retry_b2b_disbursement(self, payment_id: str):
    """
    Retries a failed B2B disbursement.
    Called from MpesaB2BResultView / MpesaB2BQueueTimeoutView when result_code != 0.
    On final failure, e-mails ADMIN_EMAIL.
    """
    from .models import Payment, PaymentMethod
    from .mpesa.daraja import daraja

    try:
        payment = Payment.objects.select_related(
            "tenancy__unit__property",
            "tenancy__unit__property__payment_method",
        ).get(id=payment_id)
    except Payment.DoesNotExist:
        logger.error(f"retry_b2b_disbursement: payment {payment_id} not found")
        return

    if payment.disbursement_status == Payment.DisbursementStatus.SUCCESS:
        return

    prop   = payment.tenancy.unit.property
    method = (
        prop.payment_method
        if prop.payment_method_id and prop.payment_method.is_active
        else None
    )
    if method is None:
        method = PaymentMethod.objects.filter(
            landlord  = prop.landlord,
            is_default= True,
            is_active = True,
        ).first()

    if method is None:
        _notify_admin_repeated_failure(payment_id, reason="No payment method configured")
        return

    landlord_amount = int(
        payment.amount_paid - payment.platform_fee_amount - payment.b2b_fee_amount
    )

    try:
        if method.method_type == PaymentMethod.MethodType.TILL:
            result = daraja.b2b_pay_till(
                till_number                = method.account_number,
                amount                     = landlord_amount,
                originator_conversation_id = str(payment.id),
                remarks                    = f"Rent retry {payment.tenancy.unit.unit_number}",
            )
        else:
            result = daraja.b2b_pay_paybill(
                paybill_number             = method.account_number,
                account_reference          = method.paybill_account_number or str(payment.id),
                amount                     = landlord_amount,
                originator_conversation_id = str(payment.id),
                remarks                    = f"Rent retry {payment.tenancy.unit.unit_number}",
            )

        conv_id = result.get("OriginatorConversationID") or result.get("ConversationID", "")
        payment.disbursement_reference = conv_id
        payment.disbursement_status    = Payment.DisbursementStatus.PENDING
        payment.save(update_fields=["disbursement_reference", "disbursement_status", "updated_at"])

        logger.info(f"B2B retry initiated: payment={payment_id} attempt={self.request.retries + 1}")

    except Exception as exc:
        logger.exception(f"B2B retry {self.request.retries + 1} failed for payment {payment_id}")
        if self.request.retries >= MAX_RETRIES - 1:
            _notify_admin_repeated_failure(payment_id, reason=str(exc))
        else:
            raise self.retry(exc=exc, countdown=300 * (5 ** self.request.retries))


def _notify_admin_repeated_failure(payment_id: str, reason: str):
    """E-mails the platform admin when B2B disbursement repeatedly fails."""
    admin_email = getattr(settings, "ADMIN_EMAIL", "")
    if not admin_email:
        logger.warning("ADMIN_EMAIL not set — cannot notify admin of B2B failure")
        return
    try:
        send_mail(
            subject = f"[LumidahRentals] B2B disbursement failed — payment {payment_id}",
            message = (
                f"B2B disbursement for payment {payment_id} has failed repeatedly.\n\n"
                f"Reason: {reason}\n\n"
                f"Please investigate and manually disburse if necessary."
            ),
            from_email   = settings.DEFAULT_FROM_EMAIL,
            recipient_list = [admin_email],
            fail_silently  = True,
        )
        logger.info(f"Admin notified of repeated B2B failure for payment {payment_id}")
    except Exception:
        logger.exception("Failed to send admin failure notification")


# ──────────────────────────────────────────────────────────────────────────────
# AUTOMATIC RENT COLLECTION
# ──────────────────────────────────────────────────────────────────────────────

@shared_task
def trigger_automatic_payments():
    """
    Runs daily at 8 AM EAT.
    Finds all ACTIVE AutoPayment records due today and triggers the appropriate
    payment flow (STK push for M-Pesa, charge_authorization for card).

    M-Pesa staggering:
      Tenants who have multiple auto-payments (e.g. two units) would receive
      simultaneous STK pushes, which is confusing.  We group by tenant phone
      number, sort each group by unit_number alphabetically, then apply a 180 s
      (3-minute) countdown between each push for the same tenant so they arrive
      one at a time.  A failure of one push never blocks the others.

    Card payments are processed all at once — no tenant interaction required.
    """
    from collections import defaultdict
    from django.utils import timezone
    from .models import AutoPayment

    today = timezone.now().date()
    due_today = list(
        AutoPayment.objects.filter(
            status        = AutoPayment.STATUS_ACTIVE,
            next_due_date = today,
        ).select_related(
            "tenant",
            "tenancy",
            "tenancy__unit",
            "tenancy__unit__property",
        )
    )

    logger.info(f"trigger_automatic_payments: {len(due_today)} due today ({today})")

    # ── Card payments — no stagger needed ────────────────────────────────────
    for ap in due_today:
        if ap.payment_method != AutoPayment.METHOD_MPESA:
            try:
                _trigger_card_autopay.delay(str(ap.id))
            except Exception:
                logger.exception(
                    f"Failed to dispatch card auto-payment for AutoPayment {ap.id}"
                )

    # ── M-Pesa payments — stagger per tenant phone ───────────────────────────
    # Group by the phone that will receive the STK push (mpesa_number falls back
    # to tenant.phone; use tenant PK as last-resort key to avoid mixing).
    tenant_groups: dict[str, list] = defaultdict(list)
    for ap in due_today:
        if ap.payment_method == AutoPayment.METHOD_MPESA:
            key = ap.mpesa_number or ap.tenant.phone or str(ap.tenant.id)
            tenant_groups[key].append(ap)

    for phone_key, aps in tenant_groups.items():
        # Sort by unit_number so ordering is deterministic
        aps.sort(key=lambda ap: ap.tenancy.unit.unit_number)

        for idx, ap in enumerate(aps):
            delay        = idx * 180   # 0 s, 180 s, 360 s, …
            tenant_email = ap.tenant.email or ap.tenant.phone
            unit_name    = ap.tenancy.unit.unit_number

            logger.info(
                f"Scheduling STK push for tenant {tenant_email} "
                f"unit {unit_name} in {delay} seconds"
            )

            try:
                _trigger_mpesa_autopay.apply_async(
                    args      = [str(ap.id)],
                    countdown = delay,
                )
            except Exception:
                logger.exception(
                    f"Failed to dispatch M-Pesa auto-payment for AutoPayment {ap.id}"
                )


@shared_task
def _trigger_mpesa_autopay(autopayment_id: str):
    """
    Initiates an STK push for one M-Pesa AutoPayment.
    The M-Pesa callback (MpesaCallbackView) will create the Payment record
    and trigger B2B disbursement once the tenant confirms payment on their phone.
    """
    from .models import AutoPayment, Payment
    from .mpesa.daraja import daraja
    from .utils import format_phone_for_mpesa
    from notifications.sms import send_sms

    try:
        ap = AutoPayment.objects.select_related(
            "tenant", "tenancy", "tenancy__unit", "tenancy__unit__property"
        ).get(id=autopayment_id)
    except AutoPayment.DoesNotExist:
        logger.error(f"_trigger_mpesa_autopay: AutoPayment {autopayment_id} not found")
        return

    if ap.status != AutoPayment.STATUS_ACTIVE:
        return

    tenancy  = ap.tenancy
    amount   = int(tenancy.rent_snapshot)
    property_name = tenancy.unit.property.name
    phone    = format_phone_for_mpesa(ap.mpesa_number or ap.tenant.phone)
    desc     = f"Rent {property_name[:10]}"

    # Create a pending Payment record now so the STK callback can match it
    from django.utils import timezone as tz
    payment = Payment.objects.create(
        tenancy      = tenancy,
        amount_due   = amount,
        payment_type = "monthly",
        method       = Payment.Method.MPESA,
        status       = Payment.Status.PENDING,
    )

    try:
        result = daraja.stk_push(
            phone       = phone,
            amount      = amount,
            payment_id  = str(payment.id),
            description = desc,
        )
        payment.transaction_id = result.get("CheckoutRequestID")
        payment.save(update_fields=["transaction_id"])
        logger.info(
            f"Auto M-Pesa STK push sent: autopayment={autopayment_id} "
            f"payment={payment.id} phone={phone}"
        )
    except Exception as exc:
        logger.exception(f"Auto M-Pesa STK push failed: autopayment={autopayment_id}")
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status"])
        # Notify tenant via SMS and schedule single retry after 2 hours
        try:
            msg = (
                f"Auto rent payment for {property_name} failed. "
                f"Please pay manually or ensure your M-Pesa has sufficient funds. "
                f"Amount: KES {amount:,}"
            )
            send_sms(ap.tenant.phone, msg)
        except Exception:
            pass
        auto_mpesa_retry.apply_async(args=[autopayment_id], countdown=7200)  # 2 hours


@shared_task
def auto_mpesa_retry(autopayment_id: str):
    """Single retry attempt for a failed M-Pesa auto-payment (2 hours after original)."""
    _trigger_mpesa_autopay(autopayment_id)


@shared_task
def _trigger_card_autopay(autopayment_id: str):
    """
    Charges a stored Paystack card token for one Card AutoPayment.
    Creates the Payment record immediately and marks it based on Paystack response.
    """
    from decimal import Decimal
    from django.utils import timezone as tz
    from .models import AutoPayment, Payment
    from .paystack import paystack
    from .utils import calculate_card_surcharge
    from .views import create_receipt, activate_tenancy_if_initial
    from notifications.sms import send_sms

    try:
        ap = AutoPayment.objects.select_related(
            "tenant", "tenancy", "tenancy__unit", "tenancy__unit__property"
        ).get(id=autopayment_id)
    except AutoPayment.DoesNotExist:
        logger.error(f"_trigger_card_autopay: AutoPayment {autopayment_id} not found")
        return

    if ap.status != AutoPayment.STATUS_ACTIVE:
        return

    tenancy       = ap.tenancy
    rent          = int(tenancy.rent_snapshot)
    surcharge     = calculate_card_surcharge(rent)
    charge_total  = rent + surcharge
    property_name = tenancy.unit.property.name
    tenant        = ap.tenant

    payment = Payment.objects.create(
        tenancy               = tenancy,
        amount_due            = rent,
        card_surcharge_amount = surcharge,
        payment_type          = "monthly",
        method                = Payment.Method.CARD,
        status                = Payment.Status.PENDING,
    )

    try:
        result = paystack.charge_authorization(
            authorization_code = ap.card_token,
            email              = tenant.email or f"{tenant.phone}@lumidahrentals.com",
            amount_kes         = charge_total,
            reference          = str(payment.id),
            metadata           = {
                "autopayment_id": str(ap.id),
                "property":       property_name,
            },
        )
        if result.get("data", {}).get("status") == "success":
            tx_id     = str(result["data"]["id"])
            rent_paid = Decimal(str(charge_total)) - payment.card_surcharge_amount
            payment.mark_success(
                transaction_id = tx_id,
                amount_paid    = max(rent_paid, Decimal("0")),
            )
            create_receipt(payment)
            activate_tenancy_if_initial(payment)

            # Advance next_due_date
            ap.last_triggered_at = tz.now()
            ap.next_due_date     = AutoPayment.compute_next_due_date(
                ap.due_day, after=ap.next_due_date
            )
            ap.save(update_fields=["last_triggered_at", "next_due_date", "updated_at"])

            # Confirmation SMS
            try:
                send_sms(
                    tenant.phone,
                    f"LumidahRentals: Auto rent payment of KES {rent:,} for "
                    f"{property_name} was successful. Next due: {ap.next_due_date}.",
                )
            except Exception:
                pass

            logger.info(
                f"Auto card payment success: autopayment={autopayment_id} payment={payment.id}"
            )
        else:
            raise Exception(f"Paystack returned non-success: {result}")

    except Exception as exc:
        logger.exception(f"Auto card payment failed: autopayment={autopayment_id}")
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status"])

        landlord = tenancy.landlord
        try:
            send_sms(
                tenant.phone,
                f"LumidahRentals: Auto rent payment for {property_name} failed. "
                f"Please check your card or pay manually. Amount: KES {rent:,}.",
            )
        except Exception:
            pass
        try:
            send_sms(
                landlord.phone,
                f"LumidahRentals: Automatic rent payment from "
                f"{tenant.full_name} failed for {property_name}. "
                f"They have been notified.",
            )
        except Exception:
            pass


# Called from MpesaCallbackView after a successful C2B that was initiated
# by an auto-payment STK push — advance the next_due_date.
@shared_task
def advance_autopay_due_date(tenancy_id: str):
    """
    Called after a successful M-Pesa callback for an auto-payment.
    Finds the ACTIVE AutoPayment for this tenancy and advances next_due_date.
    """
    from django.utils import timezone as tz
    from .models import AutoPayment
    ap = AutoPayment.objects.filter(
        tenancy_id    = tenancy_id,
        payment_method= AutoPayment.METHOD_MPESA,
        status        = AutoPayment.STATUS_ACTIVE,
    ).first()
    if ap:
        ap.last_triggered_at = tz.now()
        ap.next_due_date     = AutoPayment.compute_next_due_date(
            ap.due_day, after=ap.next_due_date
        )
        ap.save(update_fields=["last_triggered_at", "next_due_date", "updated_at"])
