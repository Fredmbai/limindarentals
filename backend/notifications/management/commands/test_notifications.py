"""
Management command to test the notification system.

Usage:
  # Test SMS to a specific phone number
  python manage.py test_notifications --sms +254712345678

  # Dry-run the rent reminder task (shows what would be sent, no actual send)
  python manage.py test_notifications --rent-reminders --dry-run

  # Actually run the rent reminder task (sends in-app + SMS)
  python manage.py test_notifications --rent-reminders

  # Run the monthly landlord collection reminder
  python manage.py test_notifications --collection-reminder

  # Run all tasks
  python manage.py test_notifications --all
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
import calendar


class Command(BaseCommand):
    help = "Test the notification and SMS system"

    def add_arguments(self, parser):
        parser.add_argument("--sms",               type=str, help="Send a test SMS to this phone number (e.g. +254712345678)")
        parser.add_argument("--rent-reminders",    action="store_true", help="Run the rent reminder task now")
        parser.add_argument("--collection-reminder", action="store_true", help="Run the landlord collection reminder now")
        parser.add_argument("--all",               action="store_true", help="Run all tasks")
        parser.add_argument("--dry-run",           action="store_true", help="Show what would be sent without sending anything")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if options["sms"]:
            self._test_sms(options["sms"])

        if options["rent_reminders"] or options["all"]:
            self._run_rent_reminders(dry_run)

        if options["collection_reminder"] or options["all"]:
            self._run_collection_reminder(dry_run)

        if not any([options["sms"], options["rent_reminders"], options["collection_reminder"], options["all"]]):
            self.stdout.write(self.style.WARNING(
                "No action specified. Use --sms, --rent-reminders, --collection-reminder, or --all"
            ))

    # ── SMS test ─────────────────────────────────────────────────────────────

    def _test_sms(self, phone: str):
        from notifications.sms import send_sms
        from django.conf import settings

        self.stdout.write(f"\n--- SMS Test ---")
        self.stdout.write(f"AT_USERNAME : {settings.AT_USERNAME}")
        self.stdout.write(f"AT_SENDER_ID: {settings.AT_SENDER_ID}")
        self.stdout.write(f"Sending to  : {phone}")

        result = send_sms(phone, "LumindaRentals: This is a test SMS from your notification system. It is working correctly!")

        if result:
            self.stdout.write(self.style.SUCCESS(f"SMS sent successfully to {phone}"))
        else:
            self.stdout.write(self.style.ERROR(f"SMS failed — check logs above for the error"))

    # ── Rent reminders ───────────────────────────────────────────────────────

    def _run_rent_reminders(self, dry_run: bool):
        from tenancies.models import Tenancy
        from payments.models import Payment

        self.stdout.write(f"\n--- Rent Reminder Task {'(DRY RUN)' if dry_run else ''} ---")

        today     = timezone.now().date()
        tenancies = Tenancy.objects.filter(
            status="active"
        ).select_related("tenant", "landlord", "unit", "unit__property")

        self.stdout.write(f"Active tenancies: {tenancies.count()}")
        self.stdout.write(f"Today          : {today}")

        sent = 0
        skipped_null = 0

        for tenancy in tenancies:
            tenant   = tenancy.tenant
            landlord = tenancy.landlord

            if tenant is None or landlord is None:
                skipped_null += 1
                continue

            try:
                landlord_settings = landlord.settings
                due_day    = landlord_settings.rent_due_day
                grace_days = landlord_settings.grace_period_days
            except Exception:
                due_day    = 1
                grace_days = 5

            days_in_month = calendar.monthrange(today.year, today.month)[1]
            due_day_safe  = min(due_day, days_in_month)
            due_date      = today.replace(day=due_day_safe)

            unit = tenancy.unit.unit_number
            rent = f"KES {int(float(tenancy.rent_snapshot)):,}"

            already_paid = Payment.objects.filter(
                tenancy=tenancy,
                status="success",
                payment_type__in=["monthly", "1_day", "1_week", "3_months", "6_months"],
                paid_at__year=today.year,
                paid_at__month=today.month,
            ).exists()

            days_until_due = (due_date - today).days
            days_overdue   = (today - due_date).days

            self.stdout.write(
                f"\n  Tenancy: {tenant.full_name} / Unit {unit} | "
                f"Due: {due_date} | Due in: {days_until_due}d | "
                f"Overdue: {days_overdue}d | Paid: {already_paid}"
            )

            if already_paid:
                self.stdout.write(f"    → Skipped (already paid)")
                continue

            action = None
            if days_until_due == 3:
                action = f"3-day reminder → {tenant.full_name}"
            elif days_until_due == 0:
                action = f"Due today reminder → {tenant.full_name}"
            elif days_overdue == 5:
                action = f"5-day overdue warning → {tenant.full_name} + landlord"
            elif days_overdue == 10:
                action = f"10-day overdue escalation → {tenant.full_name} + landlord"

            if action:
                self.stdout.write(self.style.SUCCESS(f"    → Would send: {action}"))
                if not dry_run:
                    from notifications.tasks import send_rent_reminders
                    # Run just for this tenancy by calling notify directly
                    self._send_reminder_for_tenancy(tenancy, tenant, landlord, unit, rent, due_date, days_until_due, days_overdue)
                    sent += 1
            else:
                self.stdout.write(f"    → No action needed today")

        if skipped_null:
            self.stdout.write(self.style.WARNING(f"\nSkipped {skipped_null} tenancies with deleted users"))

        if not dry_run:
            self.stdout.write(self.style.SUCCESS(f"\nReminders sent: {sent}"))
        else:
            self.stdout.write(self.style.WARNING(f"\nDry run complete — no messages sent"))

    def _send_reminder_for_tenancy(self, tenancy, tenant, landlord, unit, rent, due_date, days_until_due, days_overdue):
        from notifications.service import notify

        if days_until_due == 3:
            notify(tenant, "Rent due in 3 days",
                   f"Your rent of {rent} for Unit {unit} is due on {due_date.strftime('%d %b %Y')}. Please pay on time.",
                   "reminder", send_sms_flag=True)

        elif days_until_due == 0:
            notify(tenant, "Rent is due today",
                   f"Your rent of {rent} for Unit {unit} is due today. Pay now to avoid late charges.",
                   "reminder", send_sms_flag=True)

        elif days_overdue == 5:
            notify(tenant, "Rent overdue — 5 days",
                   f"Your rent of {rent} for Unit {unit} is now 5 days overdue. Please pay immediately.",
                   "reminder", send_sms_flag=True)
            notify(landlord, f"Overdue rent — Unit {unit} (5 days)",
                   f"{tenant.full_name} (Unit {unit}) is 5 days overdue on rent ({rent}).",
                   "reminder", send_sms_flag=False)

        elif days_overdue == 10:
            notify(tenant, "Urgent: Rent 10 days overdue",
                   f"Your rent of {rent} for Unit {unit} is 10 days overdue. Please contact your landlord immediately.",
                   "reminder", send_sms_flag=True)
            notify(landlord, f"Urgent: Overdue rent — Unit {unit} (10 days)",
                   f"{tenant.full_name} (Unit {unit}) is 10 days overdue on rent ({rent}).",
                   "reminder", send_sms_flag=True)

    # ── Collection reminder ──────────────────────────────────────────────────

    def _run_collection_reminder(self, dry_run: bool):
        from accounts.models import User

        self.stdout.write(f"\n--- Landlord Collection Reminder {'(DRY RUN)' if dry_run else ''} ---")

        landlords = User.objects.filter(role="landlord", is_active=True, is_approved=True)
        self.stdout.write(f"Active landlords: {landlords.count()}")

        for landlord in landlords:
            self.stdout.write(f"  → {landlord.full_name} ({landlord.phone})")

        if not dry_run:
            from notifications.tasks import send_landlord_collection_reminder
            send_landlord_collection_reminder()
            self.stdout.write(self.style.SUCCESS(f"Collection reminder sent to {landlords.count()} landlord(s)"))
        else:
            self.stdout.write(self.style.WARNING("Dry run complete — no messages sent"))
