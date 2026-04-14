import uuid
from django.db import models
from accounts.models import User


# ──────────────────────────────────────────────
# PROPERTY — top-level real estate asset
# ──────────────────────────────────────────────

class Property(models.Model):
    """
    A property belongs to a landlord.
    One landlord can own many properties (ForeignKey, not OneToOne).
    Example: "Sunrise Apartments, Karen" or "Kilimani Court"
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    landlord    = models.ForeignKey(
                      User,
                      on_delete=models.CASCADE,
                      related_name="properties",
                      limit_choices_to={"role": "landlord"}   # only landlords can own properties
                  )
    name        = models.CharField(max_length=200)
    address     = models.TextField()
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table  = "properties"
        ordering  = ["name"]
        verbose_name_plural = "properties"

    def __str__(self):
        return f"{self.name} — {self.address}"


# ──────────────────────────────────────────────
# PROPERTY PAYOUT SETTINGS — per-property override
# ──────────────────────────────────────────────

class PropertyPayoutSettings(models.Model):
    """
    Optional per-property payout configuration.
    If this exists for a property, it overrides the landlord's global
    LandlordSettings for all tenants in that property.

    M-Pesa payment is always collected via STK push — this model
    only configures WHERE the money goes (paybill or till number).
    """
    class MpesaType(models.TextChoices):
        PAYBILL = "paybill", "Paybill"
        TILL    = "till",    "Till Number"

    property      = models.OneToOneField(
                        Property,
                        on_delete=models.CASCADE,
                        related_name="payout_settings"
                    )

    # M-Pesa
    mpesa_type        = models.CharField(max_length=10, choices=MpesaType.choices, default=MpesaType.PAYBILL)
    paybill_number    = models.CharField(max_length=20, blank=True)
    till_number       = models.CharField(max_length=20, blank=True)
    mpesa_account     = models.CharField(max_length=50, blank=True,
                            help_text="Account reference tenants type when using paybill")

    # Card
    card_enabled      = models.BooleanField(default=True)

    # Bank transfer
    bank_account_name = models.CharField(max_length=100, blank=True)
    bank_name         = models.CharField(max_length=100, blank=True)
    bank_account      = models.CharField(max_length=50,  blank=True)
    bank_branch       = models.CharField(max_length=100, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "property_payout_settings"

    def __str__(self):
        return f"Payout — {self.property.name}"


# ──────────────────────────────────────────────
# BLOCK / FLOOR — grouping within a property
# ──────────────────────────────────────────────

class Block(models.Model):
    """
    Optional grouping inside a property.
    Use for: Block A / Block B, Floor 1 / Floor 2, Wing East / Wing West.
    A unit can exist without a block (block is nullable on Unit).
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property    = models.ForeignKey(
                      Property,
                      on_delete=models.CASCADE,
                      related_name="blocks"
                  )
    name        = models.CharField(max_length=100)   # e.g. "Block A", "Floor 3"
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "blocks"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} — {self.property.name}"


# ──────────────────────────────────────────────
# UNIT — the rentable space
# ──────────────────────────────────────────────

class Unit(models.Model):
    """
    A unit is a single rentable space: bedsitter, 1-bed, 2-bed, etc.
    Status is the most important field here — drives everything:
    - 'vacant'  → shows up in tenant registration unit picker
    - 'occupied' → hidden from registration, has active tenancy
    """

    class UnitType(models.TextChoices):
        BEDSITTER  = "bedsitter",  "Bedsitter"
        ONE_BED    = "one_bed",    "1 Bedroom"
        TWO_BED    = "two_bed",    "2 Bedroom"
        THREE_BED  = "three_bed",  "3 Bedroom"
        STUDIO     = "studio",     "Studio"
        SHOP       = "shop",       "Shop / Commercial"
        OTHER      = "other",      "Other"

    class Status(models.TextChoices):
        VACANT   = "vacant",   "Vacant"
        OCCUPIED = "occupied", "Occupied"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    property    = models.ForeignKey(
                      Property,
                      on_delete=models.CASCADE,
                      related_name="units"
                  )
    block       = models.ForeignKey(
                      Block,
                      on_delete=models.SET_NULL,   # block deleted → unit still exists
                      related_name="units",
                      null=True,
                      blank=True
                  )
    unit_number = models.CharField(max_length=20)    # e.g. "A1", "101", "GF-03"
    unit_type   = models.CharField(max_length=20, choices=UnitType.choices)
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2)
    status      = models.CharField(
                      max_length=10,
                      choices=Status.choices,
                      default=Status.VACANT
                  )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "units"
        # Prevent duplicate unit numbers within the same property
        unique_together = [["property", "unit_number"]]
        ordering = ["unit_number"]

    def __str__(self):
        return f"Unit {self.unit_number} — {self.property.name} ({self.status})"

    def mark_occupied(self):
        """Called when a tenancy is activated."""
        self.status = self.Status.OCCUPIED
        self.save(update_fields=["status", "updated_at"])

    def mark_vacant(self):
        """Called when a tenancy ends."""
        self.status = self.Status.VACANT
        self.save(update_fields=["status", "updated_at"])