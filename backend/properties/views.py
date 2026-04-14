from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.shortcuts import get_object_or_404

from .models import Property, Block, Unit
from .serializers import (
    PropertySerializer,
    PropertyBasicSerializer,
    BlockSerializer,
    UnitSerializer,
    UnitVacantSerializer,
)
from accounts.permissions import IsLandlord, IsTenant, IsLandlordOrCaretaker


# ──────────────────────────────────────────────
# PROPERTY VIEWS — landlord only
# ──────────────────────────────────────────────

class PropertyListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/properties/       → landlord sees their own properties
    POST /api/properties/       → landlord creates a new property

    get_queryset() filters to the logged-in landlord only.
    A landlord can never accidentally see another landlord's properties.
    """
    serializer_class   = PropertySerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        return Property.objects.filter(
            landlord=self.request.user
        ).prefetch_related("blocks", "units")
        # prefetch_related prevents N+1 queries —
        # loads blocks and units in 2 extra queries instead of N


class PropertyDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/properties/:id/  → get single property
    PUT    /api/properties/:id/  → update property
    DELETE /api/properties/:id/  → delete property

    get_object() ensures landlord can only touch their own properties.
    """
    serializer_class   = PropertySerializer
    permission_classes = [IsLandlord]

    def get_object(self):
        return get_object_or_404(
            Property,
            id       = self.kwargs["pk"],
            landlord = self.request.user,   # ownership check
        )


# ──────────────────────────────────────────────
# BLOCK VIEWS
# ──────────────────────────────────────────────

class BlockListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/properties/:property_id/blocks/  → list blocks
    POST /api/properties/:property_id/blocks/  → create block

    perform_create() injects the property from the URL — landlord
    doesn't need to send property_id in the request body.
    """
    serializer_class   = BlockSerializer
    permission_classes = [IsLandlord]

    def get_queryset(self):
        # Also verify the property belongs to this landlord
        property = get_object_or_404(
            Property,
            id       = self.kwargs["property_id"],
            landlord = self.request.user,
        )
        return Block.objects.filter(property=property)

    def perform_create(self, serializer):
        property = get_object_or_404(
            Property,
            id       = self.kwargs["property_id"],
            landlord = self.request.user,
        )
        serializer.save(property=property)


# ──────────────────────────────────────────────
# UNIT VIEWS
# ──────────────────────────────────────────────

class UnitListCreateView(generics.ListCreateAPIView):
    """
    GET  /api/properties/:property_id/units/  → list all units
    POST /api/properties/:property_id/units/  → create a unit

    Supports ?status=vacant filter for the tenant registration flow.
    """
    permission_classes = [IsLandlordOrCaretaker]

    def get_serializer_class(self):
        # Tenant registration calls this with ?status=vacant
        # Return the lightweight serializer in that case
        if self.request.query_params.get("status") == "vacant":
            return UnitVacantSerializer
        return UnitSerializer

    def get_queryset(self):
        property = get_object_or_404(
            Property,
            id       = self.kwargs["property_id"],
            landlord = self.request.user if self.request.user.is_landlord
                       else Property.objects.get(
                           id=self.kwargs["property_id"]
                       ).landlord,
        )
        qs = Unit.objects.filter(property=property)

        # Filter by status if provided: ?status=vacant or ?status=occupied
        status_filter = self.request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    def perform_create(self, serializer):
        property = get_object_or_404(
            Property,
            id       = self.kwargs["property_id"],
            landlord = self.request.user,
        )
        serializer.save(property=property)


class UnitDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /api/properties/:property_id/units/:pk/
    PUT    /api/properties/:property_id/units/:pk/
    DELETE /api/properties/:property_id/units/:pk/
    """
    serializer_class   = UnitSerializer
    permission_classes = [IsLandlord]

    def get_object(self):
        return get_object_or_404(
            Unit,
            id              = self.kwargs["pk"],
            property__id    = self.kwargs["property_id"],
            property__landlord = self.request.user,
        )


# ──────────────────────────────────────────────
# VACANT UNITS — for tenant registration step 3
# ──────────────────────────────────────────────

class VacantUnitsView(generics.ListAPIView):
    """
    GET /api/properties/:property_id/vacant-units/

    Open to authenticated users (tenants use this during registration).
    Returns only vacant units — occupied units are never shown here.
    """
    serializer_class   = UnitVacantSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Unit.objects.filter(
            property__id = self.kwargs["property_id"],
            status       = Unit.Status.VACANT,
        ).select_related("block")
    
class LandlordVacantUnitsView(generics.ListAPIView):
    """
    GET /api/properties/landlord/:landlord_id/vacant-units/
    Used by tenant during unit change — shows all vacant units under a landlord.
    """
    serializer_class   = UnitVacantSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        landlord_id = self.kwargs["landlord_id"]
        return Unit.objects.filter(
            property__landlord__id = landlord_id,
            status                 = Unit.Status.VACANT,
        ).select_related("property", "block").order_by("property__name", "unit_number")

# ──────────────────────────────────────────────
# PROPERTY PAYOUT SETTINGS
# ──────────────────────────────────────────────

class PropertyPayoutSettingsView(APIView):
    """
    GET    /api/properties/<id>/payout/  → returns current payout settings (or empty if no override)
    PATCH  /api/properties/<id>/payout/  → create or update per-property override
    DELETE /api/properties/<id>/payout/  → remove override (reverts to global settings)
    """
    permission_classes = [IsAuthenticated, IsLandlord]

    def _get_property(self, pk, user):
        return get_object_or_404(Property, pk=pk, landlord=user)

    def get(self, request, property_id):
        from .models import PropertyPayoutSettings
        from .serializers import PropertyPayoutSettingsSerializer
        prop = self._get_property(property_id, request.user)
        try:
            s = prop.payout_settings
            return Response(PropertyPayoutSettingsSerializer(s).data)
        except PropertyPayoutSettings.DoesNotExist:
            return Response(None)

    def patch(self, request, property_id):
        from .models import PropertyPayoutSettings
        from .serializers import PropertyPayoutSettingsSerializer
        prop = self._get_property(property_id, request.user)
        try:
            s = prop.payout_settings
        except PropertyPayoutSettings.DoesNotExist:
            s = PropertyPayoutSettings(property=prop)
        serializer = PropertyPayoutSettingsSerializer(s, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, property_id):
        from .models import PropertyPayoutSettings
        prop = self._get_property(property_id, request.user)
        try:
            prop.payout_settings.delete()
        except PropertyPayoutSettings.DoesNotExist:
            pass
        return Response(status=204)
