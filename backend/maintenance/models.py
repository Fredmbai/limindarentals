"""
maintenance/models.py
"""
import uuid
from django.db import models
from tenancies.models import Tenancy
from accounts.models import User


class MaintenanceRequest(models.Model):
    """
    Tenant raises a maintenance issue from their dashboard.
    Linked to tenancy (not just user) — so landlord knows exactly
    which unit has the problem.

    Status flow: open → in_progress → resolved
    """

    class Status(models.TextChoices):
        OPEN        = "open",        "Open"
        IN_PROGRESS = "in_progress", "In Progress"
        RESOLVED    = "resolved",    "Resolved"

    class Priority(models.TextChoices):
        LOW    = "low",    "Low"
        MEDIUM = "medium", "Medium"
        HIGH   = "high",   "High"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenancy     = models.ForeignKey(
                      Tenancy,
                      on_delete=models.CASCADE,
                      related_name="maintenance_requests"
                  )
    # Who is handling this? (optional — assigned by landlord/caretaker)
    assigned_to = models.ForeignKey(
                      User,
                      on_delete=models.SET_NULL,
                      null=True,
                      blank=True,
                      related_name="assigned_maintenance"
                  )
    issue       = models.TextField()                          # tenant describes the problem
    priority    = models.CharField(
                      max_length=10,
                      choices=Priority.choices,
                      default=Priority.MEDIUM
                  )
    status      = models.CharField(
                      max_length=15,
                      choices=Status.choices,
                      default=Status.OPEN
                  )
    # Tenant can attach a photo of the problem
    image       = models.ImageField(
                      upload_to="maintenance/",
                      null=True,
                      blank=True
                  )
    # Notes added when resolving
    resolution_notes = models.TextField(blank=True)

    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "maintenance_requests"
        ordering = ["-created_at"]

    def __str__(self):
        unit = self.tenancy.unit.unit_number
        return f"[{self.priority.upper()}] Unit {unit} — {self.issue[:60]}"

    def resolve(self, notes=""):
        """Mark as resolved and record the timestamp."""
        import django.utils.timezone as tz
        self.status           = self.Status.RESOLVED
        self.resolution_notes = notes
        self.resolved_at      = tz.now()
        self.save(update_fields=["status", "resolution_notes", "resolved_at", "updated_at"])