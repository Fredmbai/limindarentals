from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("payments", "0007_autopayment"),
    ]

    operations = [
        migrations.AddField(
            model_name="payment",
            name="is_partial",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="payment",
            name="balance_due",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name="payment",
            name="balance_paid_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="payment",
            name="parent_payment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="balance_payments",
                to="payments.payment",
            ),
        ),
    ]
