from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from payments.views import TenancyDueDayView

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/auth/",          include("accounts.urls")),
    path("api/properties/",    include("properties.urls")),
    path("api/tenancies/",     include("tenancies.urls")),
    path("api/payments/",      include("payments.urls")),
    path("api/maintenance/",   include("maintenance.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/landlord/settings/", include("notifications.urls_settings")),
    path("api/landlord/payment-methods/", include("payments.urls_payment_methods")),
    path("api/tenant/auto-payments/",     include("payments.urls_auto_payments")),
    path("api/landlord/tenancies/<uuid:tenancy_id>/due-day/",
         TenancyDueDayView.as_view(), name="tenancy-due-day"),
    path("api/caretaker/", include("caretaker.urls")),
    path("api/landlord/notify/", include("notifications.urls_notify")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)