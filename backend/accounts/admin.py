# ─────────────────────────────────────────────
# accounts/admin.py
# ─────────────────────────────────────────────
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, LandlordProfile, NextOfKin


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display    = ["full_name", "phone", "role", "is_approved", "is_active", "created_at"]
    list_filter     = ["role", "is_approved", "is_active"]
    search_fields   = ["full_name", "phone", "email"]
    ordering        = ["-created_at"]
    actions         = ["approve_landlords"]

    def approve_landlords(self, request, queryset):
        from notifications.models import Notification
        updated = 0
        for user in queryset.filter(role="landlord", is_approved=False):
            user.is_approved = True
            user.save(update_fields=["is_approved"])
            Notification.objects.create(
                user    = user,
                title   = "Account approved",
                message = "Your LumindaRentals landlord account has been approved. You can now log in.",
                notification_type = "general",
            )
            updated += 1
        self.message_user(request, f"{updated} landlord(s) approved successfully.")
    approve_landlords.short_description = "Approve selected landlords"

    fieldsets = (
        (None,            {"fields": ("phone", "password")}),
        ("Personal info", {"fields": ("full_name", "email", "national_id", "role")}),
        ("Status",        {"fields": ("is_active", "is_approved", "is_staff", "is_superuser")}),
        ("Timestamps",    {"fields": ("created_at", "updated_at")}),
    )
    readonly_fields = ["created_at", "updated_at"]

    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields":  ("phone", "full_name", "role", "password1", "password2"),
        }),
    )

@admin.register(LandlordProfile)
class LandlordProfileAdmin(admin.ModelAdmin):
    list_display  = ["user", "company_name", "kra_pin"]
    search_fields = ["company_name", "user__full_name", "user__phone"]


@admin.register(NextOfKin)
class NextOfKinAdmin(admin.ModelAdmin):
    list_display  = ["tenant", "full_name", "relationship", "phone"]
    search_fields = ["full_name", "tenant__full_name", "tenant__phone"]