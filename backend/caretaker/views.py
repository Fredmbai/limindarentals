from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsCaretaker
from tenancies.models import Tenancy
from payments.models import Payment, UnitPaymentStatus
from maintenance.models import MaintenanceRequest
from django.utils import timezone
import calendar


class CaretakerContextView(APIView):
    """
    GET /api/caretaker/context/
    Returns assigned properties + summary for caretaker.
    """
    permission_classes = [IsCaretaker]

    def get(self, request):
        assignments = request.user.caretaker_assignments.select_related(
            "property", "landlord"
        )
        properties = []
        for a in assignments:
            prop = a.property
            tenancies = Tenancy.objects.filter(
                unit__property = prop,
                status         = "active",
            ).select_related(
                "tenant", "unit", "payment_status"
            )
            today = timezone.now().date()

            paid    = 0
            partial = 0
            unpaid  = 0
            overdue = 0

            for t in tenancies:
                try:
                    ups = t.payment_status
                    if ups.paid_until and ups.paid_until < today.replace(day=1):
                        unpaid += 1
                    elif ups.status == "paid" or ups.status == "paid_ahead":
                        paid += 1
                    elif ups.status == "partially_paid":
                        partial += 1
                    else:
                        unpaid += 1
                    if ups.is_overdue:
                        overdue += 1
                except Exception:
                    unpaid += 1

            properties.append({
                "id":            str(prop.id),
                "name":          prop.name,
                "address":       prop.address,
                "landlord_name": a.landlord.full_name,
                "landlord_phone":a.landlord.phone,
                "total_units":   prop.units_count    or 0,
                "occupied":      prop.occupied_count or 0,
                "vacant":        prop.vacant_count   or 0,
                "paid_count":    paid,
                "partial_count": partial,
                "unpaid_count":  unpaid,
                "overdue_count": overdue,
            })

        return Response({"properties": properties})


class CaretakerTenantsView(APIView):
    """
    GET /api/caretaker/tenants/?property_id=xxx
    Returns tenants for caretaker's assigned properties.
    """
    permission_classes = [IsCaretaker]

    def get(self, request):
        property_id = request.query_params.get("property_id")
        assignments = request.user.caretaker_assignments.values_list(
            "property_id", flat=True
        )

        qs = Tenancy.objects.filter(
            unit__property__id__in = assignments,
            status = "active",
        ).select_related(
            "tenant", "unit", "unit__property",
            "unit__block", "payment_status", "agreement",
        ).order_by("unit__unit_number")

        if property_id:
            qs = qs.filter(unit__property__id=property_id)

        today = timezone.now().date()
        result = []

        for t in qs:
            try:
                ups = t.payment_status
                if ups.paid_until and ups.paid_until < today.replace(day=1):
                    pay_status = "unpaid"
                    paid_until = None
                    balance    = float(t.rent_snapshot)
                else:
                    pay_status = ups.status
                    paid_until = ups.paid_until.isoformat() if ups.paid_until else None
                    balance    = float(ups.balance)
                is_overdue    = ups.is_overdue
                days_overdue  = ups.days_overdue
            except Exception:
                pay_status = "unpaid"
                paid_until = None
                balance    = float(t.rent_snapshot)
                is_overdue = False
                days_overdue = 0

            result.append({
                "id":           str(t.id),
                "tenant_name":  t.tenant.full_name,
                "tenant_phone": t.tenant.phone,
                "property":     t.unit.property.name,
                "property_id":  str(t.unit.property.id),
                "unit":         t.unit.unit_number,
                "rent":         float(t.rent_snapshot),
                "lease_start":  t.lease_start_date.isoformat(),
                "pay_status":   pay_status,
                "paid_until":   paid_until,
                "balance":      balance,
                "is_overdue":   is_overdue,
                "days_overdue": days_overdue,
            })

        return Response({"results": result})


class CaretakerMaintenanceView(APIView):
    """
    GET  /api/caretaker/maintenance/
    PATCH /api/caretaker/maintenance/:id/
    """
    permission_classes = [IsCaretaker]

    def get(self, request):
        assignments = request.user.caretaker_assignments.values_list(
            "property_id", flat=True
        )
        requests = MaintenanceRequest.objects.filter(
            tenancy__unit__property__id__in = assignments,
        ).select_related(
            "tenancy", "tenancy__tenant",
            "tenancy__unit", "tenancy__unit__property",
        ).order_by("-created_at")

        status_filter = request.query_params.get("status")
        if status_filter:
            requests = requests.filter(status=status_filter)

        result = [{
            "id":               str(r.id),
            "issue":            r.issue,
            "priority":         r.priority,
            "status":           r.status,
            "resolution_notes": r.resolution_notes,
            "tenant_name":      r.tenancy.tenant.full_name,
            "tenant_phone":     r.tenancy.tenant.phone,
            "unit":             r.tenancy.unit.unit_number,
            "property":         r.tenancy.unit.property.name,
            "created_at":       r.created_at.isoformat(),
            "resolved_at":      r.resolved_at.isoformat() if r.resolved_at else None,
        } for r in requests]

        return Response({"results": result})

    def patch(self, request, pk):
        from django.shortcuts import get_object_or_404
        assignments = request.user.caretaker_assignments.values_list(
            "property_id", flat=True
        )
        req = get_object_or_404(
            MaintenanceRequest,
            id                            = pk,
            tenancy__unit__property__id__in = assignments,
        )
        new_status = request.data.get("status")
        notes      = request.data.get("resolution_notes", "")
        if new_status:
            req.status = new_status
        if notes:
            req.resolution_notes = notes
        if new_status == "resolved":
            req.resolved_at = timezone.now()
            from notifications.service import notify_maintenance_resolved
            notify_maintenance_resolved(req)
        req.save()
        return Response({"detail": "Updated."})


class CaretakerCollectionReportView(APIView):
    """
    GET /api/caretaker/report/?property_id=xxx
    Monthly collection report for caretaker's properties.
    """
    permission_classes = [IsCaretaker]

    def get(self, request):
        property_id = request.query_params.get("property_id")
        assignments = request.user.caretaker_assignments.values_list(
            "property_id", flat=True
        )
        today = timezone.now().date()

        qs = Tenancy.objects.filter(
            unit__property__id__in = assignments,
            status                 = "active",
        ).select_related(
            "tenant", "unit", "unit__property", "payment_status"
        )
        if property_id:
            qs = qs.filter(unit__property__id=property_id)

        paid    = []
        partial = []
        unpaid  = []

        for t in qs:
            rent = float(t.rent_snapshot)
            try:
                ups = t.payment_status
                stale = ups.paid_until and ups.paid_until < today.replace(day=1)
                status = "unpaid" if stale else ups.status
                balance = rent if stale else float(ups.balance)
                paid_until = None if stale else (ups.paid_until.isoformat() if ups.paid_until else None)
                is_overdue = ups.is_overdue if not stale else False
            except Exception:
                status = "unpaid"
                balance = rent
                paid_until = None
                is_overdue = False

            entry = {
                "tenant_name":  t.tenant.full_name,
                "tenant_phone": t.tenant.phone,
                "property":     t.unit.property.name,
                "unit":         t.unit.unit_number,
                "rent":         rent,
                "balance":      balance,
                "paid_until":   paid_until,
                "is_overdue":   is_overdue,
            }
            if status in ("paid", "paid_ahead"):
                paid.append(entry)
            elif status == "partially_paid":
                partial.append(entry)
            else:
                unpaid.append(entry)

        total_expected  = sum(e["rent"]    for e in paid + partial + unpaid)
        total_collected = sum(e["rent"] - e["balance"] for e in paid + partial + unpaid)

        return Response({
            "month":           today.strftime("%B %Y"),
            "paid":            paid,
            "partially_paid":  partial,
            "unpaid":          unpaid,
            "total_expected":  total_expected,
            "total_collected": total_collected,
            "collection_rate": round((total_collected / total_expected * 100) if total_expected else 0, 1),
        })