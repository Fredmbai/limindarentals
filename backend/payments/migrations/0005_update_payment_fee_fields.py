from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0004_add_platform_fee"),
    ]

    operations = [
        # Remove old 0.3% fee field
        migrations.RemoveField(
            model_name="payment",
            name="platform_fee",
        ),
        # 2% platform fee (M-Pesa only, deducted from rent before landlord disbursement)
        migrations.AddField(
            model_name="payment",
            name="platform_fee_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        # Safaricom B2B transfer fee (tiered, deducted alongside platform fee)
        migrations.AddField(
            model_name="payment",
            name="b2b_fee_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        # 2.6% card surcharge added on top of rent for Paystack payments
        migrations.AddField(
            model_name="payment",
            name="card_surcharge_amount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        # Disbursement tracking fields for M-Pesa B2B payout to landlord
        migrations.AddField(
            model_name="payment",
            name="disbursement_status",
            field=models.CharField(
                blank=True,
                choices=[("pending", "Pending"), ("success", "Success"), ("failed", "Failed")],
                max_length=10,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="payment",
            name="disbursement_reference",
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name="payment",
            name="disbursed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
