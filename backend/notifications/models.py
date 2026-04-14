"""
notifications/models.py
"""
import uuid
from django.db import models
from accounts.models import User


class PushSubscription(models.Model):
    """
    Stores a browser push subscription per device per user.
    One user can have multiple subscriptions (phone + laptop + tablet).
    Stale subscriptions (410/404 from push service) are deleted automatically.
    """
    user      = models.ForeignKey(User, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint  = models.TextField(unique=True)
    p256dh    = models.TextField()
    auth      = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "push_subscriptions"

    def __str__(self):
        return f"{self.user.full_name} — {self.endpoint[:60]}"


class Notification(models.Model):
    """
    In-app notifications for all user types.
    Examples:
    - "Your payment of KES 12,000 was received."
    - "Rent is due in 3 days."
    - "Maintenance request #5 has been resolved."

    notification_type is used on the frontend to show the right icon/color.
    """

    class NotificationType(models.TextChoices):
        PAYMENT    = "payment",    "Payment"
        REMINDER   = "reminder",   "Reminder"
        MAINTENANCE= "maintenance","Maintenance"
        TENANCY    = "tenancy",    "Tenancy"
        GENERAL    = "general",    "General"

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user                = models.ForeignKey(
                              User,
                              on_delete=models.CASCADE,
                              related_name="notifications"
                          )
    title               = models.CharField(max_length=150)
    message             = models.TextField()
    notification_type   = models.CharField(
                              max_length=20,
                              choices=NotificationType.choices,
                              default=NotificationType.GENERAL
                          )
    # Optional: link the notification to the relevant object
    # e.g. payment_id so frontend can navigate to the payment on click
    related_object_id   = models.UUIDField(null=True, blank=True)
    related_object_type = models.CharField(max_length=50, blank=True)  # "payment", "maintenance"

    is_read    = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        ordering = ["-created_at"]

    def __str__(self):
        read_status = "read" if self.is_read else "unread"
        return f"[{read_status}] {self.user.full_name} — {self.title}"

    def mark_read(self):
        self.is_read = True
        self.save(update_fields=["is_read"])


# ═══════════════════════════════════════════════════════
# LandlordSettings — this lives in the properties app
# but kept here for completeness in one reference file
# ═══════════════════════════════════════════════════════

"""
properties/landlord_settings.py  (add to properties app)
"""

class LandlordSettings(models.Model):
    """
    Per-landlord configuration.
    M-Pesa paybill/till, bank details, rent due day, penalty rules.
    OneToOne with User (landlord).
    """
    landlord      = models.OneToOneField(
                        User,
                        on_delete=models.CASCADE,
                        related_name="settings",
                        limit_choices_to={"role": "landlord"}
                    )

    # M-Pesa destination — STK push is ALWAYS used to collect payment;
    # this field says WHERE the money is sent (paybill or till).
    class MpesaType(models.TextChoices):
        PAYBILL = "paybill", "Paybill"
        TILL    = "till",    "Till Number"

    mpesa_type     = models.CharField(
                         max_length=10,
                         choices=MpesaType.choices,
                         default=MpesaType.PAYBILL,
                         help_text="M-Pesa destination: paybill or till number"
                     )
    paybill_number = models.CharField(max_length=20, blank=True)
    till_number    = models.CharField(max_length=20, blank=True)
    mpesa_account  = models.CharField(
                         max_length=50,
                         blank=True,
                         help_text="Account reference tenants type when using paybill"
                     )

    # Bank transfer
    bank_account_name = models.CharField(max_length=100, blank=True,
                            help_text="Name on the bank account (as it appears on the statement)")
    bank_name      = models.CharField(max_length=100, blank=True)
    bank_account   = models.CharField(max_length=50, blank=True)
    bank_branch    = models.CharField(max_length=100, blank=True)

    # Card — enable/disable card payments for tenants
    card_enabled   = models.BooleanField(
                         default=True,
                         help_text="Allow tenants to pay via card (Paystack)"
                     )

    # Rent rules
    rent_due_day   = models.PositiveSmallIntegerField(
                         default=1,
                         help_text="Day of month rent is due (1–28)"
                     )
    grace_period_days = models.PositiveSmallIntegerField(
                            default=5,
                            help_text="Days after due date before penalty kicks in"
                        )
    penalty_type   = models.CharField(
                         max_length=10,
                         choices=[("fixed", "Fixed Amount"), ("percent", "Percentage")],
                         default="fixed"
                     )
    penalty_value  = models.DecimalField(
                         max_digits=8,
                         decimal_places=2,
                         default=0,
                         help_text="Amount (KES) or % depending on penalty_type"
                     )

    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "landlord_settings"

    def __str__(self):
        return f"Settings — {self.landlord.full_name}"