from django.urls import path
from .views import LandlordSettingsView
from notifications.views import LandlordSendNotificationView
urlpatterns = [
    path("", LandlordSettingsView.as_view(), name="landlord-settings"),
    path("notify/", LandlordSendNotificationView.as_view(),  name="landlord-notify"),
]