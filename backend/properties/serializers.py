from rest_framework import serializers
from .models import Property, Block, Unit


# ──────────────────────────────────────────────
# UNIT SERIALIZERS
# ──────────────────────────────────────────────

class UnitSerializer(serializers.ModelSerializer):
    """
    Full unit serializer — used by landlord to create/edit units.
    block_name is a read-only computed field — no extra query needed.
    """
    block_name = serializers.CharField(
        source="block.name", read_only=True
    )

    class Meta:
        model  = Unit
        fields = [
            "id", "unit_number", "unit_type", "rent_amount",
            "status", "block", "block_name",
        ]
        read_only_fields = ["id", "status"]
        # status changes only via tenancy activate/end, never directly


class UnitVacantSerializer(serializers.ModelSerializer):
    """
    Lightweight — shown to tenant during unit selection (Step 3).
    Only vacant units, only fields a tenant needs to see.
    """
    block_name = serializers.CharField(
        source="block.name", read_only=True
    )

    class Meta:
        model  = Unit
        fields = [
            "id", "unit_number", "unit_type",
            "rent_amount", "block_name",
        ]


# ──────────────────────────────────────────────
# BLOCK SERIALIZERS
# ──────────────────────────────────────────────

class BlockSerializer(serializers.ModelSerializer):
    """
    Landlord creates blocks/floors within a property.
    units_count gives a quick summary without loading all units.
    """
    units_count = serializers.IntegerField(
        source="units.count", read_only=True
    )

    class Meta:
        model  = Block
        fields = ["id", "name", "units_count"]
        read_only_fields = ["id"]


# ──────────────────────────────────────────────
# PROPERTY SERIALIZERS
# ──────────────────────────────────────────────

class PropertySerializer(serializers.ModelSerializer):
    """
    Full property — landlord view. Includes blocks, units, counts.
    SerializerMethodField for vacant/occupied lets us filter
    without adding extra querysets at the model level.
    """
    blocks         = BlockSerializer(many=True, read_only=True)
    units          = UnitSerializer(many=True, read_only=True)
    units_count    = serializers.IntegerField(
                         source="units.count", read_only=True
                     )
    vacant_count   = serializers.SerializerMethodField()
    occupied_count = serializers.SerializerMethodField()

    class Meta:
        model  = Property
        fields = [
            "id", "name", "address",
            "units_count", "vacant_count", "occupied_count",
            "blocks", "units", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def get_vacant_count(self, obj):
        return obj.units.filter(status="vacant").count()

    def get_occupied_count(self, obj):
        return obj.units.filter(status="occupied").count()

    def create(self, validated_data):
        # Landlord is always set from the logged-in user
        # Never trust the request body for ownership
        landlord = self.context["request"].user
        return Property.objects.create(
            landlord=landlord, **validated_data
        )


class PropertyBasicSerializer(serializers.ModelSerializer):
    """
    Lightweight — used in landlord search during tenant registration.
    Just enough for tenant to identify the right property.
    """
    class Meta:
        model  = Property
        fields = ["id", "name", "address"]

class PropertyPayoutSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        from .models import PropertyPayoutSettings
        model  = PropertyPayoutSettings
        fields = [
            "mpesa_type", "paybill_number", "till_number", "mpesa_account",
            "card_enabled",
            "bank_account_name", "bank_name", "bank_account", "bank_branch",
        ]
