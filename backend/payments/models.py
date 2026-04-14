import uuid
from django.db import models
from tenancies.models import Tenancy


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

    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenancy        = models.ForeignKey(
                         Tenancy,
                         on_delete=models.PROTECT,   # never delete a payment's tenancy
                         related_name="payments"
                     )

    # What was expected vs what was paid
    amount_due     = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid    = models.DecimalField(max_digits=10, decimal_places=2, default=0)

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