"""
Payment tests — covers fee calculation utilities and integration with
InitiatePaymentView for M-Pesa and Paystack flows.

Fee model (as of migration 0005):
  M-Pesa:  tenant pays full rent; platform takes 2% + Safaricom B2B fee from
            collected amount before disbursing to landlord.
  Card:     tenant pays rent + 2.6% surcharge; landlord receives rent only.
  Bank:     no fees.
"""
import math
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings

from payments.utils import calculate_platform_fee, calculate_b2b_fee, calculate_card_surcharge


# ──────────────────────────────────────────────────────────────────────────────
# calculate_platform_fee  (2% of rent, M-Pesa only — deducted post-collection)
# ──────────────────────────────────────────────────────────────────────────────

class CalculatePlatformFeeTests(TestCase):

    def test_standard_monthly_rent(self):
        """2% of KES 10,000 = 200"""
        self.assertEqual(calculate_platform_fee(10_000), 200)

    def test_small_rent(self):
        """2% of KES 5,000 = 100"""
        self.assertEqual(calculate_platform_fee(5_000), 100)

    def test_rounds_up_fractional(self):
        """2% of KES 1,001 = 20.02 → ceil = 21"""
        self.assertEqual(calculate_platform_fee(1_001), math.ceil(1001 * 2 / 100))

    def test_odd_amount_rounds_up(self):
        """2% of KES 7,777 = 155.54 → ceil = 156"""
        self.assertEqual(calculate_platform_fee(7_777), math.ceil(7777 * 2 / 100))

    def test_accepts_decimal(self):
        """Works with Decimal input."""
        self.assertEqual(calculate_platform_fee(Decimal("10000")), 200)

    def test_zero_amount(self):
        """Zero rent → zero fee."""
        self.assertEqual(calculate_platform_fee(0), 0)

    def test_fee_is_2_percent(self):
        """Spot-check: 2% of KES 15,000 = 300."""
        self.assertEqual(calculate_platform_fee(15_000), 300)

    def test_three_month_advance(self):
        """Fee is applied to the full advance amount."""
        rent_3m = 10_000 * 3   # 30,000
        self.assertEqual(calculate_platform_fee(rent_3m), 600)

    def test_six_month_advance(self):
        """Fee is applied to the full advance amount."""
        rent_6m = 10_000 * 6   # 60,000
        self.assertEqual(calculate_platform_fee(rent_6m), 1_200)

    def test_landlord_amount_calculation(self):
        """landlord_amount = rent - 2% fee - B2B fee (example with KES 10,000)."""
        rent              = 10_000
        platform_fee      = calculate_platform_fee(rent)              # 200
        b2b_fee           = calculate_b2b_fee(rent - platform_fee)    # b2b on 9,800
        landlord_amount   = rent - platform_fee - b2b_fee
        self.assertEqual(platform_fee, 200)
        # B2B tier for 9,800 (1,001–10,000 range) = 52
        self.assertEqual(b2b_fee, 52)
        self.assertEqual(landlord_amount, 9_748)


# ──────────────────────────────────────────────────────────────────────────────
# calculate_b2b_fee  (Safaricom B2B tiered transfer fee)
# ──────────────────────────────────────────────────────────────────────────────

class CalculateB2BFeeTests(TestCase):

    def test_tier_1_minimum(self):
        """KES 1 → KES 12"""
        self.assertEqual(calculate_b2b_fee(1), 12)

    def test_tier_1_boundary(self):
        """KES 1,000 → KES 12"""
        self.assertEqual(calculate_b2b_fee(1_000), 12)

    def test_tier_2_lower(self):
        """KES 1,001 → KES 32"""
        self.assertEqual(calculate_b2b_fee(1_001), 32)

    def test_tier_2_upper(self):
        """KES 5,000 → KES 32"""
        self.assertEqual(calculate_b2b_fee(5_000), 32)

    def test_tier_3_lower(self):
        """KES 5,001 → KES 52"""
        self.assertEqual(calculate_b2b_fee(5_001), 52)

    def test_tier_3_upper(self):
        """KES 10,000 → KES 52"""
        self.assertEqual(calculate_b2b_fee(10_000), 52)

    def test_tier_4_lower(self):
        """KES 10,001 → KES 72"""
        self.assertEqual(calculate_b2b_fee(10_001), 72)

    def test_tier_4_upper(self):
        """KES 20,000 → KES 72"""
        self.assertEqual(calculate_b2b_fee(20_000), 72)

    def test_tier_5_lower(self):
        """KES 20,001 → KES 82"""
        self.assertEqual(calculate_b2b_fee(20_001), 82)

    def test_tier_5_upper(self):
        """KES 70,000 → KES 82"""
        self.assertEqual(calculate_b2b_fee(70_000), 82)

    def test_tier_6_lower(self):
        """KES 70,001 → KES 102"""
        self.assertEqual(calculate_b2b_fee(70_001), 102)

    def test_tier_6_upper(self):
        """KES 150,000 → KES 102"""
        self.assertEqual(calculate_b2b_fee(150_000), 102)

    def test_tier_7_lower(self):
        """KES 150,001 → KES 152"""
        self.assertEqual(calculate_b2b_fee(150_001), 152)

    def test_tier_7_large_amount(self):
        """KES 250,000 → KES 152"""
        self.assertEqual(calculate_b2b_fee(250_000), 152)

    def test_accepts_decimal(self):
        """Works with Decimal input."""
        self.assertEqual(calculate_b2b_fee(Decimal("10000")), 52)


# ──────────────────────────────────────────────────────────────────────────────
# calculate_card_surcharge  (2.6% added on top of rent for Paystack)
# ──────────────────────────────────────────────────────────────────────────────

class CalculateCardSurchargeTests(TestCase):

    def test_standard_rent(self):
        """2.6% of KES 10,000 = 260"""
        self.assertEqual(calculate_card_surcharge(10_000), 260)

    def test_rounds_up(self):
        """2.6% of KES 1,000 = 26.0 → 26"""
        self.assertEqual(calculate_card_surcharge(1_000), 26)

    def test_rounds_up_fractional(self):
        """2.6% of KES 7,777 = 202.202 → ceil = 203"""
        self.assertEqual(calculate_card_surcharge(7_777), math.ceil(7777 * 2.6 / 100))

    def test_zero_amount(self):
        """Zero rent → zero surcharge."""
        self.assertEqual(calculate_card_surcharge(0), 0)

    def test_tenant_total(self):
        """Tenant pays rent + 2.6% surcharge."""
        rent      = 15_000
        surcharge = calculate_card_surcharge(rent)
        self.assertEqual(surcharge, 390)
        self.assertEqual(rent + surcharge, 15_390)

    def test_accepts_decimal(self):
        """Works with Decimal input."""
        self.assertEqual(calculate_card_surcharge(Decimal("10000")), 260)


# ──────────────────────────────────────────────────────────────────────────────
# Payment model fee fields integration
# ──────────────────────────────────────────────────────────────────────────────

class PaymentFeeFieldsTests(TestCase):

    def _make_payment(self, amount_due, method="mpesa"):
        """Helper — builds a minimal Payment in memory (no DB)."""
        from payments.models import Payment
        p = Payment()
        p.amount_due = Decimal(str(amount_due))
        p.method     = method

        if method == "mpesa":
            platform_fee      = calculate_platform_fee(amount_due)
            landlord_pre_b2b  = amount_due - platform_fee
            b2b_fee           = calculate_b2b_fee(landlord_pre_b2b)
            p.platform_fee_amount  = Decimal(str(platform_fee))
            p.b2b_fee_amount       = Decimal(str(b2b_fee))
            p.card_surcharge_amount= Decimal("0")
        elif method == "card":
            surcharge               = calculate_card_surcharge(amount_due)
            p.card_surcharge_amount = Decimal(str(surcharge))
            p.platform_fee_amount   = Decimal("0")
            p.b2b_fee_amount        = Decimal("0")
        else:
            p.platform_fee_amount   = Decimal("0")
            p.b2b_fee_amount        = Decimal("0")
            p.card_surcharge_amount = Decimal("0")
        return p

    def test_mpesa_has_platform_and_b2b_fee(self):
        p = self._make_payment(10_000, method="mpesa")
        self.assertEqual(p.platform_fee_amount, Decimal("200"))
        self.assertEqual(p.b2b_fee_amount,      Decimal("52"))   # tier 3 (9,800)

    def test_card_has_surcharge_no_other_fees(self):
        p = self._make_payment(10_000, method="card")
        self.assertEqual(p.card_surcharge_amount, Decimal("260"))
        self.assertEqual(p.platform_fee_amount,   Decimal("0"))
        self.assertEqual(p.b2b_fee_amount,         Decimal("0"))

    def test_bank_has_no_fees(self):
        p = self._make_payment(10_000, method="bank")
        self.assertEqual(p.platform_fee_amount,   Decimal("0"))
        self.assertEqual(p.b2b_fee_amount,         Decimal("0"))
        self.assertEqual(p.card_surcharge_amount,  Decimal("0"))

    def test_amount_due_unchanged_for_mpesa(self):
        """Fees are tracked separately; amount_due = rent only."""
        p = self._make_payment(10_000, method="mpesa")
        self.assertEqual(p.amount_due, Decimal("10000"))

    def test_mpesa_landlord_receives_rent_minus_fees(self):
        """Landlord amount = rent - 2% platform fee - B2B fee."""
        p              = self._make_payment(10_000, method="mpesa")
        landlord_rcv   = p.amount_due - p.platform_fee_amount - p.b2b_fee_amount
        self.assertEqual(landlord_rcv, Decimal("9748"))

    def test_card_charge_amount(self):
        """Tenant charge = rent + 2.6% surcharge."""
        p            = self._make_payment(10_000, method="card")
        charge       = p.amount_due + p.card_surcharge_amount
        self.assertEqual(charge, Decimal("10260"))

    def test_card_surcharge_stripped_in_callback(self):
        """Simulates Paystack callback: provider reports 10,260; rent credited = 10,000."""
        p                   = self._make_payment(10_000, method="card")
        provider_amount     = Decimal("10260")
        rent_paid           = provider_amount - p.card_surcharge_amount
        self.assertEqual(rent_paid, Decimal("10000"))


# ──────────────────────────────────────────────────────────────────────────────
# PaymentMethod model — CRUD, single-default enforcement, validation
# ──────────────────────────────────────────────────────────────────────────────

class PaymentMethodModelTests(TestCase):
    """Unit tests for PaymentMethod model (no HTTP layer)."""

    def setUp(self):
        from accounts.models import User
        self.landlord = User.objects.create_user(
            phone    = "0700000001",
            password = "pass",
            full_name= "Test Landlord",
            role     = "landlord",
        )
        self.other_landlord = User.objects.create_user(
            phone    = "0700000002",
            password = "pass",
            full_name= "Other Landlord",
            role     = "landlord",
        )

    def _make_method(self, landlord=None, method_type="TILL", number="123456",
                     name="My Till", is_default=False, is_active=True):
        from payments.models import PaymentMethod
        return PaymentMethod.objects.create(
            landlord               = landlord or self.landlord,
            method_type            = method_type,
            account_number         = number,
            account_name           = name,
            paybill_account_number = "ACC001" if method_type == "PAYBILL" else "",
            is_default             = is_default,
            is_active              = is_active,
        )

    def test_create_till_method(self):
        m = self._make_method()
        self.assertEqual(m.method_type, "TILL")
        self.assertFalse(m.is_default)

    def test_create_paybill_method(self):
        m = self._make_method(method_type="PAYBILL", number="400200", name="Paybill Co")
        self.assertEqual(m.method_type, "PAYBILL")
        self.assertEqual(m.paybill_account_number, "ACC001")

    def test_single_default_enforced_on_create(self):
        """Only one default allowed per landlord."""
        from payments.models import PaymentMethod
        m1 = self._make_method(number="111111", is_default=True)
        m2 = self._make_method(number="222222", is_default=True)
        m1.refresh_from_db()
        self.assertFalse(m1.is_default, "m1 should no longer be default after m2 set default")
        self.assertTrue(m2.is_default)

    def test_single_default_enforced_on_update(self):
        """Setting is_default=True on existing method clears all others."""
        from payments.models import PaymentMethod
        m1 = self._make_method(number="111111", is_default=True)
        m2 = self._make_method(number="222222", is_default=False)
        m2.is_default = True
        m2.save()
        m1.refresh_from_db()
        self.assertFalse(m1.is_default)
        self.assertTrue(m2.is_default)

    def test_default_isolation_between_landlords(self):
        """Clearing defaults only affects the same landlord."""
        from payments.models import PaymentMethod
        m1 = self._make_method(landlord=self.landlord, number="111111", is_default=True)
        m2 = self._make_method(landlord=self.other_landlord, number="222222", is_default=True)
        # Adding a new default for landlord 1 should NOT touch landlord 2's default
        self._make_method(landlord=self.landlord, number="333333", is_default=True)
        m2.refresh_from_db()
        self.assertTrue(m2.is_default, "Other landlord's default should be untouched")

    def test_inactive_method_still_exists(self):
        m = self._make_method(is_active=False)
        self.assertFalse(m.is_active)

    def test_str_includes_default_label(self):
        m = self._make_method(is_default=True, name="Quick Till")
        self.assertIn("[default]", str(m))

    def test_str_no_default_label(self):
        m = self._make_method(is_default=False, name="Quick Till")
        self.assertNotIn("[default]", str(m))


# ──────────────────────────────────────────────────────────────────────────────
# PaymentMethod API — CRUD + set-default endpoint
# ──────────────────────────────────────────────────────────────────────────────

class PaymentMethodAPITests(TestCase):
    """Integration tests for /api/landlord/payment-methods/ endpoints."""

    def setUp(self):
        from accounts.models import User
        from rest_framework.test import APIClient
        self.client = APIClient()

        self.landlord = User.objects.create_user(
            phone    = "0711000001",
            password = "pass",
            full_name= "API Landlord",
            role     = "landlord",
        )
        self.other_landlord = User.objects.create_user(
            phone    = "0711000002",
            password = "pass",
            full_name= "Other Landlord",
            role     = "landlord",
        )

    def _auth(self, user=None):
        self.client.force_authenticate(user or self.landlord)

    def _create_method(self, **kwargs):
        from payments.models import PaymentMethod
        return PaymentMethod.objects.create(
            landlord      = kwargs.pop("landlord", self.landlord),
            method_type   = kwargs.pop("method_type", "TILL"),
            account_number= kwargs.pop("account_number", "123456"),
            account_name  = kwargs.pop("account_name", "My Till"),
            **kwargs,
        )

    def test_list_returns_only_own_methods(self):
        self._create_method(account_number="111111")
        self._create_method(landlord=self.other_landlord, account_number="999999")
        self._auth()
        r = self.client.get("/api/landlord/payment-methods/")
        self.assertEqual(r.status_code, 200)
        numbers = [m["account_number"] for m in r.data]
        self.assertIn("111111", numbers)
        self.assertNotIn("999999", numbers)

    def test_create_till(self):
        self._auth()
        r = self.client.post("/api/landlord/payment-methods/", {
            "method_type":   "TILL",
            "account_number": "654321",
            "account_name":  "Shop Till",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["account_number"], "654321")

    def test_create_paybill_requires_account_ref(self):
        self._auth()
        r = self.client.post("/api/landlord/payment-methods/", {
            "method_type":   "PAYBILL",
            "account_number": "400200",
            "account_name":  "My Paybill",
            # paybill_account_number intentionally missing
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def test_create_paybill_with_account_ref(self):
        self._auth()
        r = self.client.post("/api/landlord/payment-methods/", {
            "method_type":            "PAYBILL",
            "account_number":          "400200",
            "account_name":           "My Paybill",
            "paybill_account_number": "RENT001",
        }, format="json")
        self.assertEqual(r.status_code, 201)

    def test_update_method(self):
        m = self._create_method(account_number="111111")
        self._auth()
        r = self.client.patch(
            f"/api/landlord/payment-methods/{m.id}/",
            {"account_name": "Updated Name"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["account_name"], "Updated Name")

    def test_delete_method(self):
        m = self._create_method(account_number="111111")
        self._auth()
        r = self.client.delete(f"/api/landlord/payment-methods/{m.id}/")
        self.assertEqual(r.status_code, 204)

    def test_cannot_access_other_landlord_method(self):
        m = self._create_method(landlord=self.other_landlord, account_number="999999")
        self._auth()
        r = self.client.get(f"/api/landlord/payment-methods/{m.id}/")
        self.assertEqual(r.status_code, 404)

    def test_set_default_endpoint(self):
        from payments.models import PaymentMethod
        m1 = self._create_method(account_number="111111", is_default=True)
        m2 = self._create_method(account_number="222222", is_default=False)
        self._auth()
        r = self.client.patch(f"/api/landlord/payment-methods/{m2.id}/set-default/")
        self.assertEqual(r.status_code, 200)
        m1.refresh_from_db()
        m2.refresh_from_db()
        self.assertFalse(m1.is_default)
        self.assertTrue(m2.is_default)

    def test_unauthenticated_cannot_list(self):
        r = self.client.get("/api/landlord/payment-methods/")
        self.assertEqual(r.status_code, 401)


# ──────────────────────────────────────────────────────────────────────────────
# B2B disbursement tasks
# ──────────────────────────────────────────────────────────────────────────────

class B2BDisbursementTaskTests(TestCase):
    """
    Tests for initiate_b2b_disbursement and retry_b2b_disbursement Celery tasks.
    All external HTTP calls (Daraja B2B API) are mocked.
    """

    def setUp(self):
        from accounts.models import User
        from properties.models import Property
        from tenancies.models import Tenancy
        from payments.models import Payment, PaymentMethod

        self.landlord = User.objects.create_user(
            phone    = "0722000001",
            password = "pass",
            full_name= "B2B Landlord",
            role     = "landlord",
        )
        self.tenant = User.objects.create_user(
            phone    = "0733000001",
            password = "pass",
            full_name= "B2B Tenant",
            role     = "tenant",
        )
        self.prop = Property.objects.create(
            landlord = self.landlord,
            name     = "Test Property",
            address  = "123 Test St",
        )
        from properties.models import Unit
        self.unit = Unit.objects.create(
            property    = self.prop,
            unit_number = "T1",
            unit_type   = "bedsitter",
            rent_amount = 10_000,
        )
        import datetime
        self.tenancy = Tenancy.objects.create(
            unit             = self.unit,
            tenant           = self.tenant,
            landlord         = self.landlord,
            rent_snapshot    = Decimal("10000"),
            deposit_amount   = Decimal("10000"),
            lease_start_date = datetime.date(2025, 1, 1),
            status           = "active",
        )
        self.payment = Payment.objects.create(
            tenancy               = self.tenancy,
            amount_due            = Decimal("10000"),
            amount_paid           = Decimal("10000"),
            platform_fee_amount   = Decimal("200"),
            b2b_fee_amount        = Decimal("52"),
            payment_type          = "monthly",
            method                = "mpesa",
            status                = "success",
            disbursement_status   = Payment.DisbursementStatus.PENDING,
        )
        self.till_method = PaymentMethod.objects.create(
            landlord      = self.landlord,
            method_type   = "TILL",
            account_number= "111111",
            account_name  = "Landlord Till",
            is_default    = True,
            is_active     = True,
        )

    def test_disbursement_with_default_till(self):
        """initiate_b2b_disbursement calls b2b_pay_till when landlord has a default till."""
        from payments.tasks import initiate_b2b_disbursement
        with patch("payments.tasks.daraja") as mock_daraja:
            mock_daraja.b2b_pay_till.return_value = {
                "OriginatorConversationID": "OC-12345",
                "ConversationID":           "C-12345",
                "ResponseCode":             "0",
            }
            initiate_b2b_disbursement(str(self.payment.id), 9748)
            mock_daraja.b2b_pay_till.assert_called_once()
            call_kwargs = mock_daraja.b2b_pay_till.call_args
            self.assertEqual(call_kwargs.kwargs["amount"], 9748)
            self.assertEqual(call_kwargs.kwargs["till_number"], "111111")

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.disbursement_reference, "OC-12345")

    def test_disbursement_with_paybill(self):
        """initiate_b2b_disbursement calls b2b_pay_paybill for PAYBILL method type."""
        from payments.models import PaymentMethod
        from payments.tasks import initiate_b2b_disbursement
        PaymentMethod.objects.filter(landlord=self.landlord).update(is_default=False)
        pb = PaymentMethod.objects.create(
            landlord               = self.landlord,
            method_type            = "PAYBILL",
            account_number         = "400200",
            account_name           = "Paybill",
            paybill_account_number = "RENT001",
            is_default             = True,
            is_active              = True,
        )
        with patch("payments.tasks.daraja") as mock_daraja:
            mock_daraja.b2b_pay_paybill.return_value = {
                "OriginatorConversationID": "OC-99999",
                "ConversationID":           "C-99999",
            }
            initiate_b2b_disbursement(str(self.payment.id), 9748)
            mock_daraja.b2b_pay_paybill.assert_called_once()

    def test_disbursement_uses_property_method_over_default(self):
        """Per-property payment method takes priority over landlord default."""
        from payments.models import PaymentMethod
        from payments.tasks import initiate_b2b_disbursement
        prop_method = PaymentMethod.objects.create(
            landlord      = self.landlord,
            method_type   = "TILL",
            account_number= "777777",
            account_name  = "Property Till",
            is_default    = False,
            is_active     = True,
        )
        self.prop.payment_method = prop_method
        self.prop.save()

        with patch("payments.tasks.daraja") as mock_daraja:
            mock_daraja.b2b_pay_till.return_value = {"OriginatorConversationID": "OC-PROP"}
            initiate_b2b_disbursement(str(self.payment.id), 9748)
            call_kwargs = mock_daraja.b2b_pay_till.call_args
            self.assertEqual(call_kwargs.kwargs["till_number"], "777777")

    def test_disbursement_fails_gracefully_when_no_method(self):
        """If no payment method is configured, disbursement_status is set to FAILED."""
        from payments.tasks import initiate_b2b_disbursement
        from payments.models import PaymentMethod
        PaymentMethod.objects.all().delete()

        with patch("payments.tasks.notify_disbursement_failed_no_method") as mock_notify:
            initiate_b2b_disbursement(str(self.payment.id), 9748)
            mock_notify.assert_called_once_with(self.payment)

        self.payment.refresh_from_db()
        from payments.models import Payment
        self.assertEqual(self.payment.disbursement_status, Payment.DisbursementStatus.FAILED)

    def test_already_disbursed_is_idempotent(self):
        """If payment is already SUCCESS, initiate_b2b_disbursement does nothing."""
        from payments.tasks import initiate_b2b_disbursement
        from payments.models import Payment
        self.payment.disbursement_status = Payment.DisbursementStatus.SUCCESS
        self.payment.save()

        with patch("payments.tasks.daraja") as mock_daraja:
            initiate_b2b_disbursement(str(self.payment.id), 9748)
            mock_daraja.b2b_pay_till.assert_not_called()

    def test_retry_task_triggers_b2b_again(self):
        """retry_b2b_disbursement re-attempts the B2B call on FAILED payments."""
        from payments.models import Payment
        from payments.tasks import retry_b2b_disbursement
        self.payment.disbursement_status = Payment.DisbursementStatus.FAILED
        self.payment.save()

        with patch("payments.tasks.daraja") as mock_daraja:
            mock_daraja.b2b_pay_till.return_value = {"OriginatorConversationID": "OC-RETRY"}
            retry_b2b_disbursement(str(self.payment.id))
            mock_daraja.b2b_pay_till.assert_called_once()

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.disbursement_status, Payment.DisbursementStatus.PENDING)
        self.assertEqual(self.payment.disbursement_reference, "OC-RETRY")

    def test_admin_email_sent_on_repeated_failure(self):
        """_notify_admin_repeated_failure sends e-mail when ADMIN_EMAIL is set."""
        from payments.tasks import _notify_admin_repeated_failure
        with patch("payments.tasks.send_mail") as mock_mail, \
             self.settings(ADMIN_EMAIL="admin@test.com",
                           DEFAULT_FROM_EMAIL="no-reply@test.com"):
            _notify_admin_repeated_failure(str(self.payment.id), reason="Network error")
            mock_mail.assert_called_once()
            subject = mock_mail.call_args.kwargs.get("subject") or mock_mail.call_args[0][0]
            self.assertIn(str(self.payment.id), subject)


# ──────────────────────────────────────────────────────────────────────────────
# AutoPayment model
# ──────────────────────────────────────────────────────────────────────────────

class AutoPaymentModelTests(TestCase):
    """Unit tests for AutoPayment model (no HTTP layer)."""

    def setUp(self):
        import datetime
        from accounts.models import User
        from properties.models import Property, Unit
        from tenancies.models import Tenancy

        self.landlord = User.objects.create_user(
            phone="0800000001", password="pass", full_name="AP Landlord", role="landlord"
        )
        self.tenant = User.objects.create_user(
            phone="0800000002", password="pass", full_name="AP Tenant", role="tenant"
        )
        self.prop = Property.objects.create(
            landlord=self.landlord, name="AP Property", address="1 AP St"
        )
        self.unit = Unit.objects.create(
            property=self.prop, unit_number="AP1", unit_type="bedsitter", rent_amount=12_000
        )
        self.tenancy = Tenancy.objects.create(
            unit=self.unit, tenant=self.tenant, landlord=self.landlord,
            rent_snapshot=Decimal("12000"), deposit_amount=Decimal("12000"),
            lease_start_date=datetime.date(2025, 1, 1), status="active", due_day=5,
        )

    def _make_ap(self, method="MPESA", status="ACTIVE", due_day=5):
        from payments.models import AutoPayment
        return AutoPayment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy,
            payment_method=method,
            mpesa_number="0722000000" if method == "MPESA" else "",
            card_token="AUTH_xxx" if method == "CARD" else "",
            card_last_four="4242" if method == "CARD" else "",
            due_day=due_day,
            status=status,
            next_due_date=AutoPayment.compute_next_due_date(due_day),
        )

    def test_due_day_defaults_to_5(self):
        from payments.models import AutoPayment
        ap = self._make_ap()
        self.assertEqual(ap.due_day, 5)

    def test_mpesa_auto_payment_creation(self):
        from payments.models import AutoPayment
        ap = self._make_ap(method="MPESA")
        self.assertEqual(ap.payment_method, "MPESA")
        self.assertEqual(ap.status, AutoPayment.STATUS_ACTIVE)
        self.assertIsNotNone(ap.next_due_date)

    def test_card_auto_payment_creation(self):
        from payments.models import AutoPayment
        ap = self._make_ap(method="CARD")
        self.assertEqual(ap.payment_method, "CARD")
        self.assertEqual(ap.card_last_four, "4242")
        self.assertTrue(ap.card_token.startswith("AUTH_"))

    def test_compute_next_due_date_this_month(self):
        """If today's day < due_day, next_due_date is this month."""
        import datetime
        from payments.models import AutoPayment
        # Use a date where day 1 means due_day=15 is still in the future
        after = datetime.date(2025, 6, 1)
        result = AutoPayment.compute_next_due_date(15, after=after)
        self.assertEqual(result, datetime.date(2025, 6, 15))

    def test_compute_next_due_date_next_month(self):
        """If today's day > due_day, next_due_date is next month."""
        import datetime
        from payments.models import AutoPayment
        after = datetime.date(2025, 6, 20)
        result = AutoPayment.compute_next_due_date(5, after=after)
        self.assertEqual(result, datetime.date(2025, 7, 5))

    def test_compute_next_due_date_december_rolls_to_jan(self):
        """December → January year rollover."""
        import datetime
        from payments.models import AutoPayment
        after = datetime.date(2025, 12, 20)
        result = AutoPayment.compute_next_due_date(5, after=after)
        self.assertEqual(result, datetime.date(2026, 1, 5))

    def test_compute_next_due_date_caps_at_28(self):
        """due_day > 28 is capped at 28."""
        import datetime
        from payments.models import AutoPayment
        after = datetime.date(2025, 2, 1)
        result = AutoPayment.compute_next_due_date(31, after=after)
        self.assertLessEqual(result.day, 28)

    def test_unique_active_per_tenancy(self):
        """Can't create two ACTIVE AutoPayments for the same tenancy."""
        from django.db import IntegrityError
        from payments.models import AutoPayment
        self._make_ap()
        with self.assertRaises(Exception):  # UniqueConstraint or IntegrityError
            self._make_ap()

    def test_can_create_new_after_cancellation(self):
        """Can create a new AutoPayment after the previous one is CANCELLED."""
        from payments.models import AutoPayment
        ap = self._make_ap()
        ap.status = AutoPayment.STATUS_CANCELLED
        ap.save()
        ap2 = self._make_ap()   # should not raise
        self.assertEqual(ap2.status, AutoPayment.STATUS_ACTIVE)


# ──────────────────────────────────────────────────────────────────────────────
# AutoPayment API
# ──────────────────────────────────────────────────────────────────────────────

class AutoPaymentAPITests(TestCase):
    """Integration tests for /api/tenant/auto-payments/ endpoints."""

    def setUp(self):
        import datetime
        from accounts.models import User
        from properties.models import Property, Unit
        from tenancies.models import Tenancy
        from rest_framework.test import APIClient

        self.client = APIClient()
        self.landlord = User.objects.create_user(
            phone="0900000001", password="pass", full_name="Landlord", role="landlord"
        )
        self.tenant = User.objects.create_user(
            phone="0900000002", password="pass", full_name="Tenant", role="tenant"
        )
        self.prop = Property.objects.create(
            landlord=self.landlord, name="Test Prop", address="1 Test St"
        )
        self.unit = Unit.objects.create(
            property=self.prop, unit_number="T1", unit_type="bedsitter", rent_amount=10_000
        )
        self.tenancy = Tenancy.objects.create(
            unit=self.unit, tenant=self.tenant, landlord=self.landlord,
            rent_snapshot=Decimal("10000"), deposit_amount=Decimal("10000"),
            lease_start_date=datetime.date(2025, 1, 1), status="active", due_day=5,
        )

    def _auth(self):
        self.client.force_authenticate(self.tenant)

    def test_create_mpesa_autopay(self):
        self._auth()
        r = self.client.post("/api/tenant/auto-payments/", {
            "tenancy_id":     str(self.tenancy.id),
            "payment_method": "MPESA",
            "mpesa_number":   "0722000000",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["payment_method"], "MPESA")
        self.assertIn("next_due_date", r.data)

    def test_create_card_autopay(self):
        self._auth()
        r = self.client.post("/api/tenant/auto-payments/", {
            "tenancy_id":     str(self.tenancy.id),
            "payment_method": "CARD",
            "card_token":     "AUTH_testtoken",
            "card_last_four": "4242",
        }, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["card_last_four"], "4242")

    def test_card_requires_token(self):
        self._auth()
        r = self.client.post("/api/tenant/auto-payments/", {
            "tenancy_id":     str(self.tenancy.id),
            "payment_method": "CARD",
            "card_last_four": "4242",
            # card_token missing
        }, format="json")
        self.assertEqual(r.status_code, 400)

    def test_list_autopayments(self):
        from payments.models import AutoPayment
        AutoPayment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy,
            payment_method="MPESA", mpesa_number="0722000000",
            due_day=5, next_due_date="2025-07-05",
        )
        self._auth()
        r = self.client.get("/api/tenant/auto-payments/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data), 1)

    def test_pause_autopay(self):
        from payments.models import AutoPayment
        ap = AutoPayment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy,
            payment_method="MPESA", mpesa_number="0722000000",
            due_day=5, next_due_date="2025-07-05",
        )
        self._auth()
        r = self.client.patch(f"/api/tenant/auto-payments/{ap.id}/pause/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "PAUSED")

    def test_cancel_autopay(self):
        from payments.models import AutoPayment
        ap = AutoPayment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy,
            payment_method="MPESA", mpesa_number="0722000000",
            due_day=5, next_due_date="2025-07-05",
        )
        self._auth()
        r = self.client.patch(f"/api/tenant/auto-payments/${ap.id}/cancel/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "CANCELLED")

    def test_resume_autopay(self):
        from payments.models import AutoPayment
        ap = AutoPayment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy,
            payment_method="MPESA", mpesa_number="0722000000",
            due_day=5, next_due_date="2025-07-05",
            status="PAUSED",
        )
        self._auth()
        r = self.client.patch(f"/api/tenant/auto-payments/{ap.id}/resume/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["status"], "ACTIVE")

    def test_update_mpesa_number(self):
        from payments.models import AutoPayment
        ap = AutoPayment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy,
            payment_method="MPESA", mpesa_number="0722000000",
            due_day=5, next_due_date="2025-07-05",
        )
        self._auth()
        r = self.client.patch(f"/api/tenant/auto-payments/{ap.id}/update-mpesa/",
                              {"mpesa_number": "0733999999"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["mpesa_number"], "0733999999")

    def test_unauthenticated_blocked(self):
        r = self.client.get("/api/tenant/auto-payments/")
        self.assertEqual(r.status_code, 401)


# ──────────────────────────────────────────────────────────────────────────────
# trigger_automatic_payments task + due date propagation
# ──────────────────────────────────────────────────────────────────────────────

class TriggerAutomaticPaymentsTests(TestCase):
    """Tests for the Celery Beat trigger_automatic_payments task."""

    def setUp(self):
        import datetime
        from accounts.models import User
        from properties.models import Property, Unit
        from tenancies.models import Tenancy
        from payments.models import AutoPayment

        self.landlord = User.objects.create_user(
            phone="0600000001", password="pass", full_name="Trigger Landlord", role="landlord"
        )
        self.tenant = User.objects.create_user(
            phone="0600000002", password="pass", full_name="Trigger Tenant", role="tenant"
        )
        prop = Property.objects.create(
            landlord=self.landlord, name="Trigger Prop", address="1 T St"
        )
        unit = Unit.objects.create(
            property=prop, unit_number="TR1", unit_type="bedsitter", rent_amount=9_000
        )
        self.tenancy = Tenancy.objects.create(
            unit=unit, tenant=self.tenant, landlord=self.landlord,
            rent_snapshot=Decimal("9000"), deposit_amount=Decimal("9000"),
            lease_start_date=datetime.date(2025, 1, 1), status="active", due_day=5,
        )
        import datetime as dt
        today = dt.date.today()
        self.ap = AutoPayment.objects.create(
            tenant=self.tenant, tenancy=self.tenancy,
            payment_method="MPESA", mpesa_number="0722000001",
            due_day=5, next_due_date=today,   # due today
        )

    @patch("payments.tasks._trigger_mpesa_autopay")
    def test_stk_push_triggered_on_due_date(self, mock_mpesa):
        """trigger_automatic_payments dispatches _trigger_mpesa_autopay for due M-Pesa auto-pay."""
        from payments.tasks import trigger_automatic_payments
        trigger_automatic_payments()
        mock_mpesa.apply_async.assert_called_once_with(
            args=[str(self.ap.id)], countdown=0
        )

    @patch("payments.tasks._trigger_card_autopay")
    def test_card_charge_triggered_on_due_date(self, mock_card):
        """trigger_automatic_payments calls _trigger_card_autopay for due card auto-pay."""
        from payments.models import AutoPayment
        self.ap.payment_method = "CARD"
        self.ap.card_token     = "AUTH_test"
        self.ap.card_last_four = "1234"
        self.ap.save()

        from payments.tasks import trigger_automatic_payments
        trigger_automatic_payments()
        mock_card.delay.assert_called_once_with(str(self.ap.id))

    @patch("payments.tasks._trigger_mpesa_autopay")
    def test_paused_not_triggered(self, mock_mpesa):
        """PAUSED auto-payments are not triggered."""
        from payments.models import AutoPayment
        self.ap.status = AutoPayment.STATUS_PAUSED
        self.ap.save()

        from payments.tasks import trigger_automatic_payments
        trigger_automatic_payments()
        mock_mpesa.apply_async.assert_not_called()

    @patch("payments.tasks._trigger_mpesa_autopay")
    def test_future_due_date_not_triggered(self, mock_mpesa):
        """Auto-payments with future next_due_date are not triggered today."""
        import datetime as dt
        self.ap.next_due_date = dt.date.today().replace(year=dt.date.today().year + 1)
        self.ap.save()

        from payments.tasks import trigger_automatic_payments
        trigger_automatic_payments()
        mock_mpesa.apply_async.assert_not_called()

    @patch("payments.tasks._trigger_mpesa_autopay")
    def test_multiple_units_same_tenant_staggered(self, mock_mpesa):
        """Two M-Pesa auto-pays for the same tenant are staggered 180 s apart."""
        import datetime as dt
        from accounts.models import User
        from payments.models import AutoPayment
        from properties.models import Unit
        from tenancies.models import Tenancy

        # Add a second unit/tenancy for the same tenant, same phone number
        unit2 = Unit.objects.create(
            property=self.tenancy.unit.property,
            unit_number="TR2", unit_type="bedsitter", rent_amount=9_000,
        )
        tenancy2 = Tenancy.objects.create(
            unit=unit2, tenant=self.tenant, landlord=self.landlord,
            rent_snapshot=Decimal("9000"), deposit_amount=Decimal("9000"),
            lease_start_date=dt.date(2025, 1, 1), status="active", due_day=5,
        )
        ap2 = AutoPayment.objects.create(
            tenant=self.tenant, tenancy=tenancy2,
            payment_method="MPESA", mpesa_number="0722000001",  # same phone
            due_day=5, next_due_date=dt.date.today(),
        )

        from payments.tasks import trigger_automatic_payments
        trigger_automatic_payments()

        calls = mock_mpesa.apply_async.call_args_list
        self.assertEqual(len(calls), 2)
        countdowns = sorted(c.kwargs["countdown"] for c in calls)
        self.assertEqual(countdowns, [0, 180])

    def test_landlord_due_day_change_propagates(self):
        """Changing tenancy.due_day via API updates AutoPayment.due_day and next_due_date."""
        from rest_framework.test import APIClient
        from accounts.models import User
        client = APIClient()
        client.force_authenticate(self.landlord)

        r = client.patch(
            f"/api/landlord/tenancies/{self.tenancy.id}/due-day/",
            {"due_day": 15}, format="json"
        )
        self.assertEqual(r.status_code, 200)
        self.ap.refresh_from_db()
        self.assertEqual(self.ap.due_day, 15)
        self.assertEqual(self.ap.next_due_date.day, 15)

    @patch("payments.mpesa.daraja.daraja")
    @patch("payments.tasks.send_sms", create=True)
    def test_failed_mpesa_sends_sms_and_schedules_retry(self, mock_sms, mock_daraja):
        """On STK push failure, tenant receives SMS and retry is scheduled."""
        mock_daraja.stk_push.side_effect = Exception("Daraja unavailable")

        with patch("payments.tasks.auto_mpesa_retry") as mock_retry:
            from payments.tasks import _trigger_mpesa_autopay
            _trigger_mpesa_autopay(str(self.ap.id))
            mock_retry.apply_async.assert_called_once()


# ──────────────────────────────────────────────────────────────────────────────
# Partial Payment — is_partial / balance_due / PayBalanceView
# ──────────────────────────────────────────────────────────────────────────────

class PartialPaymentModelTests(TestCase):
    """mark_success() correctly sets/clears is_partial and balance_due."""

    def _make_payment(self, amount_due):
        from payments.models import Payment
        from tenancies.models import Tenancy
        from accounts.models import User
        from properties.models import Property, Unit
        import uuid
        suffix = uuid.uuid4().hex[:6]
        landlord = User.objects.create_user(phone=f"07001{suffix}", password="pass", full_name=f"LL {suffix}", role="landlord")
        tenant   = User.objects.create_user(phone=f"07003{suffix}", password="pass", full_name=f"TN {suffix}", role="tenant")
        prop = Property.objects.create(landlord=landlord, name="P", address="A")
        unit = Unit.objects.create(property=prop, unit_number="T1", rent_amount=amount_due)
        tenancy = Tenancy.objects.create(
            landlord=landlord, tenant=tenant, unit=unit,
            rent_snapshot=amount_due, deposit_amount=0,
            lease_start_date="2024-01-01", status="active",
        )
        return Payment.objects.create(
            tenancy=tenancy, amount_due=amount_due,
            payment_type="monthly", method="mpesa",
            status="pending",
        )

    def test_full_payment_clears_partial_flag(self):
        p = self._make_payment(10000)
        p.mark_success("TX001", amount_paid=10000)
        self.assertFalse(p.is_partial)
        self.assertIsNone(p.balance_due)

    def test_partial_payment_sets_is_partial_and_balance(self):
        p = self._make_payment(10000)
        p.mark_success("TX002", amount_paid=7000)
        self.assertTrue(p.is_partial)
        self.assertEqual(p.balance_due, Decimal("3000"))

    def test_balance_property_reflects_partial(self):
        p = self._make_payment(10000)
        p.mark_success("TX003", amount_paid=4000)
        self.assertEqual(p.balance, Decimal("6000"))


class PayBalanceViewTests(TestCase):
    """POST /api/payments/pay-balance/<id>/ endpoint."""

    def setUp(self):
        from rest_framework.test import APIClient
        from payments.models import Payment
        from tenancies.models import Tenancy
        from accounts.models import User
        from properties.models import Property, Unit

        self.client   = APIClient()
        landlord = User.objects.create_user(phone="0700555666", password="pass", full_name="PBL Landlord", role="landlord")
        self.tenant   = User.objects.create_user(phone="0700777888", password="pass", full_name="PBL Tenant", role="tenant")
        prop     = Property.objects.create(landlord=landlord, name="PP", address="AA")
        unit     = Unit.objects.create(property=prop, unit_number="B1", rent_amount=10000)
        self.tenancy = Tenancy.objects.create(
            landlord=landlord, tenant=self.tenant, unit=unit,
            rent_snapshot=10000, deposit_amount=0,
            lease_start_date="2024-01-01", status="active",
        )
        self.payment = Payment.objects.create(
            tenancy=self.tenancy, amount_due=10000, amount_paid=7000,
            payment_type="monthly", method="mpesa", status="success",
            is_partial=True, balance_due=Decimal("3000"),
        )
        self.client.force_authenticate(self.tenant)

    def test_returns_400_when_no_balance(self):
        self.payment.is_partial = False
        self.payment.balance_due = None
        self.payment.save()
        r = self.client.post(f"/api/payments/pay-balance/{self.payment.id}/", {"payment_method": "mpesa"})
        self.assertEqual(r.status_code, 400)

    @patch("payments.views.daraja")
    def test_mpesa_balance_creates_pending_payment(self, mock_daraja):
        from payments.models import Payment as P
        mock_daraja.stk_push.return_value = {"CheckoutRequestID": "CHK_BALANCE"}
        r = self.client.post(
            f"/api/payments/pay-balance/{self.payment.id}/",
            {"payment_method": "mpesa", "phone": "0700777888"},
        )
        self.assertEqual(r.status_code, 200)
        bal_payment = P.objects.get(id=r.data["payment_id"])
        self.assertEqual(bal_payment.payment_type, "balance")
        self.assertEqual(bal_payment.parent_payment_id, self.payment.id)
        self.assertEqual(bal_payment.amount_due, Decimal("3000"))

    @patch("payments.views.daraja")
    def test_card_balance_includes_surcharge(self, mock_daraja):
        from payments.models import Payment as P
        mock_daraja.stk_push.return_value = {}
        with patch("payments.views.paystack") as mock_ps:
            mock_ps.initiate_payment.return_value = {"data": {"authorization_url": "http://pay.test"}}
            r = self.client.post(
                f"/api/payments/pay-balance/{self.payment.id}/",
                {"payment_method": "card"},
            )
        self.assertEqual(r.status_code, 200)
        bal_payment = P.objects.get(id=r.data["payment_id"])
        # 2.6% surcharge on 3000 = 78
        self.assertAlmostEqual(float(bal_payment.card_surcharge_amount), 78.0, places=0)

    @patch("payments.views.daraja")
    def test_callback_clears_parent_partial_flags(self, mock_daraja):
        from payments.models import Payment as P
        mock_daraja.stk_push.return_value = {"CheckoutRequestID": "CHK_CLR"}
        r = self.client.post(
            f"/api/payments/pay-balance/{self.payment.id}/",
            {"payment_method": "mpesa", "phone": "0700777888"},
        )
        bal_payment = P.objects.get(id=r.data["payment_id"])

        # Simulate M-Pesa callback marking success
        callback_payload = {
            "Body": {"stkCallback": {
                "MerchantRequestID": "MR1",
                "CheckoutRequestID": "CHK_CLR",
                "ResultCode": 0,
                "ResultDesc": "Success",
                "CallbackMetadata": {"Item": [
                    {"Name": "MpesaReceiptNumber", "Value": "PNX12345"},
                    {"Name": "Amount",             "Value": 3000},
                    {"Name": "PhoneNumber",        "Value": 254700777888},
                ]},
            }}
        }
        anon = self.client.__class__()
        anon.post("/api/payments/mpesa/callback/", callback_payload, format="json")

        self.payment.refresh_from_db()
        self.assertFalse(self.payment.is_partial)
        self.assertIsNone(self.payment.balance_due)
        self.assertIsNotNone(self.payment.balance_paid_at)
