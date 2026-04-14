from django.contrib import admin
from .models import Property, Block, Unit

@admin.register(Property)
class PropertyAdmin(admin.ModelAdmin):
    list_display  = ["name", "landlord", "address", "created_at"]
    search_fields = ["name", "landlord__full_name", "address"]
    list_filter   = ["created_at"]

@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display  = ["name", "property"]
    search_fields = ["name", "property__name"]

@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display  = ["unit_number", "property", "unit_type", "rent_amount", "status"]
    search_fields = ["unit_number", "property__name"]
    list_filter   = ["status", "unit_type"]