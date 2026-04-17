from django.urls import path
from .views import (
    AutoPaymentListCreateView,
    AutoPaymentPauseView,
    AutoPaymentCancelView,
    AutoPaymentResumeView,
    AutoPaymentUpdateMpesaView,
    AutoPaymentUpdateCardView,
)

urlpatterns = [
    path("",                       AutoPaymentListCreateView.as_view(), name="auto-payment-list"),
    path("<uuid:pk>/pause/",       AutoPaymentPauseView.as_view(),      name="auto-payment-pause"),
    path("<uuid:pk>/cancel/",      AutoPaymentCancelView.as_view(),     name="auto-payment-cancel"),
    path("<uuid:pk>/resume/",      AutoPaymentResumeView.as_view(),     name="auto-payment-resume"),
    path("<uuid:pk>/update-mpesa/",AutoPaymentUpdateMpesaView.as_view(),name="auto-payment-update-mpesa"),
    path("<uuid:pk>/update-card/", AutoPaymentUpdateCardView.as_view(), name="auto-payment-update-card"),
]
