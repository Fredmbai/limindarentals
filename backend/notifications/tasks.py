from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


@shared_task
def send_rent_reminders():
    """
    Runs daily at 8AM Nairobi time.
    Checks all active tenancies and sends reminders based on due date.
    """
    from tenancies.models import Tenancy
    from payments.models import Payment
    from notifications.service import notify
    from django.conf import settings
    import calendar

    today     = timezone.now().date()
    tenancies = Tenancy.objects.filter(
        status="active"
    ).select_related("tenant", "landlord", "unit", "unit__property")

    for tenancy in tenancies:
        tenant   = tenancy.tenant
        landlord = tenancy.landlord

        # Skip tenancies where user was deleted
        if tenant is None or landlord is None:
            continue

        # Get landlord settings for due day
        try:
            landlord_settings = landlord.settings
            due_day           = landlord_settings.rent_due_day
            grace_days        = landlord_settings.grace_period_days
        except Exception:
            due_day    = 1
            grace_days = 5

        # Calculate this month's due date
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        due_day_safe  = min(due_day, days_in_month)
        try:
            due_date = today.replace(day=due_day_safe)
        except ValueError:
            continue

        unit = tenancy.unit.unit_number
        rent = f"KES {int(float(tenancy.rent_snapshot)):,}"

        # Check if already paid this month (any non-initial payment)
        already_paid = Payment.objects.filter(
            tenancy      = tenancy,
            status       = "success",
            payment_type__in = ["monthly", "1_day", "1_week", "3_months", "6_months"],
            paid_at__year  = today.year,
            paid_at__month = today.month,
        ).exists()

        if already_paid:
            continue  # already paid — no reminder needed

        days_until_due = (due_date - today).days
        days_overdue   = (today - due_date).days

        # 3 days before due — remind tenant
        if days_until_due == 3:
            notify(
                user              = tenant,
                title             = "Rent due in 3 days",
                message           = f"Your rent of {rent} for Unit {unit} is due on {due_date.strftime('%d %b %Y')}. Please pay on time.",
                notification_type = "reminder",
                send_sms_flag     = True,
            )

        # On due date — remind tenant
        elif days_until_due == 0:
            notify(
                user              = tenant,
                title             = "Rent is due today",
                message           = f"Your rent of {rent} for Unit {unit} is due today. Pay now to avoid late charges.",
                notification_type = "reminder",
                send_sms_flag     = True,
            )

        # 5 days overdue — warn tenant + notify landlord
        elif days_overdue == 5:
            notify(
                user              = tenant,
                title             = "Rent overdue — 5 days",
                message           = f"Your rent of {rent} for Unit {unit} is now 5 days overdue. Please pay immediately to avoid further action.",
                notification_type = "reminder",
                send_sms_flag     = True,
            )
            notify(
                user              = landlord,
                title             = f"Overdue rent — Unit {unit} (5 days)",
                message           = f"{tenant.full_name} (Unit {unit}) is 5 days overdue on rent ({rent}). Consider sending a reminder.",
                notification_type = "reminder",
                send_sms_flag     = False,
            )

        # 10 days overdue — escalate
        elif days_overdue == 10:
            notify(
                user              = tenant,
                title             = "Urgent: Rent 10 days overdue",
                message           = f"Your rent of {rent} for Unit {unit} is 10 days overdue. Please contact your landlord immediately.",
                notification_type = "reminder",
                send_sms_flag     = True,
            )
            notify(
                user              = landlord,
                title             = f"Urgent: Overdue rent — Unit {unit} (10 days)",
                message           = f"{tenant.full_name} (Unit {unit}) is 10 days overdue on rent ({rent}). You may need to take action.",
                notification_type = "reminder",
                send_sms_flag     = True,
            )


@shared_task
def send_landlord_collection_reminder():
    """
    Runs on the 5th of every month.
    Reminds landlords to review their rent collection.
    """
    from accounts.models import User
    from notifications.service import notify

    landlords = User.objects.filter(role="landlord", is_active=True, is_approved=True)

    for landlord in landlords:
        notify(
            user              = landlord,
            title             = "Monthly collection reminder",
            message           = "It's time to review your rent collection report. Check who has paid and who hasn't for this month.",
            notification_type = "reminder",
            send_sms_flag     = False,
        )

@shared_task
def reset_expired_payment_statuses():
    """Runs daily at midnight — resets paid status when period_end passes."""
    from payments.utils import reset_expired_statuses
    reset_expired_statuses()