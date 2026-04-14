from rest_framework import serializers
from .models import MaintenanceRequest

class MaintenanceRequestSerializer(serializers.ModelSerializer):
    tenancy = serializers.SerializerMethodField()

    class Meta:
        model  = MaintenanceRequest
        fields = [
            "id", "issue", "priority", "status",
            "image", "resolution_notes", "tenancy",
            "created_at", "resolved_at",
        ]
        read_only_fields = ["id", "created_at", "resolved_at"]

    def get_tenancy(self, obj):
        return {
            "tenant_name": obj.tenancy.tenant.full_name,
            "unit_number": obj.tenancy.unit.unit_number,
            "property_name": obj.tenancy.unit.property.name,
        }