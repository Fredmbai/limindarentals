from django.urls import path
from .views import (
    PaymentMethodListCreateView,
    PaymentMethodDetailView,
    PaymentMethodSetDefaultView,
)

urlpatterns = [
    path("",          PaymentMethodListCreateView.as_view(), name="payment-method-list"),
    path("<uuid:pk>/", PaymentMethodDetailView.as_view(),    name="payment-method-detail"),
    path("<uuid:pk>/set-default/", PaymentMethodSetDefaultView.as_view(), name="payment-method-set-default"),
]
