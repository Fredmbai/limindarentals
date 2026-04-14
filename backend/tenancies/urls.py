# ─────────────────────────────────────────────
# tenancies/urls.py
# ─────────────────────────────────────────────
from django.urls import path
from .views import (
    AddTenantByStaffView,
    ChangeRentalUnitView,
    DeleteMyAccountView,
    EndMyTenancyView,
    MyTenanciesView,
    CreateTenancyView,
    PropertyTenantsView,
    TenancyAvailableUnitsView,
    TenancyDetailView,
    LandlordTenanciesView,
    EndTenancyView,
)

urlpatterns = [
    # Tenant
    path("my/",      MyTenanciesView.as_view(),   name="my-tenancies"),
    path("create/",  CreateTenancyView.as_view(),  name="create-tenancy"),
    path("<uuid:pk>/", TenancyDetailView.as_view(), name="tenancy-detail"),

    # Landlord
    path("landlord/",          LandlordTenanciesView.as_view(), name="landlord-tenancies"),
    path("<uuid:pk>/end/",     EndTenancyView.as_view(),        name="end-tenancy"),
    path("<uuid:pk>/end-self/",    EndMyTenancyView.as_view(),    name="end-self"),
    path("<uuid:pk>/change-unit/", ChangeRentalUnitView.as_view(), name="change-unit"),
    path("<uuid:pk>/available-units/", TenancyAvailableUnitsView.as_view(), name="available-units"),
    path("add-tenant/", AddTenantByStaffView.as_view(), name="add-tenant"),
    path("property/<uuid:property_id>/tenants/",
     PropertyTenantsView.as_view(),
     name="property-tenants"),
    path("delete-account/", DeleteMyAccountView.as_view(), name="delete-account"),
]
