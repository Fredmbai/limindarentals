from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tenancies", "0002_alter_tenancy_tenant"),
    ]

    operations = [
        migrations.AddField(
            model_name="tenancy",
            name="due_day",
            field=models.PositiveSmallIntegerField(default=5),
        ),
    ]
