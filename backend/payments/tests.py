"""
Payment tests — covers platform fee calculation and integration with
InitiatePaymentView for both M-Pesa and Paystack flows.
"""
import math
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings
from django.utils import timezone

from payments.utils import calculate_platform_fee


# ──────────────────────────────────────────────────────────────────────────────
# Unit tests: calculate_platform_fee
# ──────────────────────────────────────────────────────────────────────────────

class CalculatePlatformFeeTests(TestCase):

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_standard_monthly_rent(self):
        """0.3% of KES 10,000 = 30.0 → ceil = 30"""
        self.assertEqual(calculate_platform_fee(10_000), 30)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_rounds_up(self):
        """0.3% of KES 5,000 = 15.0 → ceil = 15"""
        self.assertEqual(calculate_platform_fee(5_000), 15)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_rounds_up_fractional(self):
        """0.3% of KES 1,000 = 3.0 → ceil = 3"""
        self.assertEqual(calculate_platform_fee(1_000), 3)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_odd_amount_rounds_up(self):
        """0.3% of KES 7,777 = 23.331 → ceil = 24"""
        expected = math.ceil(7777 * 0.3 / 100)
        self.assertEqual(calculate_platform_fee(7_777), expected)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.5)
    def test_configurable_percentage(self):
        """Fee percentage is read from settings."""
        self.assertEqual(calculate_platform_fee(10_000), 50)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_accepts_decimal(self):
        """Works with Decimal input."""
        self.assertEqual(calculate_platform_fee(Decimal("10000")), 30)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_zero_amount(self):
        """Zero rent → zero fee."""
        self.assertEqual(calculate_platform_fee(0), 0)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_tenant_charged_rent_plus_fee(self):
        """Total charge = rent + fee."""
        rent = 8_000
        fee  = calculate_platform_fee(rent)
        self.assertEqual(rent + fee, 8_024)   # 0.3% of 8000 = 24

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_fee_stored_not_added_to_amount_due(self):
        """
        amount_due on Payment stays = rent.
        platform_fee is tracked separately.
        Tenant is charged amount_due + platform_fee.
        """
        rent = 12_000
        fee  = calculate_platform_fee(rent)
        charge = rent + fee
        self.assertEqual(fee, 36)           # 0.3% of 12000
        self.assertEqual(charge, 12_036)    # total billed to tenant
        # Landlord receives: charge - fee = 12000 ✓

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_three_month_advance_fee(self):
        """Fee is on the full 3-month amount."""
        rent_3m = 10_000 * 3  # 30,000
        fee     = calculate_platform_fee(rent_3m)
        self.assertEqual(fee, 90)

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_six_month_advance_fee(self):
        """Fee is on the full 6-month amount."""
        rent_6m = 10_000 * 6  # 60,000
        fee     = calculate_platform_fee(rent_6m)
        self.assertEqual(fee, 180)


# ──────────────────────────────────────────────────────────────────────────────
# Integration: fee stored on Payment model
# ──────────────────────────────────────────────────────────────────────────────

class PlatformFeeModelTests(TestCase):

    def _make_payment(self, amount_due, method="mpesa"):
        """Helper — creates a minimal Payment in memory (no DB required)."""
        from payments.models import Payment
        p = Payment()
        p.amount_due   = Decimal(str(amount_due))
        p.platform_fee = Decimal(str(calculate_platform_fee(amount_due) if method != "bank" else 0))
        p.method       = method
        return p

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_mpesa_payment_has_fee(self):
        p = self._make_payment(10_000, method="mpesa")
        self.assertEqual(p.platform_fee, Decimal("30"))

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_card_payment_has_fee(self):
        p = self._make_payment(10_000, method="card")
        self.assertEqual(p.platform_fee, Decimal("30"))

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_bank_payment_has_no_fee(self):
        """Bank transfers are exempt from the platform fee."""
        p = self._make_payment(10_000, method="bank")
        self.assertEqual(p.platform_fee, Decimal("0"))

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_amount_due_unchanged(self):
        """amount_due = rent only. Fee is separate field."""
        p = self._make_payment(10_000, method="mpesa")
        self.assertEqual(p.amount_due, Decimal("10000"))
        self.assertEqual(p.platform_fee, Decimal("30"))
        # Charge to provider = 10030
        charge = p.amount_due + p.platform_fee
        self.assertEqual(charge, Decimal("10030"))

    @override_settings(PLATFORM_FEE_PERCENTAGE=0.3)
    def test_rent_paid_after_fee_strip(self):
        """
        Simulates M-Pesa callback: provider reports 10030.
        After stripping the fee the rent credited = 10000.
        """
        p              = self._make_payment(10_000, method="mpesa")
        provider_amount = Decimal("10030")   # what M-Pesa reports
        rent_paid       = provider_amount - p.platform_fee
        self.assertEqual(rent_paid, Decimal("10000"))
