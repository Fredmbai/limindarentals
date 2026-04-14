import json
import logging
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

from .models       import Payment, Receipt, MpesaTransaction
from .serializers  import (
    InitiatePaymentSerializer,
    PaymentSerializer,
    ReceiptSerializer,
    BankProofUploadSerializer,
)
from .utils        import generate_receipt_number, format_phone_for_mpesa
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
    
        payment = Payment.objects.create(
            tenancy      = tenancy,
            amount_due   = amount_due,
            payment_type = payment_type,
            method       = method,
            status       = Payment.Status.PENDING,
            period_start = period_start,
            period_end   = period_end,
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
                    amount      = amount_due,
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
                    amount_kes   = amount_due,
                    email        = tenant.email or "",
                    full_name    = tenant.full_name,
                    phone        = tenant.phone,
                    description  = f"Rent - Unit {tenancy.unit.unit_number}",
                    callback_url = callback_url,
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

                payment.mark_success(
                    transaction_id=mpesa_receipt,
                    amount_paid=amount_paid,
                )
                create_receipt(payment)
                activate_tenancy_if_initial(payment)

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
            payment.mark_success(
                transaction_id=tx_id,
                amount_paid=amount_paid,
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
                        amount_paid = verify["data"]["amount"] // 100
                        payment.mark_success(
                            transaction_id = str(verify["data"]["id"]),
                            amount_paid    = amount_paid,
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