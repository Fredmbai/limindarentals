from django.urls import path
from .views import MaintenanceListCreateView, LandlordMaintenanceView, MaintenanceUpdateView

urlpatterns = [
    path("",          MaintenanceListCreateView.as_view(), name="maintenance-list-create"),
    path("landlord/", LandlordMaintenanceView.as_view(),   name="landlord-maintenance"),
    path("<uuid:pk>/", MaintenanceUpdateView.as_view(),    name="maintenance-update"),
]