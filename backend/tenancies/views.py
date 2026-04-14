from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from django.db import transaction

from accounts.models import User
from .models import Tenancy, TenancyAgreement
from .serializers import TenancyCreateSerializer, TenancySerializer
from accounts.permissions import IsLandlord, IsTenant, IsLandlordOrCaretaker


# ──────────────────────────────────────────────
# TENANT VIEWS
# ──────────────────────────────────────────────

class MyTenanciesView(generics.ListAPIView):
    """
    GET /api/tenancies/my/

    Tenant sees all their own tenancies — supports multi-tenancy.
    One tenant can have multiple active tenancies (multiple units).
    Ordered by most recently created.
    """
    serializer_class   = TenancySerializer
    permission_classes = [IsTenant]

    def get_queryset(self):
        return Tenancy.objects.filter(
            tenant=self.request.user
        ).select_related(
            "unit", "unit__property", "unit__block",
            "landlord", "landlord__landlord_profile",
            "agreement",
        ).order_by("-created_at")


class CreateTenancyView(generics.CreateAPIView):
    """
    POST /api/tenancies/create/

    Steps 3-6 of tenant registration.
    Tenant selects a unit and signs the agreement.
    Creates tenancy with status=PENDING.
    Status becomes ACTIVE only after initial payment is confirmed.
    """
    serializer_class   = TenancyCreateSerializer
    permission_classes = [IsTenant]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tenancy = serializer.save()

        # Notify landlord of new tenancy
        from notifications.service import notify_tenancy_created
        notify_tenancy_created(tenancy)

        return Response(
            TenancySerializer(tenancy, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TenancyDetailView(generics.RetrieveAPIView):
    """
    GET /api/tenancies/:id/

    Tenant can view their own tenancy.
    Landlord can view any tenancy under their properties.
    """
    serializer_class   = TenancySerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        tenancy = get_object_or_404(Tenancy, id=self.kwargs["pk"])

        # Tenant can only see their own tenancy
        if self.request.user.is_tenant:
            if tenancy.tenant != self.request.user:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    "You do not have access to this tenancy."
                )

        # Landlord can only see tenancies under their properties
        if self.request.user.is_landlord:
            if tenancy.landlord != self.request.user:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(
                    "You do not have access to this tenancy."
                )

        return tenancy


# ──────────────────────────────────────────────
# LANDLORD VIEWS
# ──────────────────────────────────────────────

class LandlordTenanciesView(generics.ListAPIView):
    """
    GET /api/tenancies/landlord/
    GET /api/tenancies/landlord/?status=active
    GET /api/tenancies/landlord/?status=pending

    Landlord sees all tenancies across all their properties.
    Supports filtering by status.
    """
    serializer_class   = TenancySerializer
    permission_classes = [IsLandlordOrCaretaker]

    def get_queryset(self):
        qs = Tenancy.objects.filter(
            landlord=self.request.user
        ).select_related(
            "unit", "unit__property", "unit__block",
            "tenant", "agreement",
        ).order_by("-created_at")

        # Optional status filter: ?status=active / pending / ended
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        return qs


class EndTenancyView(APIView):
    """
    POST /api/tenancies/:id/end/

    Landlord ends a tenancy — works for both ACTIVE and PENDING tenancies.
    Marks tenancy as ENDED and frees the unit.
    """
    permission_classes = [IsLandlord]

    def post(self, request, pk):
        tenancy = get_object_or_404(
            Tenancy,
            id           = pk,
            landlord     = request.user,
            status__in   = [Tenancy.Status.ACTIVE, Tenancy.Status.PENDING],
        )
        tenancy.end_tenancy()
        return Response(
            {"detail": "Tenancy ended. Unit is now vacant."},
            status=status.HTTP_200_OK,
        )

class EndMyTenancyView(APIView):
    """POST /api/tenancies/:id/end-self/ — tenant ends their own tenancy"""
    permission_classes = [IsTenant]

    @transaction.atomic
    def post(self, request, pk):
        try:
            tenancy = Tenancy.objects.get(
                id     = pk,
                tenant = request.user,
                status__in = ["active", "pending"],
            )
        except Tenancy.DoesNotExist:
            return Response({"detail": "Tenancy not found."}, status=404)

        tenancy.end_tenancy()

        # Notify landlord
        from notifications.service import notify
        notify(
            user              = tenancy.landlord,
            title             = f"Tenant ended tenancy — Unit {tenancy.unit.unit_number}",
            message           = f"{request.user.full_name} has ended their tenancy for Unit {tenancy.unit.unit_number} at {tenancy.unit.property.name}.",
            notification_type = "tenancy",
        )
        return Response({"detail": "Tenancy ended successfully."})


class ChangeRentalUnitView(APIView):
    permission_classes = [IsTenant]

    @transaction.atomic
    def post(self, request, pk):
        new_unit_id = request.data.get("unit_id")
        if not new_unit_id:
            return Response({"detail": "unit_id is required."}, status=400)

        try:
            tenancy = Tenancy.objects.get(
                id     = pk,
                tenant = request.user,
                status = "active",
            )
        except Tenancy.DoesNotExist:
            return Response({"detail": "Active tenancy not found."}, status=404)

        from properties.models import Unit
        try:
            # Search across ALL properties owned by the same landlord
            new_unit = Unit.objects.get(
                id                 = new_unit_id,
                status             = Unit.Status.VACANT,
                property__landlord = tenancy.landlord,
            )
        except Unit.DoesNotExist:
            return Response(
                {"detail": "Unit not found or not vacant."},
                status=404,
            )

        # Cannot move to same unit
        if new_unit.id == tenancy.unit.id:
            return Response({"detail": "You are already in this unit."}, status=400)

        old_unit = tenancy.unit

        # Free old unit
        old_unit.status = Unit.Status.VACANT
        old_unit.save(update_fields=["status"])

        # Assign new unit
        tenancy.unit          = new_unit
        tenancy.rent_snapshot = new_unit.rent_amount
        tenancy.save(update_fields=["unit", "rent_snapshot"])

        # Occupy new unit
        new_unit.status = Unit.Status.OCCUPIED
        new_unit.save(update_fields=["status"])

        # Notify landlord
        from notifications.service import notify
        notify(
            user              = tenancy.landlord,
            title             = f"Unit transfer — {old_unit.unit_number} → {new_unit.unit_number}",
            message           = f"{request.user.full_name} has moved from Unit {old_unit.unit_number} to Unit {new_unit.unit_number}.",
            notification_type = "tenancy",
            send_sms_flag     = False,
        )
        return Response({
            "detail":      f"Successfully moved to Unit {new_unit.unit_number}.",
            "new_unit":    new_unit.unit_number,
            "new_rent":    str(new_unit.rent_amount),
        })

class DeleteMyAccountView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request):
        user = request.user

        try:
            from tenancies.models import Tenancy
            from properties.models import Unit
            from notifications.service import notify

            # Step 1 — End tenancies and free units BEFORE deletion.
            # Must call end_tenancy() — not just free the unit — because the
            # unique_active_tenancy_per_unit constraint checks status, not tenant.
            # If we only free the unit but leave status as pending/active, the
            # constraint will block new tenants from taking that unit.
            active_tenancies = Tenancy.objects.filter(
                tenant     = user,
                status__in = ["active", "pending"],
            ).select_related("unit", "landlord", "unit__property")

            for t in active_tenancies:
                try:
                    unit_number   = t.unit.unit_number
                    property_name = t.unit.property.name
                    landlord      = t.landlord
                    # end_tenancy() sets status=ENDED and marks unit as VACANT
                    t.end_tenancy()
                    # Notify landlord
                    notify(
                        user              = landlord,
                        title             = f"Tenant deleted account — Unit {unit_number}",
                        message           = f"{user.full_name} deleted their LumindaRentals account. Unit {unit_number} at {property_name} is now vacant.",
                        notification_type = "tenancy",
                        send_sms_flag     = False,
                    )
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).error(f"Pre-delete error: {e}")

            # Step 2 — Delete the user
            # With SET_NULL on Tenancy.tenant, Django will null out
            # the FK automatically — no ProtectedError
            user.delete()

            return Response(
                {"detail": "Account deleted successfully."},
                status=200,
            )

        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Delete account error: {e}")
            return Response(
                {"detail": f"Failed to delete account: {str(e)}"},
                status=500,
            )
    
class TenancyAvailableUnitsView(APIView):
    """
    GET /api/tenancies/:id/available-units/
    Returns vacant units under the same landlord as this tenancy.
    """
    permission_classes = [IsTenant]

    def get(self, request, pk):
        try:
            tenancy = Tenancy.objects.get(id=pk, tenant=request.user, status="active")
        except Tenancy.DoesNotExist:
            return Response({"detail": "Tenancy not found."}, status=404)

        from properties.models import Unit
        from properties.serializers import UnitVacantSerializer

        units = Unit.objects.filter(
            property__landlord = tenancy.landlord,
            status             = Unit.Status.VACANT,
        ).exclude(
            id = tenancy.unit.id
        ).select_related("property", "block").order_by(
            "property__name", "unit_number"
        )

        serializer = UnitVacantSerializer(units, many=True)
        return Response({"results": serializer.data})
    
class AddTenantByStaffView(APIView):
    """
    POST /api/tenancies/add-tenant/
    Landlord or caretaker manually adds a tenant.
    """
    permission_classes = [IsLandlordOrCaretaker]

    @transaction.atomic
    def post(self, request):
        from accounts.models import User, NextOfKin
        from properties.models import Unit
        from payments.models import UnitPaymentStatus
        import calendar
        from datetime import datetime
        from decimal import Decimal
        import math

        d = request.data

        # ── Pull fields ──────────────────────────
        full_name        = (d.get("full_name")        or "").strip()
        phone            = (d.get("phone")            or "").strip()
        national_id      = (d.get("national_id")      or "").strip()
        unit_id          = d.get("unit_id")
        deposit_amount   = d.get("deposit_amount")
        lease_start_date = (d.get("lease_start_date") or "").strip()
        signed_name      = (d.get("signed_name")      or "").strip()
        has_paid_initial = bool(d.get("has_paid_initial", False))
        paid_until_str   = (d.get("paid_until")       or "").strip() or None
        custom_password  = (d.get("password")         or "").strip()

        # next of kin
        kin_name         = (d.get("kin_name")         or "").strip()
        kin_relationship = (d.get("kin_relationship") or "").strip()
        kin_phone        = (d.get("kin_phone")        or "").strip()
        kin_email        = (d.get("kin_email")        or "").strip() or None

        # ── Validate ─────────────────────────────
        missing = []
        if not full_name:        missing.append("full_name")
        if not phone:            missing.append("phone")
        if not national_id:      missing.append("national_id")
        if not unit_id:          missing.append("unit_id")
        if not deposit_amount:   missing.append("deposit_amount")
        if not lease_start_date: missing.append("lease_start_date")
        if not signed_name:      missing.append("signed_name")
        if missing:
            return Response(
                {"detail": f"Missing required fields: {', '.join(missing)}"},
                status=400,
            )

        # ── Validate unit ────────────────────────
        try:
            if request.user.role == "landlord":
                unit = Unit.objects.get(
                    id                 = unit_id,
                    property__landlord = request.user,
                )
            else:
                assigned = request.user.caretaker_assignments.values_list(
                    "property_id", flat=True
                )
                unit = Unit.objects.get(
                    id                   = unit_id,
                    property__id__in     = assigned,
                )
        except Unit.DoesNotExist:
            return Response({"detail": "Unit not found."}, status=404)

        if unit.status != Unit.Status.VACANT:
            return Response(
                {"detail": f"Unit {unit.unit_number} is not vacant."},
                status=400,
            )

        landlord = unit.property.landlord

        # ── Parse lease start ────────────────────
        try:
            lease_start = datetime.strptime(lease_start_date, "%Y-%m-%d").date()
        except ValueError:
            return Response(
                {"detail": "Invalid lease_start_date format. Use YYYY-MM-DD."},
                status=400,
            )

        # ── Get or create tenant ─────────────────
        is_new_user     = False
        actual_password = None

        existing = User.objects.filter(phone=phone).first()
        if existing:
            if existing.role != User.Role.TENANT:
                return Response(
                    {"detail": f"A user with phone {phone} exists but is a {existing.role}."},
                    status=400,
                )
            tenant = existing
        else:
            is_new_user = True
            # Simple auto password: last 4 digits of phone + "rent"
            actual_password = custom_password if len(custom_password) >= 8 else f"{phone[-4:]}rent"
            tenant = User.objects.create_user(
                phone       = phone,
                full_name   = full_name,
                national_id = national_id,
                email       = (d.get("email") or "").strip() or None,
                password    = actual_password,
                role        = User.Role.TENANT,
                is_approved = True,
            )
            if kin_name and kin_phone:
                NextOfKin.objects.create(
                    tenant         = tenant,
                    full_name    = kin_name,
                    relationship = kin_relationship or "Other",
                    phone        = kin_phone,
                    email        = kin_email,
                )

        # ── Create tenancy ────────────────────────
        tenancy = Tenancy.objects.create(
            tenant           = tenant,
            landlord         = landlord,
            unit             = unit,
            rent_snapshot    = unit.rent_amount,
            deposit_amount   = Decimal(str(deposit_amount)),
            lease_start_date = lease_start,
            status           = Tenancy.Status.PENDING,
        )

        # ── Create agreement ──────────────────────
        TenancyAgreement.objects.create(
            tenancy          = tenancy,
            tenant_name      = full_name,
            tenant_phone     = phone,
            tenant_id_number = national_id,
            signed_name      = signed_name,
            rent_amount      = unit.rent_amount,
            deposit_amount   = Decimal(str(deposit_amount)),
            lease_start_date = lease_start,
        )

        # ── Occupy unit ───────────────────────────
        unit.mark_occupied()

        # ── Handle initial payment ────────────────
        if has_paid_initial:
            from payments.models import Payment, Receipt
            from payments.utils import (
                update_unit_payment_status,
                generate_receipt_number,
            )
            from django.utils import timezone as tz

            days_in_month  = calendar.monthrange(lease_start.year, lease_start.month)[1]
            days_remaining = days_in_month - lease_start.day + 1
            daily_rate     = Decimal(str(unit.rent_amount)) / Decimal(days_in_month)
            prorated_rent  = math.ceil(daily_rate * days_remaining)
            total_initial  = Decimal(str(deposit_amount)) + Decimal(str(prorated_rent))

            # Activate tenancy
            tenancy.status = Tenancy.Status.ACTIVE
            tenancy.save(update_fields=["status"])

            # Create payment record
            period_end = lease_start.replace(day=days_in_month)
            payment = Payment.objects.create(
                tenancy      = tenancy,
                amount_due   = total_initial,
                amount_paid  = total_initial,
                payment_type = Payment.PaymentType.INITIAL,
                method       = Payment.Method.BANK,
                status       = Payment.Status.SUCCESS,
                period_start = lease_start,
                period_end   = period_end,
                paid_at      = tz.now(),
            )

            # Receipt
            receipt = Receipt.objects.create(
                payment        = payment,
                receipt_number = generate_receipt_number(),
            )
            try:
                from payments.receipt_generator import generate_receipt_pdf
                pdf = generate_receipt_pdf(receipt)
                receipt.receipt_pdf.save(pdf.name, pdf, save=True)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"PDF failed: {e}")

            # Update payment status
            ups = update_unit_payment_status(payment)

            # Override paid_until if specified
            if paid_until_str:
                try:
                    paid_until_date = datetime.strptime(paid_until_str, "%Y-%m-%d").date()
                    ups.paid_until = paid_until_date
                    from payments.models import UnitPaymentStatus as UPS
                    ups.status = (
                        UPS.PayStatus.PAID_AHEAD
                        if paid_until_date > period_end
                        else UPS.PayStatus.PAID
                    )
                    ups.save(update_fields=["paid_until", "status", "updated_at"])
                except ValueError:
                    pass

        # ── Notify tenant ─────────────────────────
        try:
            from notifications.service import notify
            notify(
                user              = tenant,
                title             = "Welcome to LumindaRentals",
                message           = f"Your tenancy for Unit {unit.unit_number} at {unit.property.name} is set up.",
                notification_type = "tenancy",
                send_sms_flag     = False,
            )
        except Exception:
            pass

        return Response({
            "detail":     "Tenant added successfully.",
            "tenancy_id": str(tenancy.id),
            "tenant_id":  str(tenant.id),
            "tenant_name": tenant.full_name,
            "unit":        unit.unit_number,
            "status":      tenancy.status,
            "is_new_user": is_new_user,
            "login_credentials": {
                "phone":    phone,
                "password": actual_password,
            } if is_new_user else None,
        }, status=201)
    
class PropertyTenantsView(APIView):
    """
    GET /api/tenancies/property/:property_id/tenants/
    Returns active tenants for a specific property (for landlord notification UI).
    """
    permission_classes = [IsLandlord]

    def get(self, request, property_id):
        tenancies = Tenancy.objects.filter(
            unit__property__id = property_id,
            landlord           = request.user,
            status             = "active",
        ).select_related("tenant", "unit", "agreement")

        result = [{
            "tenancy_id":   str(t.id),
            "tenant_name":  t.tenant.full_name,
            "tenant_phone": t.tenant.phone,
            "unit":         t.unit.unit_number,
        } for t in tenancies]

        return Response({"results": result})