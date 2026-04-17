import base64
import requests
from datetime import datetime
from django.conf import settings


class DarajaAPI:
    """
    Handles all communication with Safaricom Daraja API.

    Flow:
      1. get_access_token()  — authenticate with Safaricom
      2. stk_push()          — trigger payment prompt on tenant's phone
      3. verify_transaction() — check status of a transaction

    Callback (handled in views.py):
      Safaricom sends a POST to MPESA_CALLBACK_URL when payment completes.
      We never trust the frontend — only this callback marks payment success.
    """

    BASE_URL_SANDBOX    = "https://sandbox.safaricom.co.ke"
    BASE_URL_PRODUCTION = "https://api.safaricom.co.ke"

    def __init__(self):
        self.consumer_key    = settings.MPESA_CONSUMER_KEY
        self.consumer_secret = settings.MPESA_CONSUMER_SECRET
        self.shortcode       = settings.MPESA_SHORTCODE
        self.passkey         = settings.MPESA_PASSKEY
        self.callback_url    = settings.MPESA_CALLBACK_URL
        # Use sandbox during development, production when live
        self.base_url        = (
            self.BASE_URL_PRODUCTION
            if not settings.DEBUG
            else self.BASE_URL_SANDBOX
        )

    def get_access_token(self) -> str:
        """
        Authenticates with Safaricom using consumer key + secret.
        Returns a Bearer token valid for 1 hour.
        In production, cache this token to avoid hitting the auth
        endpoint on every payment — Safaricom rate-limits it.
        """
        credentials = base64.b64encode(
            f"{self.consumer_key}:{self.consumer_secret}".encode()
        ).decode("utf-8")

        response = requests.get(
            f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
            headers={"Authorization": f"Basic {credentials}"},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()["access_token"]

    def get_password(self, timestamp: str) -> str:
        """
        Daraja password = base64(shortcode + passkey + timestamp)
        Generated fresh for each STK push request.
        """
        raw = f"{self.shortcode}{self.passkey}{timestamp}"
        return base64.b64encode(raw.encode()).decode("utf-8")

    def stk_push(self, phone: str, amount: int, payment_id: str, description: str) -> dict:
        """
        Triggers the M-Pesa payment prompt on the tenant's phone.

        Args:
            phone:       tenant phone in 2547XXXXXXXX format
            amount:      amount in KES (integer, no decimals)
            payment_id:  our internal payment UUID — sent as AccountReference
                         so we can match the callback to the right payment
            description: shown on tenant's phone e.g. "Rent - Unit A1"

        Returns:
            Daraja response dict with CheckoutRequestID and MerchantRequestID
            Store these — needed to match the callback.
        """
        access_token = self.get_access_token()
        timestamp    = datetime.now().strftime("%Y%m%d%H%M%S")
        password     = self.get_password(timestamp)

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password":          password,
            "Timestamp":         timestamp,
            "TransactionType":   "CustomerPayBillOnline",
            "Amount":            amount,
            "PartyA":            phone,         # tenant's phone
            "PartyB":            self.shortcode,
            "PhoneNumber":       phone,
            "CallBackURL":       self.callback_url,
            "AccountReference":  str(payment_id)[:12],  # max 12 chars
            "TransactionDesc":   description[:13],       # max 13 chars
        }

        response = requests.post(
            f"{self.base_url}/mpesa/stkpush/v1/processrequest",
            json    = payload,
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type":  "application/json",
            },
            timeout = 30,
        )
        response.raise_for_status()
        return response.json()

    def verify_transaction(self, checkout_request_id: str) -> dict:
        """
        Queries the status of an STK push transaction.
        Use this if the callback hasn't arrived after 30 seconds
        (network issues, Safaricom delay, etc.)
        """
        access_token = self.get_access_token()
        timestamp    = datetime.now().strftime("%Y%m%d%H%M%S")
        password     = self.get_password(timestamp)

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password":          password,
            "Timestamp":         timestamp,
            "CheckoutRequestID": checkout_request_id,
        }

        response = requests.post(
            f"{self.base_url}/mpesa/stkpushquery/v1/query",
            json    = payload,
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type":  "application/json",
            },
            timeout = 30,
        )
        response.raise_for_status()
        return response.json()

    def b2b_pay_till(
        self,
        till_number: str,
        amount: int,
        originator_conversation_id: str,
        remarks: str = "Rent disbursement",
    ) -> dict:
        """
        Sends collected rent to a landlord's Till Number via M-Pesa B2B
        BusinessBuyGoods (CommandID: BusinessBuyGoods).

        Args:
            till_number:                  landlord's till number
            amount:                       amount in KES (after fees deducted)
            originator_conversation_id:   our payment UUID — echoed back in result
            remarks:                      brief description (max 100 chars)

        Returns:
            Daraja response with ConversationID and OriginatorConversationID.
        """
        access_token = self.get_access_token()
        payload = {
            "Initiator":                  settings.MPESA_B2B_INITIATOR_NAME,
            "SecurityCredential":         settings.MPESA_B2B_SECURITY_CREDENTIAL,
            "CommandID":                  "BusinessBuyGoods",
            "SenderIdentifierType":       "4",   # 4 = Organisation
            "RecieverIdentifierType":     "2",   # 2 = Till Number
            "Amount":                     amount,
            "PartyA":                     self.shortcode,
            "PartyB":                     till_number,
            "AccountReference":           originator_conversation_id[:12],
            "Requester":                  "",
            "Remarks":                    remarks[:100],
            "QueueTimeOutURL":            settings.MPESA_B2B_QUEUE_TIMEOUT_URL,
            "ResultURL":                  settings.MPESA_B2B_RESULT_URL,
        }
        response = requests.post(
            f"{self.base_url}/mpesa/b2b/v1/paymentrequest",
            json    = payload,
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type":  "application/json",
            },
            timeout = 30,
        )
        response.raise_for_status()
        return response.json()

    def b2b_pay_paybill(
        self,
        paybill_number: str,
        account_reference: str,
        amount: int,
        originator_conversation_id: str,
        remarks: str = "Rent disbursement",
    ) -> dict:
        """
        Sends collected rent to a landlord's Paybill via M-Pesa B2B
        BusinessPayBill (CommandID: BusinessPayBill).

        Args:
            paybill_number:               landlord's paybill business number
            account_reference:            paybill account reference
            amount:                       amount in KES (after fees deducted)
            originator_conversation_id:   our payment UUID
            remarks:                      brief description (max 100 chars)

        Returns:
            Daraja response with ConversationID and OriginatorConversationID.
        """
        access_token = self.get_access_token()
        payload = {
            "Initiator":                  settings.MPESA_B2B_INITIATOR_NAME,
            "SecurityCredential":         settings.MPESA_B2B_SECURITY_CREDENTIAL,
            "CommandID":                  "BusinessPayBill",
            "SenderIdentifierType":       "4",   # 4 = Organisation
            "RecieverIdentifierType":     "4",   # 4 = Paybill
            "Amount":                     amount,
            "PartyA":                     self.shortcode,
            "PartyB":                     paybill_number,
            "AccountReference":           account_reference[:12],
            "Requester":                  "",
            "Remarks":                    remarks[:100],
            "QueueTimeOutURL":            settings.MPESA_B2B_QUEUE_TIMEOUT_URL,
            "ResultURL":                  settings.MPESA_B2B_RESULT_URL,
        }
        response = requests.post(
            f"{self.base_url}/mpesa/b2b/v1/paymentrequest",
            json    = payload,
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type":  "application/json",
            },
            timeout = 30,
        )
        response.raise_for_status()
        return response.json()


# Single instance — import this everywhere
daraja = DarajaAPI()