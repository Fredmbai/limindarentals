import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

app = Celery("lumidahrentals")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

app.conf.beat_schedule = {
    "daily-rent-reminders": {
        "task":     "notifications.tasks.send_rent_reminders",
        "schedule": crontab(hour=8, minute=0),
    },
    "monthly-collection-reminder": {
        "task":     "notifications.tasks.send_landlord_collection_reminder",
        "schedule": crontab(day_of_month=5, hour=9, minute=0),
    },
    "reset-expired-payment-statuses": {
        "task":     "notifications.tasks.reset_expired_payment_statuses",
        "schedule": crontab(hour=0, minute=5),   # 12:05 AM daily
    },
    # Automatic rent collection — runs at 8:00 AM EAT every day
    "trigger-automatic-payments": {
        "task":     "payments.tasks.trigger_automatic_payments",
        "schedule": crontab(hour=8, minute=0),
        "options":  {"timezone": "Africa/Nairobi"},
    },
}
app.conf.timezone = "Africa/Nairobi"