from django.utils import timezone
from django.conf import settings as django_settings
from .models import Notification
from .sms import send_sms
import json
import logging

logger = logging.getLogger(__name__)


def send_push_notification(subscription, title: str, body: str, url: str = "/"):
    """
    Deliver a Web Push message to a single PushSubscription.
    Silently deletes the subscription if the push service returns 404 or 410
    (subscription expired or revoked by the user).
    """
    try:
        from pywebpush import webpush, WebPushException
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps({"title": title, "body": body, "url": url, "tag": title[:40]}),
            vapid_private_key=django_settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{django_settings.VAPID_CLAIM_EMAIL}"},
        )
    except Exception as exc:
        msg = str(exc)
        if "410" in msg or "404" in msg:
            subscription.delete()   # stale — clean up
        else:
            logger.warning("Push failed for %s: %s", subscription.endpoint[:60], msg)


def notify(user, title: str, message: str, notification_type: str = "general",
           related_object_id=None, related_object_type: str = "", send_sms_flag: bool = True):
    """
    Central function — creates in-app notification, sends SMS, and fires Web Push.
    Call this from anywhere in the codebase.
    """
    # 1. In-app notification (always)
    notif = Notification.objects.create(
        user                = user,
        title               = title,
        message             = message,
        notification_type   = notification_type,
        related_object_id   = related_object_id,
        related_object_type = related_object_type,
    )

    # 2. SMS if user has a phone number
    if send_sms_flag and user.phone:
        send_sms(user.phone, f"LumidahRentals: {message}")

    # 3. Web Push to all subscribed devices (fire-and-forget, never crash caller)
    try:
        from .models import PushSubscription
        for sub in PushSubscription.objects.filter(user=user):
            try:
                send_push_notification(sub, title=title, body=message)
            except Exception:
                pass
    except Exception:
        pass

    return notif


# ── Payment notifications ─────────────────────

def _landlord_note(payment) -> str:
    """
    Returns a short note for landlord notifications showing what they will receive
    after platform fee (2%) and B2B transfer fee deductions (M-Pesa only).
    """
    platform_fee = float(getattr(payment, "platform_fee_amount", 0) or 0)
    b2b_fee      = float(getattr(payment, "b2b_fee_amount",       0) or 0)
    if platform_fee <= 0 and b2b_fee <= 0:
        return ""
    landlord_rcv = int(float(payment.amount_paid)) - int(platform_fee) - int(b2b_fee)
    return f" (you receive KES {landlord_rcv:,} after 2% platform fee + B2B fee)"


def notify_payment_success(payment):
    """Called after any successful payment."""
    tenancy  = payment.tenancy
    tenant   = tenancy.tenant
    landlord = tenancy.landlord

    amount        = f"KES {int(float(payment.amount_paid)):,}"
    unit          = tenancy.unit.unit_number
    method        = payment.get_method_display()
    landlord_note = _landlord_note(payment)

    if tenant:
        notify(
            user              = tenant,
            title             = "Payment received",
            message           = f"Your payment of {amount} for Unit {unit} via {method} was received successfully. Receipt: {getattr(payment.receipt, 'receipt_number', '')}",
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
        )

    if landlord:
        tenant_name = tenant.full_name if tenant else "Tenant"
        notify(
            user              = landlord,
            title             = f"Rent received — Unit {unit}",
            message           = f"{tenant_name} paid {amount} for Unit {unit} via {method}.{landlord_note}",
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
        )


def notify_initial_payment(payment):
    """Called after initial payment activates a tenancy."""
    tenancy  = payment.tenancy
    tenant   = tenancy.tenant
    landlord = tenancy.landlord
    unit     = tenancy.unit.unit_number
    amount   = f"KES {int(float(payment.amount_paid)):,}"

    if tenant:
        notify(
            user              = tenant,
            title             = "Tenancy activated!",
            message           = f"Your tenancy for Unit {unit} is now active. Welcome! Initial payment of {amount} confirmed.",
            notification_type = "tenancy",
            related_object_id = tenancy.id,
            related_object_type = "tenancy",
        )

    if landlord:
        tenant_name   = tenant.full_name if tenant else "Tenant"
        landlord_note = _landlord_note(payment)
        notify(
            user              = landlord,
            title             = f"New tenant activated — Unit {unit}",
            message           = f"{tenant_name} has completed initial payment of {amount} for Unit {unit}. Tenancy is now active.{landlord_note}",
            notification_type = "tenancy",
            related_object_id = tenancy.id,
            related_object_type = "tenancy",
        )


def notify_partial_payment(payment):
    """Called when a payment is made but doesn't cover full rent."""
    tenancy  = payment.tenancy
    tenant   = tenancy.tenant
    landlord = tenancy.landlord
    unit     = tenancy.unit.unit_number
    paid     = f"KES {int(float(payment.amount_paid)):,}"
    balance  = f"KES {int(float(payment.balance)):,}"

    if tenant:
        notify(
            user              = tenant,
            title             = "Partial payment received",
            message           = f"Payment of {paid} for Unit {unit} received. Outstanding balance: {balance}.",
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
        )

    if landlord:
        tenant_name = tenant.full_name if tenant else "Tenant"
        notify(
            user              = landlord,
            title             = f"Partial rent — Unit {unit}",
            message           = f"{tenant_name} paid {paid} for Unit {unit}. Balance remaining: {balance}.",
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
        )


def notify_custom_payment(payment, period_label: str, paid_until_date):
    """Called for custom period payments (1 day, 1 week, 3 weeks, etc.)"""
    tenancy  = payment.tenancy
    tenant   = tenancy.tenant
    landlord = tenancy.landlord
    unit     = tenancy.unit.unit_number
    amount   = f"KES {int(float(payment.amount_paid)):,}"
    until    = paid_until_date.strftime("%d %b %Y") if paid_until_date else ""

    if tenant:
        notify(
            user              = tenant,
            title             = f"Paid until {until}",
            message           = f"Your {period_label} rent payment of {amount} for Unit {unit} is confirmed. Paid until {until}.",
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
        )

    if landlord:
        tenant_name = tenant.full_name if tenant else "Tenant"
        notify(
            user              = landlord,
            title             = f"Custom payment — Unit {unit}",
            message           = f"{tenant_name} paid {period_label} rent ({amount}) for Unit {unit}. Covered until {until}.",
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
        )


def notify_disbursement_failed_no_method(payment):
    """
    Called when B2B disbursement cannot proceed because the landlord has no
    payment method configured. Notifies both the landlord and admin.
    """
    tenancy  = payment.tenancy
    landlord = tenancy.landlord
    unit     = tenancy.unit.unit_number
    amount   = f"KES {int(float(payment.amount_paid)):,}"

    if landlord:
        notify(
            user              = landlord,
            title             = "Action required: add payout method",
            message           = (
                f"We received {amount} for Unit {unit} but could not disburse it "
                f"because you have no M-Pesa payout method configured. "
                f"Please add a Till number or Paybill in your account settings."
            ),
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
        )


def notify_maintenance_created(maintenance_request):
    """Called when tenant raises a maintenance request."""
    tenancy  = maintenance_request.tenancy
    landlord = tenancy.landlord
    tenant   = tenancy.tenant
    unit     = tenancy.unit.unit_number

    if landlord:
        tenant_name = tenant.full_name if tenant else "A tenant"
        notify(
            user              = landlord,
            title             = f"Maintenance request — Unit {unit}",
            message           = f"{tenant_name} (Unit {unit}) raised a {maintenance_request.priority} priority request: {maintenance_request.issue[:80]}",
            notification_type = "maintenance",
            related_object_id = maintenance_request.id,
            related_object_type = "maintenance",
        )


def notify_maintenance_resolved(maintenance_request):
    """Called when landlord/caretaker resolves a maintenance request."""
    tenant = maintenance_request.tenancy.tenant
    unit   = maintenance_request.tenancy.unit.unit_number

    if tenant:
        notify(
            user              = tenant,
            title             = "Maintenance request resolved",
            message           = f"Your maintenance request for Unit {unit} has been resolved. {maintenance_request.resolution_notes or ''}".strip(),
            notification_type = "maintenance",
            related_object_id = maintenance_request.id,
            related_object_type = "maintenance",
        )


def notify_bank_proof_uploaded(payment):
    """Called when tenant uploads bank transfer proof."""
    tenancy  = payment.tenancy
    landlord = tenancy.landlord
    tenant   = tenancy.tenant
    unit     = tenancy.unit.unit_number
    amount   = f"KES {int(float(payment.amount_due)):,}"

    if landlord:
        tenant_name = tenant.full_name if tenant else "A tenant"
        notify(
            user              = landlord,
            title             = f"Bank transfer proof — Unit {unit}",
            message           = f"{tenant_name} uploaded bank transfer proof for {amount} (Unit {unit}). Please verify.",
            notification_type = "payment",
            related_object_id = payment.id,
            related_object_type = "payment",
            send_sms_flag     = False,
        )


def notify_tenancy_created(tenancy):
    """Called when tenant creates a new tenancy (pending initial payment)."""
    landlord = tenancy.landlord
    tenant   = tenancy.tenant
    unit     = tenancy.unit.unit_number

    if landlord:
        tenant_name = tenant.full_name if tenant else "A tenant"
        notify(
            user              = landlord,
            title             = f"New tenant — Unit {unit}",
            message           = f"{tenant_name} has signed the tenancy agreement for Unit {unit}. Waiting for initial payment.",
            notification_type = "tenancy",
            related_object_id = tenancy.id,
            related_object_type = "tenancy",
            send_sms_flag     = False,
        )