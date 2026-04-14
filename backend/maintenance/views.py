from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer
from accounts.permissions import IsTenant,IsLandlord, IsLandlordOrCaretaker

class MaintenanceListCreateView(generics.ListCreateAPIView):
    serializer_class   = MaintenanceRequestSerializer
    permission_classes = [IsTenant]

    def get_queryset(self):
        return MaintenanceRequest.objects.filter(
            tenancy__tenant=self.request.user
        ).order_by("-created_at")

    def perform_create(self, serializer):
        from tenancies.models import Tenancy
        from notifications.service import notify_maintenance_created
        tenancy = Tenancy.objects.get(
            id     = self.request.data.get("tenancy_id"),
            tenant = self.request.user,
        )
        request = serializer.save(tenancy=tenancy)
        notify_maintenance_created(request)

class LandlordMaintenanceView(generics.ListAPIView):
    serializer_class   = MaintenanceRequestSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        qs = MaintenanceRequest.objects.filter(
            tenancy__landlord=self.request.user
        ).select_related(
            "tenancy", "tenancy__unit",
            "tenancy__tenant",
        ).order_by("-created_at")

        status = self.request.query_params.get("status")
        if status:
            qs = qs.filter(status=status)
        return qs

class MaintenanceUpdateView(generics.UpdateAPIView):
    serializer_class   = MaintenanceRequestSerializer
    permission_classes = [IsLandlordOrCaretaker]

    def get_object(self):
        return get_object_or_404(
            MaintenanceRequest,
            id                = self.kwargs["pk"],
            tenancy__landlord = self.request.user,
        )

    def perform_update(self, serializer):
        from notifications.service import notify_maintenance_resolved
        instance = serializer.save()
        if instance.status == "resolved":
            notify_maintenance_resolved(instance)