import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0006_paymentmethod"),
        ("tenancies", "0003_tenancy_due_day"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AutoPayment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "tenant",
                    models.ForeignKey(
                        limit_choices_to={"role": "tenant"},
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="auto_payments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "tenancy",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="auto_payments",
                        to="tenancies.tenancy",
                    ),
                ),
                (
                    "payment_method",
                    models.CharField(
                        choices=[("MPESA", "M-Pesa"), ("CARD", "Card")],
                        max_length=5,
                    ),
                ),
                ("mpesa_number",   models.CharField(blank=True, max_length=15)),
                ("card_token",     models.CharField(blank=True, max_length=200)),
                ("card_last_four", models.CharField(blank=True, max_length=4)),
                ("due_day",        models.PositiveSmallIntegerField(default=5)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("ACTIVE",    "Active"),
                            ("PAUSED",    "Paused"),
                            ("CANCELLED", "Cancelled"),
                        ],
                        default="ACTIVE",
                        max_length=10,
                    ),
                ),
                ("next_due_date",     models.DateField()),
                ("last_triggered_at", models.DateTimeField(blank=True, null=True)),
                ("created_at",        models.DateTimeField(auto_now_add=True)),
                ("updated_at",        models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "auto_payments",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="autopayment",
            constraint=models.UniqueConstraint(
                condition=models.Q(status__in=["ACTIVE", "PAUSED"]),
                fields=["tenancy"],
                name="unique_active_autopayment_per_tenancy",
            ),
        ),
    ]
