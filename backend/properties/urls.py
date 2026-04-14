from django.urls import path
from .views import (
    LandlordVacantUnitsView,
    PropertyListCreateView,
    PropertyDetailView,
    BlockListCreateView,
    UnitListCreateView,
    UnitDetailView,
    VacantUnitsView,
    PropertyPayoutSettingsView,
)

urlpatterns = [
    # Properties
    path("",
         PropertyListCreateView.as_view(),
         name="property-list-create"),

    path("<uuid:pk>/",
         PropertyDetailView.as_view(),
         name="property-detail"),

    # Blocks within a property
    path("<uuid:property_id>/blocks/",
         BlockListCreateView.as_view(),
         name="block-list-create"),

    # Units within a property
    path("<uuid:property_id>/units/",
         UnitListCreateView.as_view(),
         name="unit-list-create"),

    path("<uuid:property_id>/units/<uuid:pk>/",
         UnitDetailView.as_view(),
         name="unit-detail"),

    # Vacant units — used by tenants during registration
    path("<uuid:property_id>/vacant-units/",
         VacantUnitsView.as_view(),
         name="vacant-units"),


     path("landlord/<uuid:landlord_id>/vacant-units/",
          LandlordVacantUnitsView.as_view(),
          name="landlord-vacant-units"),

    # Per-property payout settings override
    path("<uuid:property_id>/payout/",
         PropertyPayoutSettingsView.as_view(),
         name="property-payout-settings"),
]