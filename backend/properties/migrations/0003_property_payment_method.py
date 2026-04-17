import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("properties", "0002_property_payout_settings"),
        ("payments", "0006_paymentmethod"),
    ]

    operations = [
        migrations.AddField(
            model_name="property",
            name="payment_method",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="properties",
                to="payments.paymentmethod",
            ),
        ),
    ]
