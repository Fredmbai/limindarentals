from django.urls import path
from .views import (
    NotificationListView,
    MarkNotificationReadView,
    MarkAllReadView,
    UnreadCountView,
    LandlordSettingsView,
    PushSubscribeView,
)

urlpatterns = [
    path("",                  NotificationListView.as_view(),    name="notifications"),
    path("<uuid:pk>/read/",   MarkNotificationReadView.as_view(), name="mark-read"),
    path("read-all/",         MarkAllReadView.as_view(),          name="mark-all-read"),
    path("unread-count/",     UnreadCountView.as_view(),          name="unread-count"),
    # Web Push
    path("push/subscribe/",   PushSubscribeView.as_view(),        name="push-subscribe"),
    path("push/vapid-key/",   PushSubscribeView.as_view(),        name="push-vapid-key"),
]