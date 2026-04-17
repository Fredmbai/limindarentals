from rest_framework import serializers
from django.utils import timezone
from .models import AutoPayment, Payment, PaymentMethod, Receipt
from .utils import (
    calculate_prorated_rent,
    calculate_period,
)


class InitiatePaymentSerializer(serializers.Serializer):
    """
    Validates payment initiation request from tenant.
    tenancy_id   — which tenancy this payment is for
    payment_type — initial / monthly / custom
    method       — mpesa / card / bank
    period       — only required for custom payments (1_day, 1_week, 3_months, 6_months)
    """
    tenancy_id   = serializers.UUIDField()
    payment_type = serializers.ChoiceField(choices=[
        "initial", "monthly", "1_day", "1_week", "3_months", "6_months", "balance"
    ])
    method       = serializers.ChoiceField(
        choices=Payment.Method.choices
    )
    # Only for custom payments
    period       = serializers.ChoiceField(
        choices=["1_day", "1_week", "3_months", "6_months"],
        required=False,
    )
    # Only for partial monthly payments
    amount       = serializers.DecimalField(
        max_digits=10, decimal_places=2,
        required=False,
    )

    phone = serializers.CharField(required=False, max_length=15)

    def validate(self, attrs):
        from tenancies.models import Tenancy
        try:
            tenancy = Tenancy.objects.select_related("unit").get(
                id     = attrs["tenancy_id"],
                tenant = self.context["request"].user,
            )
        except Tenancy.DoesNotExist:
            raise serializers.ValidationError(
                {"tenancy_id": "Tenancy not found."}
            )
    
        if attrs["payment_type"] == "initial":
            if tenancy.status != "pending":
                raise serializers.ValidationError(
                    {"payment_type": "Initial payment already completed."}
                )
        else:
            if tenancy.status != "active":
                raise serializers.ValidationError(
                    {"payment_type": "Tenancy is not active yet."}
                )
    
        attrs["tenancy"] = tenancy
        return attrs

    def get_amount_due(self) -> int:
        attrs        = self.validated_data
        tenancy      = attrs["tenancy"]
        payment_type = attrs["payment_type"]
        today        = timezone.now().date()
    
        if payment_type == "initial":
            prorated = calculate_prorated_rent(
                tenancy.rent_snapshot,
                tenancy.lease_start_date,
            )
            return int(tenancy.deposit_amount) + prorated
    
        # All other types use calculate_period
        period = calculate_period(payment_type, tenancy.rent_snapshot, today)
        return period["amount_due"]


class PaymentSerializer(serializers.ModelSerializer):
    """
    Read serializer — shows payment details on dashboard.
    """
    tenancy_unit   = serializers.CharField(
        source="tenancy.unit.unit_number", read_only=True
    )
    tenant_name    = serializers.CharField(
        source="tenancy.tenant.full_name", read_only=True
    )
    receipt_number = serializers.CharField(
        source="receipt.receipt_number",
        read_only=True,
        default=None,
    )

    class Meta:
        model  = Payment
        fields = [
            "id", "tenancy", "tenancy_unit", "tenant_name",
            "payment_type", "method", "status",
            "amount_due", "amount_paid", "balance",
            "transaction_id", "period_start", "period_end",
            "due_date", "paid_at", "receipt_number",
            "created_at",
        ]
        read_only_fields = fields


class ReceiptSerializer(serializers.ModelSerializer):
    """
    Receipt serializer — for list and download views.
    """
    tenant_name    = serializers.CharField(
        source="payment.tenancy.tenant.full_name", read_only=True
    )
    unit_number    = serializers.CharField(
        source="payment.tenancy.unit.unit_number", read_only=True
    )
    property_name  = serializers.CharField(
        source="payment.tenancy.unit.property.name", read_only=True
    )
    amount_paid    = serializers.DecimalField(
        source="payment.amount_paid",
        max_digits=10, decimal_places=2,
        read_only=True,
    )
    payment_method = serializers.CharField(
        source="payment.method", read_only=True
    )
    transaction_id = serializers.CharField(
        source="payment.transaction_id", read_only=True
    )

    class Meta:
        model  = Receipt
        fields = [
            "id", "receipt_number", "generated_at",
            "tenant_name", "unit_number", "property_name",
            "amount_paid", "payment_method", "transaction_id",
            "receipt_pdf",
        ]
        read_only_fields = fields


class AutoPaymentSerializer(serializers.ModelSerializer):
    """Read serializer for AutoPayment — never exposes card_token."""
    tenancy_unit     = serializers.CharField(source="tenancy.unit.unit_number",   read_only=True)
    property_name    = serializers.CharField(source="tenancy.unit.property.name", read_only=True)
    rent_amount      = serializers.DecimalField(
        source="tenancy.rent_snapshot", max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model  = AutoPayment
        fields = [
            "id", "tenancy", "tenancy_unit", "property_name", "rent_amount",
            "payment_method", "mpesa_number", "card_last_four",
            "due_day", "status", "next_due_date", "last_triggered_at",
            "created_at",
        ]
        read_only_fields = fields


class AutoPaymentCreateSerializer(serializers.Serializer):
    """
    Validates creation of a new AutoPayment subscription.
    For CARD: card_token (Paystack auth code) + card_last_four are required.
    For MPESA: mpesa_number defaults to tenant's phone if omitted.
    """
    tenancy_id     = serializers.UUIDField()
    payment_method = serializers.ChoiceField(choices=AutoPayment.METHOD_CHOICES)
    mpesa_number   = serializers.CharField(max_length=15, required=False, allow_blank=True)
    card_token     = serializers.CharField(max_length=200, required=False, allow_blank=True)
    card_last_four = serializers.CharField(max_length=4,   required=False, allow_blank=True)

    def validate(self, attrs):
        from tenancies.models import Tenancy
        user = self.context["request"].user
        try:
            tenancy = Tenancy.objects.get(id=attrs["tenancy_id"], tenant=user, status="active")
        except Tenancy.DoesNotExist:
            raise serializers.ValidationError({"tenancy_id": "Active tenancy not found."})

        # Block duplicate active/paused subscriptions
        if AutoPayment.objects.filter(
            tenancy=tenancy,
            status__in=[AutoPayment.STATUS_ACTIVE, AutoPayment.STATUS_PAUSED],
        ).exists():
            raise serializers.ValidationError(
                "An active or paused auto-payment already exists for this tenancy."
            )

        if attrs["payment_method"] == AutoPayment.METHOD_CARD:
            if not attrs.get("card_token"):
                raise serializers.ValidationError({"card_token": "Required for card payments."})
            if not attrs.get("card_last_four"):
                raise serializers.ValidationError({"card_last_four": "Required for card payments."})

        attrs["tenancy"] = tenancy
        return attrs


class BankProofUploadSerializer(serializers.ModelSerializer):
    """
    Tenant uploads bank transfer proof.
    Payment stays pending until landlord manually verifies.
    """
    class Meta:
        model  = Payment
        fields = ["bank_proof"]


class PaymentMethodSerializer(serializers.ModelSerializer):
    """
    CRUD serializer for landlord payment methods (Till / Paybill).
    `landlord` is set automatically from request.user — never from payload.
    """
    class Meta:
        model  = PaymentMethod
        fields = [
            "id", "method_type", "account_number", "account_name",
            "paybill_account_number", "is_active", "is_default",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        method_type = attrs.get("method_type") or (self.instance.method_type if self.instance else None)
        if method_type == PaymentMethod.MethodType.PAYBILL:
            paybill_acc = attrs.get("paybill_account_number", "")
            if self.instance:
                paybill_acc = paybill_acc or self.instance.paybill_account_number
            if not paybill_acc:
                raise serializers.ValidationError(
                    {"paybill_account_number": "Required for Paybill type."}
                )
        return attrs