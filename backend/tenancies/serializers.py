import calendar
from rest_framework import serializers
from django.db import transaction
from django.utils import timezone

from .models import Tenancy, TenancyAgreement
from properties.models import Unit
from properties.serializers import UnitSerializer, PropertyBasicSerializer
from accounts.serializers import UserProfileSerializer


# ──────────────────────────────────────────────
# AGREEMENT SERIALIZER
# ──────────────────────────────────────────────

class TenancyAgreementSerializer(serializers.ModelSerializer):
    """
    Read-only — agreement is auto-generated, never manually created.
    Tenant can view and download this from their dashboard.
    """
    class Meta:
        model  = TenancyAgreement
        fields = [
            "id", "tenant_name", "tenant_phone",
            "landlord_name", "company_name",
            "property_name", "unit_number",
            "rent_amount", "deposit_amount",
            "lease_start_date", "signed_name", "signed_at",
            "agreement_pdf",
        ]
        read_only_fields = fields


# ──────────────────────────────────────────────
# TENANCY SERIALIZERS
# ──────────────────────────────────────────────

class TenancyCreateSerializer(serializers.Serializer):
    """
    Used in Step 3-6 of tenant registration.
    Tenant provides: unit + deposit + lease start + digital signature.

    Why Serializer not ModelSerializer?
    Because creation involves multiple models (Tenancy + Agreement)
    and custom validation logic — a plain Serializer gives us full control.
    """
    unit_id          = serializers.UUIDField()
    deposit_amount   = serializers.DecimalField(max_digits=10, decimal_places=2)
    lease_start_date = serializers.DateField()
    signed_name      = serializers.CharField(max_length=150)
    # signed_name = tenant types their full name as digital signature

    def validate_unit_id(self, value):
        """
        Ensure the unit exists, is vacant, and belongs to the landlord
        the tenant searched for in step 2.
        """
        try:
            unit = Unit.objects.select_related(
                "property", "property__landlord"
            ).get(id=value)
        except Unit.DoesNotExist:
            raise serializers.ValidationError("Unit not found.")

        if unit.status != Unit.Status.VACANT:
            raise serializers.ValidationError(
                "This unit is no longer available."
            )
        return value

    def validate_lease_start_date(self, value):
        """Lease cannot start in the past."""
        if value < timezone.now().date():
            raise serializers.ValidationError(
                "Lease start date cannot be in the past."
            )
        return value

    def validate_signed_name(self, value):
        """
        Digital signature — signed name must match the tenant's full name.
        This makes the agreement legally stronger.
        """
        tenant = self.context["request"].user
        if value.strip().lower() != tenant.full_name.strip().lower():
            raise serializers.ValidationError(
                "Signed name must match your registered full name exactly."
            )
        return value

    @transaction.atomic
    def create(self, validated_data):
        """
        Creates Tenancy + TenancyAgreement together atomically.
        If agreement creation fails, tenancy is rolled back too.
        """
        tenant = self.context["request"].user
        unit   = Unit.objects.select_related(
            "property", "property__landlord",
            "property__landlord__landlord_profile"
        ).get(id=validated_data["unit_id"])

        landlord = unit.property.landlord

        # Create the tenancy — status is PENDING until initial payment
        tenancy = Tenancy.objects.create(
            tenant           = tenant,
            unit             = unit,
            landlord         = landlord,
            lease_start_date = validated_data["lease_start_date"],
            deposit_amount   = validated_data["deposit_amount"],
            rent_snapshot    = unit.rent_amount,   # snapshot current rent
            status           = Tenancy.Status.PENDING,
        )

        # Auto-generate the agreement — snapshot all details at this moment
        landlord_profile = getattr(landlord, "landlord_profile", None)
        TenancyAgreement.objects.create(
            tenancy          = tenancy,
            tenant_name      = tenant.full_name,
            tenant_phone     = tenant.phone,
            tenant_id_number = tenant.national_id or "",
            landlord_name    = landlord.full_name,
            landlord_phone   = landlord.phone,
            company_name     = landlord_profile.company_name if landlord_profile else "",
            property_name    = unit.property.name,
            unit_number      = unit.unit_number,
            rent_amount      = unit.rent_amount,
            deposit_amount   = validated_data["deposit_amount"],
            lease_start_date = validated_data["lease_start_date"],
            signed_name      = validated_data["signed_name"],
        )

        return tenancy

class TenancySerializer(serializers.ModelSerializer):
    unit              = UnitSerializer(read_only=True)
    agreement         = TenancyAgreementSerializer(read_only=True)
    landlord_name     = serializers.CharField(source="landlord.full_name", read_only=True)
    landlord_phone    = serializers.CharField(source="landlord.phone", read_only=True)
    property_name     = serializers.CharField(source="unit.property.name", read_only=True)
    initial_amount_due = serializers.SerializerMethodField()
    payment_status    = serializers.SerializerMethodField()   # ← new
    landlord_settings = serializers.SerializerMethodField()   # ← new

    class Meta:
        model  = Tenancy
        fields = [
            "id", "status",
            "lease_start_date", "rent_snapshot", "deposit_amount",
            "landlord_name", "landlord_phone", "property_name",
            "unit", "agreement", "initial_amount_due",
            "payment_status", "landlord_settings",
            "created_at",
        ]
        read_only_fields = fields

    def get_payment_status(self, obj):
        from django.utils import timezone
        import calendar
        today = timezone.now().date()
        try:
            ups = obj.payment_status
            # If paid_until exists and is in a past month, status is stale → unpaid
            # Keep paid_until for history display (month-by-month coverage needs it)
            if ups.paid_until and ups.paid_until < today.replace(day=1):
                return {
                    "status":      "unpaid",
                    "amount_paid":  0,
                    "balance":      float(obj.rent_snapshot),
                    "period_start": today.replace(day=1).isoformat(),
                    "period_end":   today.replace(day=calendar.monthrange(today.year, today.month)[1]).isoformat(),
                    "paid_until":   ups.paid_until.isoformat(),
                    "is_overdue":   True,
                    "days_overdue": (today - ups.paid_until).days,
                }
            return {
                "status":       ups.status,
                "amount_paid":  float(ups.amount_paid_this_period),
                "balance":      float(ups.balance),
                "period_start": ups.period_start.isoformat() if ups.period_start else None,
                "period_end":   ups.period_end.isoformat()   if ups.period_end   else None,
                "paid_until":   ups.paid_until.isoformat()   if ups.paid_until   else None,
                "is_overdue":   ups.is_overdue,
                "days_overdue": ups.days_overdue,
            }
        except Exception:
            return {
                "status":      "unpaid",
                "amount_paid":  0,
                "balance":      float(obj.rent_snapshot),
                "period_start": None,
                "period_end":   None,
                "paid_until":   None,
                "is_overdue":   False,
                "days_overdue": 0,
            }

    def get_landlord_settings(self, obj):
        """
        Returns payout settings shown to the tenant during payment.
        Resolves per-property override first, falls back to landlord's global settings.
        """
        def _to_dict(s, is_override):
            return {
                "mpesa_type":         s.mpesa_type,
                "paybill_number":     s.paybill_number,
                "till_number":        s.till_number,
                "mpesa_account":      s.mpesa_account,
                "card_enabled":       s.card_enabled,
                "bank_account_name":  s.bank_account_name,
                "bank_name":          s.bank_name,
                "bank_account":       s.bank_account,
                "bank_branch":        s.bank_branch,
                "is_property_override": is_override,
            }
        try:
            # Property-level override takes priority
            prop_settings = obj.unit.property.payout_settings
            return _to_dict(prop_settings, True)
        except Exception:
            pass
        try:
            from notifications.models import LandlordSettings
            s, _ = LandlordSettings.objects.get_or_create(landlord=obj.landlord)
            return _to_dict(s, False)
        except Exception:
            return {}

    def get_initial_amount_due(self, obj):
        import math, calendar
        start = obj.lease_start_date
        days_in_month  = calendar.monthrange(start.year, start.month)[1]
        days_remaining = days_in_month - start.day + 1
        daily_rate     = float(obj.rent_snapshot) / days_in_month
        prorated_rent  = math.ceil(daily_rate * days_remaining)
        return {
            "deposit":       float(obj.deposit_amount),
            "prorated_rent": prorated_rent,
            "total":         float(obj.deposit_amount) + prorated_rent,
        }