# ─────────────────────────────────────────────
# payments/urls.py  (updated for Paystack)
# ─────────────────────────────────────────────
from django.urls import path
from .views import (
    InitiatePaymentView,
    MpesaCallbackView,
    PaystackWebhookView,
    PaystackReturnView,
    BankProofUploadView,
    BankPaymentVerifyView,
    MyPaymentsView,
    PaymentStatusView,
    LandlordPaymentsView,
    MyReceiptsView,
    ReceiptDownloadView,
    TenancyReceiptsView,
    TenancyPaymentsView,
)

urlpatterns = [
    # Initiate any payment
    path("initiate/",
         InitiatePaymentView.as_view(),
         name="initiate-payment"),

    # M-Pesa — called by Safaricom
    path("mpesa/callback/",
         MpesaCallbackView.as_view(),
         name="mpesa-callback"),

    # Paystack — webhook (called by Paystack) + return (tenant redirected back)
    path("card/webhook/",
         PaystackWebhookView.as_view(),
         name="paystack-webhook"),

    path("card/return/",
         PaystackReturnView.as_view(),
         name="paystack-return"),

    # Bank transfer
    path("<uuid:pk>/bank-proof/",
         BankProofUploadView.as_view(),
         name="bank-proof-upload"),

    path("<uuid:pk>/verify-bank/",
         BankPaymentVerifyView.as_view(),
         name="verify-bank-payment"),

    # History + status polling
    path("",            MyPaymentsView.as_view(),    name="my-payments"),
    path("<uuid:pk>/status/", PaymentStatusView.as_view(), name="payment-status"),
    path("landlord/",   LandlordPaymentsView.as_view(), name="landlord-payments"),

    # Receipts
    path("receipts/",          MyReceiptsView.as_view(),     name="my-receipts"),
    path("receipts/<uuid:pk>/", ReceiptDownloadView.as_view(), name="receipt-download"),


     path("tenancy/<uuid:tenancy_id>/",          TenancyPaymentsView.as_view(),  name="tenancy-payments"),
     path("tenancy/<uuid:tenancy_id>/receipts/", TenancyReceiptsView.as_view(),  name="tenancy-receipts"),
]

