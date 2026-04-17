import uuid
from django.db import models
from tenancies.models import Tenancy
from accounts.models import User


# ──────────────────────────────────────────────
# PAYMENT METHOD — landlord B2B payout destination
# ──────────────────────────────────────────────

class PaymentMethod(models.Model):
    """
    Stores a landlord's M-Pesa B2B payout destination (Till or Paybill).
    Only one method per landlord can be is_default=True — enforced in save().
    Properties can reference a specific method; otherwise the landlord default is used.
    """

    class MethodType(models.TextChoices):
        TILL    = "TILL",    "Till Number"
        PAYBILL = "PAYBILL", "Paybill"

    id                     = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    landlord               = models.ForeignKey(
                                 User,
                                 on_delete=models.CASCADE,
                                 related_name="payment_methods",
                                 limit_choices_to={"role": "landlord"},
                             )
    method_type            = models.CharField(max_length=10, choices=MethodType.choices)
    account_number         = models.CharField(
                                 max_length=20,
                                 help_text="Till number or Paybill business number",
                             )
    account_name           = models.CharField(max_length=100)
    # Only used for PAYBILL — the account reference (e.g. landlord's name)
    paybill_account_number = models.CharField(
                                 max_length=50,
                                 blank=True,
                                 help_text="Account number / reference for paybill (leave blank for till)",
                             )
    is_active              = models.BooleanField(default=True)
    is_default             = models.BooleanField(default=False)
    created_at             = models.DateTimeField(auto_now_add=True)
    updated_at             = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payment_methods"
        ordering = ["-is_default", "-created_at"]

    def __str__(self):
        label = f"{self.account_name} ({self.account_number})"
        if self.is_default:
            label += " [default]"
        return label

    def save(self, *args, **kwargs):
        """Ensure only one default per landlord."""
        if self.is_default:
            # Clear any existing default for this landlord (excluding self)
            PaymentMethod.objects.filter(
                landlord=self.landlord,
                is_default=True,
            ).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


# ──────────────────────────────────────────────
# AUTO-PAYMENT — tenant's recurring payment subscription
# ──────────────────────────────────────────────

class AutoPayment(models.Model):
    """
    A tenant's standing instruction to pay rent automatically on the due date.

    M-Pesa flow  : Celery Beat triggers an STK push to mpesa_number on next_due_date.
    Card flow    : Celery Beat charges the stored card_token (Paystack auth code) on next_due_date.

    Security notes:
      - card_token  = Paystack authorization_code only — NEVER raw card numbers / CVV
      - card_last_four = last 4 digits for display only
    """

    METHOD_MPESA  = "MPESA"
    METHOD_CARD   = "CARD"
    METHOD_CHOICES = [
        (METHOD_MPESA, "M-Pesa"),
        (METHOD_CARD,  "Card"),
    ]

    STATUS_ACTIVE    = "ACTIVE"
    STATUS_PAUSED    = "PAUSED"
    STATUS_CANCELLED = "CANCELLED"
    STATUS_CHOICES = [
        (STATUS_ACTIVE,    "Active"),
        (STATUS_PAUSED,    "Paused"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    id                 = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant             = models.ForeignKey(
                             User,
                             on_delete=models.CASCADE,
                             related_name="auto_payments",
                             limit_choices_to={"role": "tenant"},
                         )
    tenancy            = models.ForeignKey(
                             "tenancies.Tenancy",
                             on_delete=models.CASCADE,
                             related_name="auto_payments",
                         )
    payment_method     = models.CharField(max_length=5, choices=METHOD_CHOICES)
    # M-Pesa: defaults to tenant's registered phone; tenant can override
    mpesa_number       = models.CharField(max_length=15, blank=True)
    # Card: Paystack authorization_code (recurring token) — never raw card data
    card_token         = models.CharField(max_length=200, blank=True)
    card_last_four     = models.CharField(max_length=4, blank=True)
    # due_day mirrors tenancy.due_day at creation; updated when landlord changes it
    due_day            = models.PositiveSmallIntegerField(default=5)
    status             = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    next_due_date      = models.DateField()
    last_triggered_at  = models.DateTimeField(null=True, blank=True)
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "auto_payments"
        ordering = ["-created_at"]
        # One active/paused auto-payment per tenancy
        constraints = [
            models.UniqueConstraint(
                fields=["tenancy"],
                condition=models.Q(status__in=["ACTIVE", "PAUSED"]),
                name="unique_active_autopayment_per_tenancy",
            )
        ]

    def __str__(self):
        return (
            f"AutoPay {self.get_payment_method_display()} — "
            f"{self.tenancy} — {self.status}"
        )

    @staticmethod
    def compute_next_due_date(due_day: int, after=None):
        """
        Returns the next calendar date on which due_day falls,
        on or after `after` (defaults to today).
        Caps at day 28 to avoid month-end edge cases.
        """
        import calendar
        from django.utils import timezone
        today     = after or timezone.now().date()
        safe_day  = min(due_day, 28)
        # If today's day-of-month is before or equal to due_day → this month
        if today.day <= safe_day:
            try:
                return today.replace(day=safe_day)
            except ValueError:
                # e.g., Feb doesn't have 29–31
                last_day = calendar.monthrange(today.year, today.month)[1]
                return today.replace(day=last_day)
        else:
            # Next month
            if today.month == 12:
                next_month_year  = today.year + 1
                next_month_month = 1
            else:
                next_month_year  = today.year
                next_month_month = today.month + 1
            last_day = calendar.monthrange(next_month_year, next_month_month)[1]
            day      = min(safe_day, last_day)
            return today.replace(year=next_month_year, month=next_month_month, day=day)


# ──────────────────────────────────────────────
# PAYMENT — every financial transaction
# ──────────────────────────────────────────────

class Payment(models.Model):
    """
    Tracks every payment attempt in the system.
    Key design decisions:
    - Linked to TENANCY (not user, not unit) — this is the spec rule
    - status starts as 'pending' — only backend callbacks mark it 'success'
    - transaction_id comes from the payment provider (M-Pesa, Flutterwave)
    - amount_paid can differ from amount_due (partial payments allowed)
    """

    class PaymentType(models.TextChoices):
        INITIAL  = "initial",  "Initial Payment"
        MONTHLY  = "monthly",  "Monthly Rent"
        ONEDAY   = "1_day",    "1 Day"
        ONEWEEK  = "1_week",   "1 Week"
        THREEMON = "3_months", "3 Months"
        SIXMON   = "6_months", "6 Months"
        BALANCE  = "balance",  "Pay Balance"

    class Method(models.TextChoices):
        MPESA = "mpesa", "M-Pesa"
        CARD  = "card",  "Card (Visa/Mastercard)"
        BANK  = "bank",  "Bank Transfer"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED  = "failed",  "Failed"

    class DisbursementStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        SUCCESS = "success", "Success"
        FAILED  = "failed",  "Failed"

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenancy        = models.ForeignKey(
                         Tenancy,
                         on_delete=models.PROTECT,   # never delete a payment's tenancy
                         related_name="payments"
                     )

    # What was expected vs what was paid
    amount_due     = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid    = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # ── Fee breakdown ──────────────────────────────────────────────────────────
    # M-Pesa: platform_fee_amount = 2% of rent (deducted from collected rent
    #         before landlord disbursement); b2b_fee_amount = Safaricom B2B tier.
    # Card:   card_surcharge_amount = 2.6% added on top of rent; tenant pays it.
    # Bank:   all three are 0 (no fees).
    platform_fee_amount  = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    b2b_fee_amount       = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    card_surcharge_amount= models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # ── Landlord disbursement (M-Pesa B2B) ────────────────────────────────────
    disbursement_status    = models.CharField(
                                 max_length=10,
                                 choices=DisbursementStatus.choices,
                                 null=True, blank=True,
                             )
    disbursement_reference = models.CharField(max_length=100, null=True, blank=True)
    disbursed_at           = models.DateTimeField(null=True, blank=True)

    payment_type   = models.CharField(max_length=10, choices=PaymentType.choices)
    method         = models.CharField(max_length=10, choices=Method.choices)
    status         = models.CharField(
                         max_length=10,
                         choices=Status.choices,
                         default=Status.PENDING
                     )

    # From payment provider — M-Pesa gives MpesaReceiptNumber, Flutterwave gives tx_ref
    transaction_id = models.CharField(max_length=100, blank=True, null=True, unique=True)

    # For custom payments: what period does this cover?
    period_start   = models.DateField(null=True, blank=True)
    period_end     = models.DateField(null=True, blank=True)

    # due_date: when this payment should have been made
    due_date       = models.DateField(null=True, blank=True)

    # paid_at: when payment was confirmed by provider callback
    paid_at        = models.DateTimeField(null=True, blank=True)

    # For bank transfers: tenant uploads proof, landlord verifies
    bank_proof     = models.FileField(
                         upload_to="bank_proofs/",
                         null=True,
                         blank=True
                     )

    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payments"
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.get_payment_type_display()} — "
            f"KES {self.amount_paid}/{self.amount_due} — "
            f"{self.status}"
        )

    @property
    def is_fully_paid(self):
        return self.amount_paid >= self.amount_due

    @property
    def balance(self):
        """Remaining balance if partially paid."""
        return max(self.amount_due - self.amount_paid, 0)

    def mark_success(self, transaction_id, amount_paid=None):
        """
        Called ONLY from payment provider callbacks (M-Pesa, Flutterwave).
        Never call this from the frontend directly.
        """
        import django.utils.timezone as tz
        self.status         = self.Status.SUCCESS
        self.transaction_id = transaction_id
        self.amount_paid    = amount_paid or self.amount_due
        self.paid_at        = tz.now()
        self.save(update_fields=[
            "status", "transaction_id", "amount_paid", "paid_at", "updated_at"
        ])


# ──────────────────────────────────────────────
# RECEIPT — auto-generated after each successful payment
# ──────────────────────────────────────────────

class Receipt(models.Model):
    """
    Auto-created when a payment status becomes 'success'.
    receipt_number is human-readable (e.g. RCP-2024-00001).
    Stores a PDF file the tenant can download.
    """
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment        = models.OneToOneField(
                         Payment,
                         on_delete=models.PROTECT,
                         related_name="receipt"
                     )
    receipt_number = models.CharField(max_length=30, unique=True)
    receipt_pdf    = models.FileField(
                         upload_to="receipts/",
                         null=True,
                         blank=True
                     )
    generated_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "receipts"
        ordering = ["-generated_at"]

    def __str__(self):
        return f"{self.receipt_number} — {self.payment.tenancy.tenant.full_name}"

    @classmethod
    def generate_receipt_number(cls):
        """
        Generates sequential receipt numbers: RCP-2024-00001
        Safe to call inside transaction.atomic().
        """
        from django.utils import timezone
        year  = timezone.now().year
        count = cls.objects.filter(generated_at__year=year).count() + 1
        return f"RCP-{year}-{count:05d}"


# ──────────────────────────────────────────────
# MPESA TRANSACTION LOG — raw Daraja callback data
# ──────────────────────────────────────────────

class MpesaTransaction(models.Model):
    """
    Stores the raw callback from Safaricom Daraja API.
    Why? Audit trail. If anything goes wrong, you can replay and debug.
    This is separate from Payment — it's the raw provider data.
    """
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment             = models.OneToOneField(
                              Payment,
                              on_delete=models.SET_NULL,
                              null=True,
                              blank=True,
                              related_name="mpesa_log"
                          )
    # M-Pesa specific fields from Daraja callback
    merchant_request_id = models.CharField(max_length=100)
    checkout_request_id = models.CharField(max_length=100, unique=True)
    result_code         = models.IntegerField()             # 0 = success
    result_description  = models.CharField(max_length=200)
    mpesa_receipt_number= models.CharField(max_length=50, blank=True, null=True)
    phone_number        = models.CharField(max_length=15)
    amount              = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    raw_response        = models.JSONField()                # store the full Daraja JSON
    created_at          = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "mpesa_transactions"

    def __str__(self):
        return f"M-Pesa {self.mpesa_receipt_number} — code {self.result_code}"
    
class UnitPaymentStatus(models.Model):
    """
    Tracks the CURRENT payment status of each active tenancy.
    One record per tenancy — updated every time a payment is made.
    This is what the dashboard reads — never calculate status on the fly.

    status choices:
      unpaid        — nothing paid for current period
      partially_paid — some paid, balance > 0
      paid          — fully paid for current month
      paid_ahead    — paid beyond current month
    """

    class PayStatus(models.TextChoices):
        UNPAID         = "unpaid",         "Unpaid"
        PARTIALLY_PAID = "partially_paid", "Partially Paid"
        PAID           = "paid",           "Paid"
        PAID_AHEAD     = "paid_ahead",     "Paid Ahead"

    tenancy         = models.OneToOneField(
                          "tenancies.Tenancy",
                          on_delete    = models.CASCADE,
                          related_name = "payment_status",
                      )
    status          = models.CharField(
                          max_length = 15,
                          choices    = PayStatus.choices,
                          default    = PayStatus.UNPAID,
                      )
    amount_paid_this_period = models.DecimalField(
                          max_digits   = 10,
                          decimal_places = 2,
                          default      = 0,
                      )
    balance         = models.DecimalField(
                          max_digits   = 10,
                          decimal_places = 2,
                          default      = 0,
                      )
    period_start    = models.DateField(null=True, blank=True)
    period_end      = models.DateField(null=True, blank=True)
    paid_until      = models.DateField(null=True, blank=True)
    last_payment_at = models.DateTimeField(null=True, blank=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "unit_payment_status"

    def __str__(self):
        return f"{self.tenancy} — {self.status}"

    @property
    def is_overdue(self):
        from django.utils import timezone
        if self.status in (self.PayStatus.PAID, self.PayStatus.PAID_AHEAD):
            return False
        if not self.period_end:
            return False
        return timezone.now().date() > self.period_end

    @property
    def days_overdue(self):
        from django.utils import timezone
        if not self.is_overdue:
            return 0
        return (timezone.now().date() - self.period_end).days