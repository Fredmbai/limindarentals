from django.urls import path
from .views import (
    CaretakerContextView,
    CaretakerTenantsView,
    CaretakerMaintenanceView,
    CaretakerCollectionReportView,
)

urlpatterns = [
    path("context/",         CaretakerContextView.as_view(),          name="caretaker-context"),
    path("tenants/",         CaretakerTenantsView.as_view(),          name="caretaker-tenants"),
    path("maintenance/",     CaretakerMaintenanceView.as_view(),       name="caretaker-maintenance"),
    path("maintenance/<uuid:pk>/", CaretakerMaintenanceView.as_view(), name="caretaker-maintenance-update"),
    path("report/",          CaretakerCollectionReportView.as_view(),  name="caretaker-report"),
]