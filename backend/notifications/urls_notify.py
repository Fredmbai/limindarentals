from django.urls import path
from .views import LandlordSendNotificationView

urlpatterns = [
    path("", LandlordSendNotificationView.as_view(), name="landlord-notify"),
]