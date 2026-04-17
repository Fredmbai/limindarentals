import hmac
import hashlib
import requests
from django.conf import settings


class PaystackAPI:
    """
    Handles card payments (Visa/Mastercard/Amex) via Paystack Kenya.

    Flow:
      1. initiate_payment()         — create a payment session, get auth_url
      2. verify_payment()           — verify transaction after redirect
      3. verify_webhook_signature() — validate webhook is genuinely from Paystack

    Two ways payment completes:
      A. Redirect: tenant pays → Paystack redirects to our callback_url
         → we call verify_payment() to confirm
      B. Webhook: Paystack POSTs to our webhook URL automatically
         → we verify signature, then call verify_payment() to confirm

    Always use BOTH — redirect for immediate UX, webhook as the safety net.
    """

    BASE_URL = "https://api.paystack.co"

    def __init__(self):
        self.secret_key     = settings.PAYSTACK_SECRET_KEY
        self.public_key     = settings.PAYSTACK_PUBLIC_KEY
        self.webhook_secret = settings.PAYSTACK_SECRET_KEY  # Paystack uses secret key for webhook verification
        self.headers        = {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type":  "application/json",
        }

    def initiate_payment(
        self,
        payment_id:   str,
        amount_kes:   int,
        email:        str,
        full_name:    str,
        phone:        str,
        description:  str,
        callback_url: str,
        channels:     list | None = None,
    ) -> dict:
        """
        Initialises a Paystack transaction.
        Returns authorization_url — redirect tenant here to complete payment.

        IMPORTANT: Paystack amount is in KOBO/CENTS (smallest currency unit).
        For KES: multiply by 100. KES 15,000 = 1,500,000 kobo.

        reference = our payment UUID — Paystack sends it back so we can
        match the webhook/redirect to the right Payment record.
        """
        payload = {
            "email":        email or f"{phone}@lumidahrentals.com",
            "amount":       amount_kes * 100,      # convert KES to kobo
            "currency":     "KES",
            "reference":    str(payment_id),       # our internal payment ID
            "callback_url": callback_url,
            "metadata": {
                "payment_id":  str(payment_id),
                "full_name":   full_name,
                "phone":       phone,
                "custom_fields": [
                    {
                        "display_name": "Tenant Name",
                        "variable_name": "tenant_name",
                        "value": full_name,
                    },
                    {
                        "display_name": "Description",
                        "variable_name": "description",
                        "value": description,
                    },
                ],
            },
        }
        if channels:
            payload["channels"] = channels

        response = requests.post(
            f"{self.BASE_URL}/transaction/initialize",
            json    = payload,
            headers = self.headers,
            timeout = 30,
        )
        response.raise_for_status()
        return response.json()
        # response["data"]["authorization_url"] → redirect tenant here
        # response["data"]["reference"]         → our payment_id back

    def verify_payment(self, reference: str) -> dict:
        """
        Verifies a transaction by reference (our payment UUID).
        Call this:
          1. When tenant is redirected back to our site after paying
          2. From the webhook handler as double-verification

        Check: response["data"]["status"] == "success"
        Check: response["data"]["amount"] / 100 == amount we expected (KES)
        Check: response["data"]["currency"] == "KES"
        """
        response = requests.get(
            f"{self.BASE_URL}/transaction/verify/{reference}",
            headers = self.headers,
            timeout = 30,
        )
        response.raise_for_status()
        return response.json()

    def charge_authorization(
        self,
        authorization_code: str,
        email: str,
        amount_kes: int,
        reference: str,
        metadata: dict | None = None,
    ) -> dict:
        """
        Charges a previously-tokenized card using its authorization_code.
        Used for automatic (recurring) card payments — the tenant is NOT
        redirected anywhere; the charge happens server-side.

        Args:
            authorization_code: Paystack auth code stored as card_token
            email:              customer email (must match original transaction)
            amount_kes:         amount in KES (will be converted to kobo)
            reference:          our unique reference (payment UUID)
            metadata:           optional dict with extra info

        Returns:
            Paystack API response; check response["data"]["status"] == "success"
        """
        payload = {
            "authorization_code": authorization_code,
            "email":   email,
            "amount":  amount_kes * 100,   # KES → kobo
            "currency": "KES",
            "reference": reference,
        }
        if metadata:
            payload["metadata"] = metadata

        response = requests.post(
            f"{self.BASE_URL}/transaction/charge_authorization",
            json    = payload,
            headers = self.headers,
            timeout = 30,
        )
        response.raise_for_status()
        return response.json()

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """
        Security check — confirms the webhook came from Paystack.
        Paystack sends 'x-paystack-signature' header = HMAC-SHA512 of payload.

        ALWAYS call this before processing any webhook.
        Without this check, anyone could POST fake payment confirmations.
        """
        expected = hmac.new(
            self.secret_key.encode("utf-8"),
            payload,
            hashlib.sha512,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


# Single instance — import this everywhere in payments app
paystack = PaystackAPI()