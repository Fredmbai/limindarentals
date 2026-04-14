from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/auth/",          include("accounts.urls")),
    path("api/properties/",    include("properties.urls")),
    path("api/tenancies/",     include("tenancies.urls")),
    path("api/payments/",      include("payments.urls")),
    path("api/maintenance/",   include("maintenance.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/landlord/settings/", include("notifications.urls_settings")),
    path("api/caretaker/", include("caretaker.urls")),
    path("api/landlord/notify/", include("notifications.urls_notify")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)