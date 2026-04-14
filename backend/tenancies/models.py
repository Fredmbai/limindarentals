import uuid
from django.db import models
from accounts.models import User
from properties.models import Unit
from django.db import transaction

# ──────────────────────────────────────────────
# TENANCY — the core of the entire system
# ──────────────────────────────────────────────

class Tenancy(models.Model):
    """
    THE most important model in the system.
    Represents the relationship between a tenant and a unit.

    Lifecycle:
      pending  → tenant registered, initial payment NOT yet made
      active   → initial payment confirmed, tenant is in the unit
      ended    → tenancy terminated (tenant moved out, evicted, etc.)

    Why rent_snapshot?
      Rent can change over time. We store the rent at the time of tenancy
      creation so historical payments reflect the correct amount.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE  = "active",  "Active"
        ENDED   = "ended",   "Ended"

    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant           = models.ForeignKey(
                           User,
                           on_delete=models.SET_NULL,
                           null=True,
                           blank=True,
                           related_name="tenancies",
                           limit_choices_to={"role": "tenant"}
                       )
    unit             = models.ForeignKey(
                           Unit,
                           on_delete=models.PROTECT,    # protect: can't delete a unit with a tenancy
                           related_name="tenancies"
                       )
    landlord         = models.ForeignKey(
                           User,
                           on_delete=models.PROTECT,
                           related_name="managed_tenancies",
                           limit_choices_to={"role": "landlord"}
                       )
    lease_start_date = models.DateField()
    status           = models.CharField(
                           max_length=10,
                           choices=Status.choices,
                           default=Status.PENDING
                       )
    # Snapshot the rent at time of signing — protects against future rent changes
    rent_snapshot    = models.DecimalField(max_digits=10, decimal_places=2)
    deposit_amount   = models.DecimalField(max_digits=10, decimal_places=2)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tenancies"
        ordering = ["-created_at"]
        # A unit can only have ONE active or pending tenancy at a time
        # (multiple ended tenancies are fine — they're history)
        constraints = [
            models.UniqueConstraint(
                fields=["unit"],
                condition=models.Q(status__in=["pending", "active"]),
                name="unique_active_tenancy_per_unit"
            )
        ]

    def __str__(self):
        return f"{self.tenant.full_name} → Unit {self.unit.unit_number} ({self.status})"

    def activate(self):
        """
        Called after initial payment is verified.
        Activates tenancy AND marks the unit as occupied — always together.
        """
        from django.db import transaction
        with transaction.atomic():
            self.status = self.Status.ACTIVE
            self.save(update_fields=["status", "updated_at"])
            self.unit.mark_occupied()

    @transaction.atomic
    def end_tenancy(self):
        from properties.models import Unit
        self.status = self.Status.ENDED
        self.save(update_fields=["status"])
        # Mark unit as vacant so other tenants can see and take it
        self.unit.status = Unit.Status.VACANT
        self.unit.save(update_fields=["status"])
        # Reset payment status
        try:
            ups = self.payment_status
            ups.status               = "unpaid"
            ups.amount_paid_this_period = 0
            ups.balance              = self.rent_snapshot
            ups.period_start         = None
            ups.period_end           = None
            ups.paid_until           = None
            ups.save()
        except Exception:
            pass


# ──────────────────────────────────────────────
# TENANCY AGREEMENT — digital contract
# ──────────────────────────────────────────────

class TenancyAgreement(models.Model):
    """
    Auto-generated when tenancy is created (Step 5 in your spec).
    Stores the signed agreement as a snapshot — even if landlord/tenant
    details change later, the original agreement is preserved.

    signed_name   = tenant typed their name as digital signature
    signed_at     = timestamp of signing
    agreement_pdf = optional: store generated PDF here
    """
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenancy      = models.OneToOneField(
                       Tenancy,
                       on_delete=models.CASCADE,
                       related_name="agreement"
                   )
    # Snapshot of all parties at time of signing
    tenant_name      = models.CharField(max_length=150)
    tenant_phone     = models.CharField(max_length=15)
    tenant_id_number = models.CharField(max_length=20)
    landlord_name    = models.CharField(max_length=150)
    landlord_phone   = models.CharField(max_length=15)
    company_name     = models.CharField(max_length=200, blank=True)
    property_name    = models.CharField(max_length=200)
    unit_number      = models.CharField(max_length=20)
    rent_amount      = models.DecimalField(max_digits=10, decimal_places=2)
    deposit_amount   = models.DecimalField(max_digits=10, decimal_places=2)
    lease_start_date = models.DateField()

    # Digital signature
    signed_name  = models.CharField(max_length=150)   # tenant typed their name
    signed_at    = models.DateTimeField(auto_now_add=True)

    # PDF file (stored in media/agreements/)
    agreement_pdf = models.FileField(
                        upload_to="agreements/",
                        null=True,
                        blank=True
                    )

    class Meta:
        db_table = "tenancy_agreements"

    def __str__(self):
        return f"Agreement — {self.tenant_name} / Unit {self.unit_number}"