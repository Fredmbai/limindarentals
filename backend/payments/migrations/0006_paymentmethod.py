import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0005_update_payment_fee_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentMethod",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "landlord",
                    models.ForeignKey(
                        limit_choices_to={"role": "landlord"},
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="payment_methods",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "method_type",
                    models.CharField(
                        choices=[("TILL", "Till Number"), ("PAYBILL", "Paybill")],
                        max_length=10,
                    ),
                ),
                ("account_number", models.CharField(max_length=20)),
                ("account_name", models.CharField(max_length=100)),
                (
                    "paybill_account_number",
                    models.CharField(
                        blank=True,
                        help_text="Account number / reference for paybill (leave blank for till)",
                        max_length=50,
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("is_default", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "payment_methods",
                "ordering": ["-is_default", "-created_at"],
            },
        ),
    ]
