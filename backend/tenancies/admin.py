from django.contrib import admin
from .models import Tenancy, TenancyAgreement

@admin.register(Tenancy)
class TenancyAdmin(admin.ModelAdmin):
    list_display  = ["tenant", "unit", "landlord", "status", "lease_start_date"]
    search_fields = ["tenant__full_name", "unit__unit_number"]
    list_filter   = ["status"]

@admin.register(TenancyAgreement)
class TenancyAgreementAdmin(admin.ModelAdmin):
    list_display  = ["tenant_name", "unit_number", "property_name", "signed_at"]
    search_fields = ["tenant_name", "unit_number"]