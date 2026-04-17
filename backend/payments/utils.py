import math
import calendar
from decimal import Decimal
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta


def calculate_platform_fee(rent_amount: int | float | Decimal) -> int:
    """
    LumidahRentals platform fee: 2% of rent, charged post-collection on M-Pesa.
    Deducted from rent before disbursing to landlord — tenant pays full rent amount.
    Returns the fee in whole KES (rounds up).
    """
    return math.ceil(Decimal(str(rent_amount)) * Decimal("2") / Decimal("100"))


def calculate_b2b_fee(landlord_amount: int | float | Decimal) -> int:
    """
    Safaricom B2B (Business-to-Business) transfer fee for disbursing rent
    from the platform M-Pesa account to the landlord's M-Pesa number.

    Tiers (effective April 2024, Safaricom schedule):
      KES       1 –     1,000 → KES  12
      KES   1,001 –     5,000 → KES  32
      KES   5,001 –    10,000 → KES  52
      KES  10,001 –    20,000 → KES  72
      KES  20,001 –    70,000 → KES  82
      KES  70,001 –   150,000 → KES 102
      KES 150,001 –   250,000 → KES 152

    Deducted from the rent before disbursing to landlord, alongside the 2% fee.
    """
    amt = int(math.ceil(float(landlord_amount)))
    if amt <= 1_000:
        return 12
    elif amt <= 5_000:
        return 32
    elif amt <= 10_000:
        return 52
    elif amt <= 20_000:
        return 72
    elif amt <= 70_000:
        return 82
    elif amt <= 150_000:
        return 102
    else:
        return 152


def calculate_card_surcharge(rent_amount: int | float | Decimal) -> int:
    """
    2.6% card processing surcharge added ON TOP of rent for Paystack payments.
    Tenant pays rent + surcharge; landlord receives rent only.
    Rounds up to the nearest whole KES.
    """
    return math.ceil(Decimal(str(rent_amount)) * Decimal("2.6") / Decimal("100"))


def calculate_prorated_rent(rent_amount: Decimal, start_date: date) -> int:
    """Prorated rent = daily_rate × remaining_days_in_month. Always rounds UP."""
    days_in_month  = calendar.monthrange(start_date.year, start_date.month)[1]
    days_remaining = days_in_month - start_date.day + 1
    daily_rate     = Decimal(rent_amount) / Decimal(days_in_month)
    return math.ceil(daily_rate * days_remaining)


def calculate_period(payment_type: str, rent_amount: Decimal, ref_date: date) -> dict:
    """
    Calculates amount_due, period_start, period_end for any payment type.
    Returns dict with: amount_due, period_start, period_end, is_advance
    """
    days_in_month = calendar.monthrange(ref_date.year, ref_date.month)[1]
    daily_rate    = Decimal(rent_amount) / Decimal(days_in_month)

    if payment_type == "monthly":
        # Full calendar month
        period_start = ref_date.replace(day=1)
        period_end   = ref_date.replace(day=days_in_month)
        return {
            "amount_due":   int(rent_amount),
            "period_start": period_start,
            "period_end":   period_end,
            "is_advance":   False,
        }

    elif payment_type == "1_day":
        period_start = ref_date
        period_end   = ref_date
        return {
            "amount_due":   math.ceil(daily_rate),
            "period_start": period_start,
            "period_end":   period_end,
            "is_advance":   False,
        }

    elif payment_type == "1_week":
        period_start = ref_date
        period_end   = ref_date + timedelta(days=6)
        return {
            "amount_due":   math.ceil(daily_rate * 7),
            "period_start": period_start,
            "period_end":   period_end,
            "is_advance":   False,
        }

    elif payment_type == "3_months":
        period_start = ref_date.replace(day=1)
        period_end   = (ref_date + relativedelta(months=3)).replace(day=1) - timedelta(days=1)
        return {
            "amount_due":   int(rent_amount) * 3,
            "period_start": period_start,
            "period_end":   period_end,
            "is_advance":   True,
        }

    elif payment_type == "6_months":
        period_start = ref_date.replace(day=1)
        period_end   = (ref_date + relativedelta(months=6)).replace(day=1) - timedelta(days=1)
        return {
            "amount_due":   int(rent_amount) * 6,
            "period_start": period_start,
            "period_end":   period_end,
            "is_advance":   True,
        }

    raise ValueError(f"Unknown payment_type: {payment_type}")


def update_unit_payment_status(payment):
    """
    Core rule: new payment always extends from paid_until + 1 day.
    No need to recalculate existing credit — just extend forward.
    """
    from django.utils import timezone
    from payments.models import UnitPaymentStatus
    from decimal import Decimal
    import calendar
    from datetime import date, timedelta
    from dateutil.relativedelta import relativedelta

    tenancy     = payment.tenancy
    rent        = Decimal(str(tenancy.rent_snapshot))
    today       = timezone.now().date()
    amount_paid = Decimal(str(payment.amount_paid))

    ups, _ = UnitPaymentStatus.objects.get_or_create(tenancy=tenancy)

    # ── Initial payment ───────────────────────────────────────────────
    if payment.payment_type == "initial":
        lease     = tenancy.lease_start_date
        days_in_m = calendar.monthrange(lease.year, lease.month)[1]
        eom       = lease.replace(day=days_in_m)
        ups.status                  = UnitPaymentStatus.PayStatus.PAID
        ups.amount_paid_this_period = amount_paid
        ups.balance                 = Decimal("0")
        ups.period_start            = lease
        ups.period_end              = eom
        ups.paid_until              = eom
        ups.last_payment_at         = payment.paid_at
        ups.save()
        return ups

    # ── Where does this new payment start from? ───────────────────────
    has_credit = ups.paid_until and ups.paid_until >= today
    # If existing credit: extend from paid_until + 1
    # If no credit / overdue: start from today
    pay_from   = (ups.paid_until + timedelta(days=1)) if has_credit else today

    def eom(d: date) -> date:
        return d.replace(day=calendar.monthrange(d.year, d.month)[1])

    def daily_rate(d: date) -> Decimal:
        return rent / Decimal(calendar.monthrange(d.year, d.month)[1])

    def extend_by_amount(from_date: date, amount: Decimal) -> date:
        """
        Starting from from_date (inclusive), how far does 'amount' KES reach?
        Returns the last date covered (inclusive).
        Day 1 = from_date itself. 7 days from April 1 = April 7.
        """
        remaining = amount
        cursor    = from_date
    
        while True:
            dr          = daily_rate(cursor)
            month_end   = eom(cursor)
            days_in_seg = (month_end - cursor).days + 1
            cost_of_seg = dr * days_in_seg
    
            if remaining >= cost_of_seg - Decimal("0.01"):
                # Covers to end of this month
                remaining -= cost_of_seg
                if remaining <= Decimal("0.01"):
                    return month_end
                cursor = month_end + timedelta(days=1)
            else:
                # Runs out within this month
                # remaining / dr = number of days covered (including from_date)
                import math
                full_days = math.floor(remaining / dr)
                # from_date is day 1, so last day = from_date + (full_days - 1)
                # But if remaining covers at least 1 full day, we need at least from_date
                if full_days <= 0:
                    return cursor   # at least today is covered
                return cursor + timedelta(days=full_days - 1)

    def cost_from_to(from_date: date, to_date: date) -> Decimal:
        """Cost of covering from_date through to_date inclusive."""
        total  = Decimal("0")
        cursor = from_date
        while cursor <= to_date:
            me   = eom(cursor)
            end  = min(me, to_date)
            days = (end - cursor).days + 1
            total += daily_rate(cursor) * days
            cursor = me + timedelta(days=1)
        return total

    # ── 3 months ──────────────────────────────────────────────────────
    if payment.payment_type == "3_months":
        period_end = eom(pay_from + relativedelta(months=2))
        ups.status                  = UnitPaymentStatus.PayStatus.PAID_AHEAD
        ups.amount_paid_this_period = amount_paid
        ups.balance                 = Decimal("0")
        ups.period_start            = pay_from
        ups.period_end              = period_end
        ups.paid_until              = period_end
        ups.last_payment_at         = payment.paid_at
        ups.save()
        return ups

    # ── 6 months ──────────────────────────────────────────────────────
    if payment.payment_type == "6_months":
        period_end = eom(pay_from + relativedelta(months=5))
        ups.status                  = UnitPaymentStatus.PayStatus.PAID_AHEAD
        ups.amount_paid_this_period = amount_paid
        ups.balance                 = Decimal("0")
        ups.period_start            = pay_from
        ups.period_end              = period_end
        ups.paid_until              = period_end
        ups.last_payment_at         = payment.paid_at
        ups.save()
        return ups

    # ── Monthly / 1_day / 1_week / balance ───────────────────────────
    # Calculate paid_until by extending from pay_from by amount_paid
    paid_until_new = extend_by_amount(pay_from, amount_paid)

    today_som = today.replace(day=1)
    today_eom = eom(today)

    ups.status, ups.balance = _status_and_balance(
        paid_until_new, today, today_eom, rent, cost_from_to
    )
    ups.amount_paid_this_period = amount_paid
    ups.period_start            = today_som
    ups.period_end              = today_eom
    ups.paid_until              = paid_until_new
    ups.last_payment_at         = payment.paid_at
    ups.save()
    return ups


def _status_and_balance(paid_until, today, today_eom, rent, cost_fn):
    """
    Shared rule used by both update_unit_payment_status and reset_expired_statuses.

    Rules (evaluated against today's calendar month):
      paid_until > today_eom          → PAID_AHEAD, balance = 0
      paid_until == today_eom         → PAID (full month covered), balance = 0
      paid_until == today             → PAID (1-day payment covers today), balance = 0
      paid_until > today (< today_eom)→ PARTIALLY_PAID, balance = cost(paid_until+1 → today_eom)
      paid_until < today              → UNPAID (expired), balance = full rent

    The PAID/1-day rule: if you paid for exactly today, you're "paid" for the day.
    Tomorrow's cron sees paid_until < today and flips to UNPAID automatically.
    """
    from payments.models import UnitPaymentStatus
    from decimal import Decimal
    from datetime import timedelta

    if paid_until > today_eom:
        return UnitPaymentStatus.PayStatus.PAID_AHEAD, Decimal("0")

    if paid_until == today_eom or paid_until == today:
        return UnitPaymentStatus.PayStatus.PAID, Decimal("0")

    if paid_until > today:
        # Covers some of this month but not through end
        balance = cost_fn(paid_until + timedelta(days=1), today_eom)
        return UnitPaymentStatus.PayStatus.PARTIALLY_PAID, balance

    # paid_until < today — expired
    return UnitPaymentStatus.PayStatus.UNPAID, Decimal(str(rent))


def reset_expired_statuses():
    """
    Runs daily at midnight via cron.

    Re-evaluates EVERY active tenancy's payment status against today's date.
    This handles all transitions automatically:
      - Month change: April → May (paid_until June 7 stays PAID_AHEAD in May) ✓
      - Month change: May → June (paid_until June 7 becomes PARTIALLY_PAID) ✓
      - paid_until passes: June 8 (paid_until June 7) → UNPAID ✓
      - 1-day: paid until June 8, on June 9 → UNPAID ✓

    paid_until is NEVER cleared — it serves as historical display ("last paid until").
    """
    from django.utils import timezone
    from payments.models import UnitPaymentStatus
    from decimal import Decimal
    import calendar
    from datetime import timedelta

    today     = timezone.now().date()
    today_som = today.replace(day=1)
    today_eom = today.replace(day=calendar.monthrange(today.year, today.month)[1])

    qs = UnitPaymentStatus.objects.filter(
        tenancy__status="active"
    ).select_related("tenancy")

    for ups in qs:
        if ups.paid_until is None:
            # Never paid — keep period current so dashboard shows right month
            if ups.period_start != today_som or ups.period_end != today_eom:
                ups.period_start = today_som
                ups.period_end   = today_eom
                ups.balance      = Decimal(str(ups.tenancy.rent_snapshot))
                ups.save(update_fields=["period_start", "period_end", "balance", "updated_at"])
            continue

        rent = Decimal(str(ups.tenancy.rent_snapshot))

        def _cost(from_d, to_d, _rent=rent):
            total  = Decimal("0")
            cursor = from_d
            while cursor <= to_d:
                days_in_m = calendar.monthrange(cursor.year, cursor.month)[1]
                me   = cursor.replace(day=days_in_m)
                end  = min(me, to_d)
                days = (end - cursor).days + 1
                total += (_rent / Decimal(days_in_m)) * Decimal(days)
                cursor = me + timedelta(days=1)
            return total

        new_status, new_balance = _status_and_balance(
            ups.paid_until, today, today_eom, rent, _cost
        )

        changed = (
            ups.status       != new_status  or
            ups.balance      != new_balance or
            ups.period_start != today_som   or
            ups.period_end   != today_eom
        )
        if changed:
            ups.status       = new_status
            ups.balance      = new_balance
            ups.period_start = today_som
            ups.period_end   = today_eom
            ups.save(update_fields=[
                "status", "balance", "period_start", "period_end", "updated_at"
            ])

    # ── On 1st of each month: notify all parties about previous month's unpaid rent ──
    if today.day == 1:
        _send_overdue_notifications(today)


def _send_overdue_notifications(today):
    """
    Called on the 1st of each month by reset_expired_statuses.
    Notifies landlord, any assigned caretakers, and the tenant when
    the previous month's rent was not fully paid.

    'Not fully paid' means paid_until < last day of previous month.
    """
    from notifications.service import notify
    from accounts.models import CaretakerAssignment
    from payments.models import UnitPaymentStatus
    from datetime import timedelta

    # Last day of previous month
    prev_month_end  = today - timedelta(days=1)
    prev_month_name = prev_month_end.strftime("%B %Y")

    qs = (
        UnitPaymentStatus.objects
        .filter(tenancy__status="active")
        .select_related(
            "tenancy__tenant",
            "tenancy__landlord",
            "tenancy__unit",
            "tenancy__unit__property",
        )
    )

    for ups in qs:
        # Skip if fully paid through end of previous month
        if ups.paid_until and ups.paid_until >= prev_month_end:
            continue

        tenancy   = ups.tenancy
        tenant    = tenancy.tenant
        landlord  = tenancy.landlord
        unit_num  = tenancy.unit.unit_number
        prop_name = tenancy.unit.property.name
        t_name    = tenant.full_name if tenant else "Your tenant"

        msg_staff = (
            f"{t_name} in Unit {unit_num} ({prop_name}) "
            f"did not pay rent for {prev_month_name}."
        )

        if landlord:
            try:
                notify(
                    landlord,
                    f"Unpaid rent — Unit {unit_num}",
                    msg_staff,
                    "payment",
                )
            except Exception:
                pass

        # Notify assigned caretakers
        for ca in CaretakerAssignment.objects.filter(
            property=tenancy.unit.property
        ).select_related("caretaker"):
            try:
                notify(
                    ca.caretaker,
                    f"Unpaid rent — Unit {unit_num}",
                    msg_staff,
                    "payment",
                )
            except Exception:
                pass

        # Notify tenant
        if tenant:
            try:
                notify(
                    tenant,
                    f"Rent overdue — {prev_month_name}",
                    f"Your rent for {prev_month_name} (Unit {unit_num}, {prop_name}) "
                    f"was not paid. Please settle your balance as soon as possible.",
                    "payment",
                )
            except Exception:
                pass


def generate_receipt_number() -> str:
    """
    Generates a unique sequential receipt number: RCP-2024-00001.
    Called inside transaction.atomic — uses select_for_update to lock the
    last receipt row and prevent two concurrent transactions from getting
    the same number.  Falls back gracefully to count-based sequencing if
    no receipts exist yet for the year.
    """
    from django.utils import timezone
    from payments.models import Receipt

    year = timezone.now().year

    # Lock the most recent receipt for this year so concurrent transactions
    # wait here instead of both reading the same count.
    Receipt.objects.filter(
        receipt_number__startswith=f"RCP-{year}-"
    ).select_for_update().order_by("-receipt_number").first()

    count = Receipt.objects.filter(generated_at__year=year).count() + 1

    # Ensure uniqueness in case of any edge case (e.g. clock skew)
    candidate = f"RCP-{year}-{count:05d}"
    while Receipt.objects.filter(receipt_number=candidate).exists():
        count += 1
        candidate = f"RCP-{year}-{count:05d}"

    return candidate


def format_phone_for_mpesa(phone: str) -> str:
    phone = phone.strip().replace(" ", "").replace("-", "")
    if phone.startswith("+"):
        phone = phone[1:]
    if phone.startswith("0") and len(phone) == 10:
        phone = "254" + phone[1:]
    if not phone.startswith("254") or len(phone) != 12:
        raise ValueError(f"Invalid phone number: {phone}")
    return phone