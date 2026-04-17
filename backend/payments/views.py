import json
import logging
from decimal              import Decimal
from django.conf          import settings
from django.db            import transaction
from django.shortcuts     import get_object_or_404
from django.utils         import timezone
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators      import method_decorator

from rest_framework              import generics, status
from rest_framework.response     import Response
from rest_framework.views        import APIView
from rest_framework.permissions  import IsAuthenticated, AllowAny

logger = logging.getLogger(__name__)

from .models       import AutoPayment, Payment, PaymentMethod, Receipt, MpesaTransaction
from .serializers  import (
    AutoPaymentSerializer,
    AutoPaymentCreateSerializer,
    InitiatePaymentSerializer,
    PaymentSerializer,
    PaymentMethodSerializer,
    ReceiptSerializer,
    BankProofUploadSerializer,
)
from .utils        import (
    generate_receipt_number, format_phone_for_mpesa,
    calculate_platform_fee, calculate_b2b_fee, calculate_card_surcharge,
)
from .mpesa.daraja import daraja
from .paystack     import paystack                  # ← Paystack replaces Flutterwave
from accounts.permissions import IsLandlordOrCaretaker, IsTenant, IsLandlord


# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────

def create_receipt(payment: Payment) -> Receipt:
    """Auto-generates receipt + PDF after successful payment."""
    from .receipt_generator import generate_receipt_pdf
    from .utils import update_unit_payment_status
    from notifications.service import (
        notify_payment_success, notify_partial_payment,
        notify_initial_payment,
    )

    receipt = Receipt.objects.create(
        payment        = payment,
        receipt_number = generate_receipt_number(),
    )

    # Generate PDF
    try:
        pdf_file = generate_receipt_pdf(receipt)
        receipt.receipt_pdf.save(pdf_file.name, pdf_file, save=True)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"PDF generation failed: {e}")

    # Update unit payment status
    update_unit_payment_status(payment)

    # Notifications
    if payment.payment_type == "initial":
        notify_initial_payment(payment)
    elif payment.balance > 0:
        notify_partial_payment(payment)
    else:
        notify_payment_success(payment)

    return receipt


def activate_tenancy_if_initial(payment: Payment):
    """Activates tenancy after initial payment — marks unit occupied."""
    if payment.payment_type == Payment.PaymentType.INITIAL:
        if payment.tenancy.status == "pending":
            payment.tenancy.activate()


# ──────────────────────────────────────────────
# PAYMENT INITIATION
# ──────────────────────────────────────────────

class InitiatePaymentView(APIView):
    """
    POST /api/payments/initiate/

    Single endpoint for all payment methods.
    Creates a pending Payment record first — always — then calls provider.
    If provider call fails, payment is marked FAILED but the record exists
    for audit purposes.
    """
    permission_classes = [IsTenant]

    @transaction.atomic
    def post(self, request):
        serializer = InitiatePaymentSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
    
        tenancy      = serializer.validated_data["tenancy"]
        method       = serializer.validated_data["method"]
        payment_type = serializer.validated_data["payment_type"]
    
        from .utils import calculate_period, calculate_prorated_rent
        from django.utils import timezone
        today = timezone.now().date()
    
        # Calculate amount and period
        import calendar
        if payment_type == "initial":
            prorated   = calculate_prorated_rent(tenancy.rent_snapshot, tenancy.lease_start_date)
            amount_due = int(tenancy.deposit_amount) + prorated
            period_start = tenancy.lease_start_date
            days_in_month = calendar.monthrange(tenancy.lease_start_date.year, tenancy.lease_start_date.month)[1]
            period_end    = tenancy.lease_start_date.replace(day=days_in_month)

        elif payment_type == "balance":
            # Pay outstanding balance for the current month
            from .models import UnitPaymentStatus
            try:
                ups_obj = UnitPaymentStatus.objects.get(tenancy=tenancy)
            except UnitPaymentStatus.DoesNotExist:
                return Response(
                    {"detail": "No payment record found. Please make your initial payment first."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if ups_obj.balance <= 0:
                return Response(
                    {"detail": "No outstanding balance. Your rent is fully paid."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            import math
            amount_due   = math.ceil(float(ups_obj.balance))
            # Period: from day after paid_until through end of current month
            from datetime import timedelta
            pay_from     = (ups_obj.paid_until + timedelta(days=1)) if ups_obj.paid_until else today
            days_in_m    = calendar.monthrange(today.year, today.month)[1]
            period_start = pay_from
            period_end   = today.replace(day=days_in_m)

        else:
            period     = calculate_period(payment_type, tenancy.rent_snapshot, today)
            amount_due = period["amount_due"]
            period_start = period["period_start"]
            period_end   = period["period_end"]
    
        # Card payments carry a 2.6% surcharge billed to the tenant.
        # M-Pesa: tenant pays full rent; platform fee (2%) + B2B fee are
        # deducted from the collected amount before disbursing to landlord.
        # Bank transfers: no surcharge.
        card_surcharge = (
            calculate_card_surcharge(amount_due)
            if method == Payment.Method.CARD
            else 0
        )
        charge_amount = amount_due + card_surcharge   # total billed to tenant

        payment = Payment.objects.create(
            tenancy               = tenancy,
            amount_due            = amount_due,
            card_surcharge_amount = card_surcharge,
            payment_type          = payment_type,
            method                = method,
            status                = Payment.Status.PENDING,
            period_start          = period_start,
            period_end            = period_end,
        )

        # ── M-Pesa ────────────────────────────
        if method == Payment.Method.MPESA:
            try:
                #uses phone from request, falls back to profile phone
                phone = format_phone_for_mpesa(
                    serializer.validated_data.get("phone") or tenancy.tenant.phone
                )
                description = f"Rent {tenancy.unit.unit_number}"
                result      = daraja.stk_push(
                    phone       = phone,
                    amount      = charge_amount,   # includes platform fee
                    payment_id  = str(payment.id),
                    description = description,
                )
                # Store Daraja's CheckoutRequestID so we can match the callback
                payment.transaction_id = result.get("CheckoutRequestID")
                payment.save(update_fields=["transaction_id"])

                return Response({
                    "payment_id":          str(payment.id),
                    "checkout_request_id": result.get("CheckoutRequestID"),
                    "merchant_request_id": result.get("MerchantRequestID"),
                    "message":             "STK push sent. Check your phone.",
                }, status=status.HTTP_200_OK)

            except Exception as e:
                payment.status = Payment.Status.FAILED
                payment.save(update_fields=["status"])
                return Response(
                    {"detail": f"M-Pesa request failed: {str(e)}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        # ── Card (Paystack) ───────────────────
        elif method == Payment.Method.CARD:
            try:
                tenant       = tenancy.tenant
                callback_url = request.build_absolute_uri(
                    f"/api/payments/card/return/?payment_id={payment.id}"
                )
                result = paystack.initiate_payment(
                    payment_id   = str(payment.id),
                    amount_kes   = charge_amount,   # rent + 2.6% card surcharge
                    email        = tenant.email or "",
                    full_name    = tenant.full_name,
                    phone        = tenant.phone,
                    description  = f"Rent - Unit {tenancy.unit.unit_number}",
                    callback_url = callback_url,
                    channels     = ["card"],         # block M-Pesa via Paystack
                )
                auth_url = result["data"]["authorization_url"]
                return Response({
                    "payment_id":  str(payment.id),
                    "payment_url": auth_url,   # redirect tenant here
                    "message":     "Redirect tenant to payment_url to complete card payment.",
                }, status=status.HTTP_200_OK)

            except Exception as e:
                payment.status = Payment.Status.FAILED
                payment.save(update_fields=["status"])
                return Response(
                    {"detail": f"Card payment failed: {str(e)}"},
                    status=status.HTTP_502_BAD_GATEWAY,
                )

        # ── Bank Transfer ──────────────────────
        elif method == Payment.Method.BANK:
            return Response({
                "payment_id": str(payment.id),
                "message":    "Upload proof to /api/payments/{id}/bank-proof/",
            }, status=status.HTTP_200_OK)


# ──────────────────────────────────────────────
# M-PESA CALLBACK — called by Safaricom
# ──────────────────────────────────────────────

@method_decorator(csrf_exempt, name="dispatch")
class MpesaCallbackView(APIView):
    """
    POST /api/payments/mpesa/callback/

    Safaricom calls this after tenant completes/cancels M-Pesa payment.
    No auth — Safaricom doesn't send tokens.
    Always return 200 — non-200 triggers Safaricom to resend repeatedly.
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        try:
            callback = request.data["Body"]["stkCallback"]

            merchant_request_id = callback["MerchantRequestID"]
            checkout_request_id = callback["CheckoutRequestID"]
            result_code         = callback["ResultCode"]
            result_desc         = callback["ResultDesc"]

            # Find payment by CheckoutRequestID we stored at initiation
            try:
                payment = Payment.objects.select_for_update().get(
                    transaction_id=checkout_request_id
                )
            except Payment.DoesNotExist:
                return Response({"ResultCode": 0, "ResultDesc": "OK"})

            # Log raw Daraja response — always, regardless of outcome
            mpesa_log = MpesaTransaction.objects.create(
                payment             = payment,
                merchant_request_id = merchant_request_id,
                checkout_request_id = checkout_request_id,
                result_code         = result_code,
                result_description  = result_desc,
                phone_number        = "",
                raw_response        = request.data,
            )

            if result_code == 0:
                # Success — extract M-Pesa receipt details
                items = {
                    item["Name"]: item.get("Value")
                    for item in callback["CallbackMetadata"]["Item"]
                }
                mpesa_receipt = items.get("MpesaReceiptNumber", "")
                amount_paid   = items.get("Amount", payment.amount_due)
                phone         = str(items.get("PhoneNumber", ""))

                mpesa_log.mpesa_receipt_number = mpesa_receipt
                mpesa_log.phone_number         = phone
                mpesa_log.amount               = amount_paid
                mpesa_log.save()

                # amount_paid is the full rent collected from the tenant.
                # Calculate fees that will be deducted before disbursing to landlord.
                collected        = Decimal(str(amount_paid))
                platform_fee_amt = Decimal(str(calculate_platform_fee(collected)))
                landlord_before_b2b = collected - platform_fee_amt
                b2b_fee_amt      = Decimal(str(calculate_b2b_fee(landlord_before_b2b)))
                landlord_amount  = max(landlord_before_b2b - b2b_fee_amt, Decimal("0"))

                # Store fee breakdown and mark disbursement as pending
                payment.platform_fee_amount  = platform_fee_amt
                payment.b2b_fee_amount       = b2b_fee_amt
                payment.disbursement_status  = Payment.DisbursementStatus.PENDING
                payment.save(update_fields=[
                    "platform_fee_amount", "b2b_fee_amount",
                    "disbursement_status", "updated_at",
                ])

                # amount_paid = full rent collected (before fee deductions).
                # The fee fields show how much the landlord will actually receive.
                payment.mark_success(
                    transaction_id=mpesa_receipt,
                    amount_paid=collected,
                )
                create_receipt(payment)
                activate_tenancy_if_initial(payment)

                # Trigger B2B disbursement to landlord
                from .tasks import initiate_b2b_disbursement, advance_autopay_due_date
                initiate_b2b_disbursement.apply_async(
                    args=[str(payment.id), int(landlord_amount)],
                    countdown=5,   # short delay to let the DB commit propagate
                )
                # If this was an auto-payment STK push, advance next_due_date
                advance_autopay_due_date.delay(str(payment.tenancy_id))

            else:
                # Cancelled or failed
                payment.status = Payment.Status.FAILED
                payment.save(update_fields=["status", "updated_at"])

        except Exception:
            logger.exception("M-Pesa callback processing error")
            # Still return 200 — non-200 triggers Safaricom to resend repeatedly

        return Response({"ResultCode": 0, "ResultDesc": "OK"})


# ──────────────────────────────────────────────
# PAYSTACK WEBHOOK — called by Paystack
# ──────────────────────────────────────────────

@method_decorator(csrf_exempt, name="dispatch")
class PaystackWebhookView(APIView):
    """
    POST /api/payments/card/webhook/

    Paystack calls this after card payment completes.
    Verify signature FIRST — reject anything that fails the check.
    Then verify the transaction with Paystack API as double-confirmation.
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        # Step 1 — verify the webhook came from Paystack
        signature = request.headers.get("x-paystack-signature", "")
        if not paystack.verify_webhook_signature(request.body, signature):
            return Response(
                {"detail": "Invalid signature."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        data  = request.data
        event = data.get("event")

        # Only process successful charge events
        if event != "charge.success":
            return Response({"status": "ignored"})

        reference  = data["data"]["reference"]   # our payment UUID
        tx_id      = str(data["data"]["id"])      # Paystack transaction ID
        amount_paid = data["data"]["amount"] // 100  # convert kobo back to KES

        try:
            payment = Payment.objects.select_for_update().get(id=reference)
        except Payment.DoesNotExist:
            return Response({"status": "not found"})

        # Already processed — idempotency guard
        if payment.status == Payment.Status.SUCCESS:
            return Response({"status": "already processed"})

        # Step 2 — verify with Paystack API (never trust webhook alone)
        verify = paystack.verify_payment(reference)
        if verify["data"]["status"] == "success":
            # Strip the 2.6% card surcharge — amount_paid = rent only
            rent_paid = Decimal(str(amount_paid)) - payment.card_surcharge_amount
            payment.mark_success(
                transaction_id=tx_id,
                amount_paid=max(rent_paid, Decimal("0")),
            )
            create_receipt(payment)
            activate_tenancy_if_initial(payment)

        return Response({"status": "ok"})


# ──────────────────────────────────────────────
# PAYSTACK REDIRECT — tenant returns after card payment
# ──────────────────────────────────────────────
@method_decorator(csrf_exempt, name="dispatch")
class PaystackReturnView(APIView):
    """
    GET /api/payments/card/return/?payment_id=xxx
    Paystack redirects browser here after card payment.
    AllowAny — browser has no Bearer token on redirect.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        payment_id = request.query_params.get("payment_id")
        if not payment_id:
            return Response(
                {"detail": "Payment ID missing."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payment = Payment.objects.get(id=payment_id)
        except Payment.DoesNotExist:
            return Response(
                {"detail": "Payment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Verify with Paystack — use select_for_update inside atomic to prevent
        # a race with the webhook arriving at the same moment
        try:
            verify = paystack.verify_payment(str(payment.id))
            if verify["data"]["status"] == "success":
                from django.db import transaction as db_transaction
                with db_transaction.atomic():
                    payment = Payment.objects.select_for_update().get(id=payment_id)
                    if payment.status != Payment.Status.SUCCESS:
                        amount_paid_total = verify["data"]["amount"] // 100
                        # Strip the 2.6% card surcharge — credit landlord rent only
                        rent_paid = Decimal(str(amount_paid_total)) - payment.card_surcharge_amount
                        payment.mark_success(
                            transaction_id = str(verify["data"]["id"]),
                            amount_paid    = max(rent_paid, Decimal("0")),
                        )
                        create_receipt(payment)
                        activate_tenancy_if_initial(payment)
        except Exception as e:
            logger.error(f"Paystack return verify failed: {e}")

        # Redirect to frontend with result
        from django.shortcuts import redirect as django_redirect
        frontend_url = settings.FRONTEND_URL
        if payment.status == Payment.Status.SUCCESS:
            return django_redirect(
                f"{frontend_url}/tenant/payments?payment=success&id={payment_id}"
            )
        else:
            return django_redirect(
                f"{frontend_url}/tenant/payments?payment=pending&id={payment_id}"
            )
        
# ──────────────────────────────────────────────
# BANK TRANSFER
# ──────────────────────────────────────────────

class BankProofUploadView(generics.UpdateAPIView):
    """
    PATCH /api/payments/:id/bank-proof/
    Tenant uploads bank transfer proof. Stays pending until landlord verifies.
    """
    serializer_class   = BankProofUploadSerializer
    permission_classes = [IsTenant]

    def get_object(self):
        return get_object_or_404(
            Payment,
            id              = self.kwargs["pk"],
            tenancy__tenant = self.request.user,
            method          = Payment.Method.BANK,
            status          = Payment.Status.PENDING,
        )


class BankPaymentVerifyView(APIView):
    """
    POST /api/payments/:id/verify-bank/
    Landlord manually confirms a bank transfer.
    """
    permission_classes = [IsLandlord]

    @transaction.atomic
    def post(self, request, pk):
        payment = get_object_or_404(
            Payment,
            id                = pk,
            method            = Payment.Method.BANK,
            status            = Payment.Status.PENDING,
            tenancy__landlord = request.user,
        )
        payment.mark_success(
            transaction_id=f"BANK-{payment.id}",
            amount_paid=payment.amount_due,
        )
        create_receipt(payment)
        activate_tenancy_if_initial(payment)
        return Response(
            {"detail": "Bank payment verified. Receipt generated."},
            status=status.HTTP_200_OK,
        )


# ──────────────────────────────────────────────
# PAYMENT HISTORY + STATUS
# ──────────────────────────────────────────────

class MyPaymentsView(generics.ListAPIView):
    """GET /api/payments/ — tenant payment history"""
    serializer_class   = PaymentSerializer
    permission_classes = [IsTenant]

    def get_queryset(self):
        qs = Payment.objects.filter(
            tenancy__tenant=self.request.user
        ).select_related(
            "tenancy", "tenancy__unit",
            "tenancy__tenant", "receipt",
        ).order_by("-created_at")

        tenancy_id    = self.request.query_params.get("tenancy_id")
        status_filter = self.request.query_params.get("status")
        if tenancy_id:
            qs = qs.filter(tenancy__id=tenancy_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs


class PaymentStatusView(generics.RetrieveAPIView):
    """GET /api/payments/:id/status/ — frontend polls this after M-Pesa STK push"""
    serializer_class   = PaymentSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return get_object_or_404(
            Payment,
            id              = self.kwargs["pk"],
            tenancy__tenant = self.request.user,
        )


class LandlordPaymentsView(generics.ListAPIView):
    """GET /api/payments/landlord/ — landlord sees all payments"""
    serializer_class   = PaymentSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        qs = Payment.objects.filter(
            tenancy__landlord=self.request.user
        ).select_related(
            "tenancy", "tenancy__unit",
            "tenancy__tenant", "receipt",
        ).order_by("-created_at")

        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

class TenancyPaymentsView(generics.ListAPIView):
    """
    GET /api/payments/tenancy/:tenancy_id/
    Landlord or assigned caretaker views payments for a specific tenancy.
    """
    serializer_class   = PaymentSerializer
    permission_classes = [IsLandlordOrCaretaker]

    def get_queryset(self):
        qs = Payment.objects.filter(
            tenancy__id=self.kwargs["tenancy_id"],
        ).select_related(
            "tenancy", "tenancy__unit", "tenancy__tenant", "receipt",
        ).order_by("-created_at")

        user = self.request.user
        if user.role == "caretaker":
            assigned_property_ids = user.caretaker_assignments.values_list(
                "property_id", flat=True
            )
            return qs.filter(tenancy__unit__property_id__in=assigned_property_ids)
        # Landlord
        return qs.filter(tenancy__landlord=user)

    
# ──────────────────────────────────────────────
# RECEIPTS
# ──────────────────────────────────────────────

class MyReceiptsView(generics.ListAPIView):
    """GET /api/payments/receipts/ — tenant receipt list"""
    serializer_class   = ReceiptSerializer
    permission_classes = [IsTenant]

    def get_queryset(self):
        qs = Receipt.objects.filter(
            payment__tenancy__tenant=self.request.user
        ).select_related(
            "payment", "payment__tenancy",
            "payment__tenancy__unit",
            "payment__tenancy__unit__property",
            "payment__tenancy__tenant",
        ).order_by("-generated_at")
 
        # Filter by tenancy — used by landlord viewing a specific tenant
        tenancy_id = self.request.query_params.get("tenancy_id")
        if tenancy_id:
            qs = qs.filter(payment__tenancy__id=tenancy_id)
 
        return qs


class TenancyReceiptsView(generics.ListAPIView):
    """
    GET /api/payments/tenancy/:tenancy_id/receipts/
    Landlord or assigned caretaker views receipts for a specific tenancy.
    """
    serializer_class   = ReceiptSerializer
    permission_classes = [IsLandlordOrCaretaker]

    def get_queryset(self):
        qs = Receipt.objects.filter(
            payment__tenancy__id=self.kwargs["tenancy_id"],
        ).select_related(
            "payment", "payment__tenancy",
            "payment__tenancy__unit",
            "payment__tenancy__unit__property",
        ).order_by("-generated_at")

        user = self.request.user
        if user.role == "caretaker":
            assigned_property_ids = user.caretaker_assignments.values_list(
                "property_id", flat=True
            )
            return qs.filter(
                payment__tenancy__unit__property_id__in=assigned_property_ids
            )
        # Landlord
        return qs.filter(payment__tenancy__landlord=user)
    
class ReceiptDownloadView(generics.RetrieveAPIView):
    """GET /api/payments/receipts/:id/ — single receipt detail"""
    serializer_class   = ReceiptSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return get_object_or_404(
            Receipt,
            id                       = self.kwargs["pk"],
            payment__tenancy__tenant = self.request.user,
        )


# ──────────────────────────────────────────────
# PAYMENT METHODS (landlord B2B payout destinations)
# ──────────────────────────────────────────────

class PaymentMethodListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/landlord/payment-methods/ — list the landlord's payment methods
    POST /api/landlord/payment-methods/ — add a new payment method
    """
    serializer_class   = PaymentMethodSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        return PaymentMethod.objects.filter(landlord=self.request.user)

    def perform_create(self, serializer):
        serializer.save(landlord=self.request.user)


class PaymentMethodDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/landlord/payment-methods/:id/ — retrieve
    PUT    /api/landlord/payment-methods/:id/ — full update
    PATCH  /api/landlord/payment-methods/:id/ — partial update
    DELETE /api/landlord/payment-methods/:id/ — delete
    """
    serializer_class   = PaymentMethodSerializer
    permission_classes = [IsLandlord]

    def get_object(self):
        return get_object_or_404(
            PaymentMethod,
            id       = self.kwargs["pk"],
            landlord = self.request.user,
        )


class PaymentMethodSetDefaultView(APIView):
    """
    PATCH /api/landlord/payment-methods/:id/set-default/
    Marks the given method as default; clears all others for this landlord.
    """
    permission_classes = [IsLandlord]

    def patch(self, request, pk):
        method = get_object_or_404(
            PaymentMethod,
            id       = pk,
            landlord = request.user,
        )
        method.is_default = True
        method.save()   # PaymentMethod.save() handles clearing other defaults
        return Response(
            PaymentMethodSerializer(method).data,
            status=status.HTTP_200_OK,
        )


# ──────────────────────────────────────────────
# B2B DISBURSEMENT CALLBACKS — called by Safaricom
# ──────────────────────────────────────────────

@method_decorator(csrf_exempt, name="dispatch")
class MpesaB2BResultView(APIView):
    """
    POST /api/payments/mpesa/b2b/result/
    Safaricom sends the B2B transfer result here.
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        try:
            data   = request.data
            result = data.get("Result", {})
            result_code = result.get("ResultCode")
            conv_id     = result.get("ConversationID", "")
            orig_conv_id = result.get("OriginatorConversationID", "")

            # Match by disbursement_reference (we stored ConversationID there)
            payment = Payment.objects.select_for_update().filter(
                disbursement_reference=orig_conv_id
            ).first()

            if not payment:
                # Try ConversationID in case OriginatorConversationID is empty
                payment = Payment.objects.select_for_update().filter(
                    disbursement_reference=conv_id
                ).first()

            if payment:
                if result_code == 0:
                    payment.disbursement_status = Payment.DisbursementStatus.SUCCESS
                    payment.disbursed_at        = timezone.now()
                    payment.save(update_fields=[
                        "disbursement_status", "disbursed_at", "updated_at"
                    ])
                else:
                    payment.disbursement_status = Payment.DisbursementStatus.FAILED
                    payment.save(update_fields=["disbursement_status", "updated_at"])
                    # Schedule retry via Celery
                    from .tasks import retry_b2b_disbursement
                    retry_b2b_disbursement.apply_async(
                        args=[str(payment.id)],
                        countdown=300,  # 5 minutes
                    )

        except Exception:
            logger.exception("B2B result callback processing error")

        return Response({"ResultCode": 0, "ResultDesc": "Accepted"})   # B2B result end


@method_decorator(csrf_exempt, name="dispatch")
class MpesaB2BQueueTimeoutView(APIView):
    """
    POST /api/payments/mpesa/b2b/timeout/
    Safaricom calls this when the B2B request times out in the queue.
    We treat it the same as a failure — schedule a retry.
    """
    permission_classes = [AllowAny]

    @transaction.atomic
    def post(self, request):
        try:
            data   = request.data
            result = data.get("Result", {})
            orig_conv_id = result.get("OriginatorConversationID", "")
            conv_id      = result.get("ConversationID", "")

            payment = Payment.objects.select_for_update().filter(
                disbursement_reference=orig_conv_id
            ).first() or Payment.objects.select_for_update().filter(
                disbursement_reference=conv_id
            ).first()

            if payment and payment.disbursement_status == Payment.DisbursementStatus.PENDING:
                payment.disbursement_status = Payment.DisbursementStatus.FAILED
                payment.save(update_fields=["disbursement_status", "updated_at"])
                from .tasks import retry_b2b_disbursement
                retry_b2b_disbursement.apply_async(
                    args=[str(payment.id)],
                    countdown=300,
                )

        except Exception:
            logger.exception("B2B queue timeout callback processing error")

        return Response({"ResultCode": 0, "ResultDesc": "Accepted"})

# ──────────────────────────────────────────────
# AUTO-PAYMENT — tenant recurring subscription
# ──────────────────────────────────────────────

class AutoPaymentListCreateView(APIView):
    """
    GET  /api/tenant/auto-payments/ — list tenant's auto-payment subscriptions
    POST /api/tenant/auto-payments/ — subscribe to automatic rent payments
    """
    permission_classes = [IsTenant]

    def get(self, request):
        qs = AutoPayment.objects.filter(
            tenant=request.user,
        ).select_related("tenancy", "tenancy__unit", "tenancy__unit__property")
        return Response(AutoPaymentSerializer(qs, many=True).data)

    @transaction.atomic
    def post(self, request):
        serializer = AutoPaymentCreateSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data    = serializer.validated_data
        tenancy = data["tenancy"]

        mpesa_number = (
            data.get("mpesa_number")
            or request.user.phone
            or ""
        )

        ap = AutoPayment.objects.create(
            tenant         = request.user,
            tenancy        = tenancy,
            payment_method = data["payment_method"],
            mpesa_number   = mpesa_number if data["payment_method"] == AutoPayment.METHOD_MPESA else "",
            card_token     = data.get("card_token", "") if data["payment_method"] == AutoPayment.METHOD_CARD else "",
            card_last_four = data.get("card_last_four", "") if data["payment_method"] == AutoPayment.METHOD_CARD else "",
            due_day        = tenancy.due_day,
            next_due_date  = AutoPayment.compute_next_due_date(tenancy.due_day),
        )
        return Response(AutoPaymentSerializer(ap).data, status=status.HTTP_201_CREATED)


class AutoPaymentPauseView(APIView):
    permission_classes = [IsTenant]

    def patch(self, request, pk):
        ap = get_object_or_404(AutoPayment, id=pk, tenant=request.user)
        if ap.status != AutoPayment.STATUS_ACTIVE:
            return Response(
                {"detail": "Only active auto-payments can be paused."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ap.status = AutoPayment.STATUS_PAUSED
        ap.save(update_fields=["status", "updated_at"])
        return Response(AutoPaymentSerializer(ap).data)


class AutoPaymentCancelView(APIView):
    permission_classes = [IsTenant]

    def patch(self, request, pk):
        ap = get_object_or_404(AutoPayment, id=pk, tenant=request.user)
        if ap.status == AutoPayment.STATUS_CANCELLED:
            return Response(
                {"detail": "Already cancelled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ap.status = AutoPayment.STATUS_CANCELLED
        ap.save(update_fields=["status", "updated_at"])
        return Response(AutoPaymentSerializer(ap).data)


class AutoPaymentResumeView(APIView):
    permission_classes = [IsTenant]

    def patch(self, request, pk):
        ap = get_object_or_404(AutoPayment, id=pk, tenant=request.user)
        if ap.status != AutoPayment.STATUS_PAUSED:
            return Response(
                {"detail": "Only paused auto-payments can be resumed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ap.status         = AutoPayment.STATUS_ACTIVE
        ap.next_due_date  = AutoPayment.compute_next_due_date(ap.due_day)
        ap.save(update_fields=["status", "next_due_date", "updated_at"])
        return Response(AutoPaymentSerializer(ap).data)


class AutoPaymentUpdateMpesaView(APIView):
    permission_classes = [IsTenant]

    def patch(self, request, pk):
        ap     = get_object_or_404(AutoPayment, id=pk, tenant=request.user)
        number = request.data.get("mpesa_number", "").strip()
        if not number:
            return Response(
                {"detail": "mpesa_number is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ap.payment_method != AutoPayment.METHOD_MPESA:
            return Response(
                {"detail": "This auto-payment uses a card, not M-Pesa."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ap.mpesa_number = number
        ap.save(update_fields=["mpesa_number", "updated_at"])
        return Response(AutoPaymentSerializer(ap).data)


class AutoPaymentUpdateCardView(APIView):
    permission_classes = [IsTenant]

    def patch(self, request, pk):
        ap             = get_object_or_404(AutoPayment, id=pk, tenant=request.user)
        card_token     = request.data.get("card_token", "").strip()
        card_last_four = request.data.get("card_last_four", "").strip()
        if not card_token or not card_last_four:
            return Response(
                {"detail": "card_token and card_last_four are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ap.payment_method != AutoPayment.METHOD_CARD:
            return Response(
                {"detail": "This auto-payment uses M-Pesa, not a card."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ap.card_token     = card_token
        ap.card_last_four = card_last_four
        ap.save(update_fields=["card_token", "card_last_four", "updated_at"])
        return Response(AutoPaymentSerializer(ap).data)


# ──────────────────────────────────────────────
# DUE DAY — landlord sets per-tenancy
# ──────────────────────────────────────────────

class TenancyDueDayView(APIView):
    """
    PATCH /api/landlord/tenancies/:tenancy_id/due-day/
    Landlord updates the rent due day for a tenancy (1–28).
    Propagates to all active/paused AutoPayment records for that tenancy.
    """
    permission_classes = [IsLandlord]

    def patch(self, request, tenancy_id):
        from tenancies.models import Tenancy
        tenancy = get_object_or_404(Tenancy, id=tenancy_id, landlord=request.user)
        due_day = request.data.get("due_day")
        try:
            due_day = int(due_day)
            if not (1 <= due_day <= 28):
                raise ValueError
        except (TypeError, ValueError):
            return Response(
                {"detail": "due_day must be an integer between 1 and 28."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tenancy.due_day = due_day
        tenancy.save(update_fields=["due_day", "updated_at"])

        # Update all active/paused AutoPayments for this tenancy
        updated = AutoPayment.objects.filter(
            tenancy=tenancy,
            status__in=[AutoPayment.STATUS_ACTIVE, AutoPayment.STATUS_PAUSED],
        )
        for ap in updated:
            ap.due_day       = due_day
            ap.next_due_date = AutoPayment.compute_next_due_date(due_day)
            ap.save(update_fields=["due_day", "next_due_date", "updated_at"])

        return Response({
            "detail": f"Due day updated to {due_day} for {updated.count()} auto-payment(s).",
            "due_day": due_day,
        })
