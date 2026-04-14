from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.db import transaction
from .models import LandlordProfile, NextOfKin

User = get_user_model()


# ──────────────────────────────────────────────
# REGISTRATION SERIALIZERS
# ──────────────────────────────────────────────

class TenantRegisterSerializer(serializers.ModelSerializer):
    """
    Step 1 + 4 of tenant registration combined.
    Handles personal info + next of kin in one API call.

    Why write_only on password?
      We never want the password returned in any response — ever.
    Why validate_phone?
      Custom method — Django doesn't validate phone format by default.
    """
    password     = serializers.CharField(write_only=True, min_length=8)
    # Next of kin fields — nested but flat in the request body for simplicity
    kin_name         = serializers.CharField(write_only=True)
    kin_relationship = serializers.CharField(write_only=True)
    kin_phone        = serializers.CharField(write_only=True)
    kin_email        = serializers.EmailField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = User
        fields = [
            "id", "full_name", "phone", "email",
            "national_id", "password",
            "kin_name", "kin_relationship", "kin_phone", "kin_email",
        ]
        read_only_fields = ["id"]

    def validate_phone(self, value):
        """
        Normalize Kenyan numbers to 2547XXXXXXXX format.
        Accepts: 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
        """
        phone = value.strip().replace(" ", "").replace("-", "")
        if phone.startswith("0") and len(phone) == 10:
            phone = "254" + phone[1:]
        elif phone.startswith("+"):
            phone = phone[1:]
        if not phone.startswith("254") or len(phone) != 12:
            raise serializers.ValidationError(
                "Enter a valid Kenyan phone number e.g. 0712345678"
            )
        return phone

    def validate_password(self, value):
        """Basic password strength check."""
        if value.isdigit():
            raise serializers.ValidationError(
                "Password cannot be entirely numeric."
            )
        return value

    @transaction.atomic
    def create(self, validated_data):
        """
        atomic: if NextOfKin creation fails, the User is also rolled back.
        No orphan users with missing kin records.
        """
        kin_name         = validated_data.pop("kin_name")
        kin_relationship = validated_data.pop("kin_relationship")
        kin_phone        = validated_data.pop("kin_phone")
        kin_email        = validated_data.pop("kin_email", "")

        # Create user with role locked to TENANT
        user = User.objects.create_user(
            **validated_data,
            role=User.Role.TENANT,
        )

        # Create next of kin record
        NextOfKin.objects.create(
            tenant       = user,
            full_name    = kin_name,
            relationship = kin_relationship,
            phone        = kin_phone,
            email        = kin_email or None,
        )

        return user


class LandlordRegisterSerializer(serializers.ModelSerializer):
    """
    Landlord registration — includes company name and KRA PIN.
    """
    password     = serializers.CharField(write_only=True, min_length=8)
    company_name = serializers.CharField(write_only=True)
    kra_pin      = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model  = User
        fields = [
            "id", "full_name", "phone", "email",
            "password", "company_name", "kra_pin",
        ]
        read_only_fields = ["id"]

    def validate_phone(self, value):
        phone = value.strip().replace(" ", "").replace("-", "")
        if phone.startswith("0") and len(phone) == 10:
            phone = "254" + phone[1:]
        elif phone.startswith("+"):
            phone = phone[1:]
        if not phone.startswith("254") or len(phone) != 12:
            raise serializers.ValidationError(
                "Enter a valid Kenyan phone number e.g. 0712345678"
            )
        return phone

    @transaction.atomic
    def create(self, validated_data):
        company_name = validated_data.pop("company_name")
        kra_pin      = validated_data.pop("kra_pin", "")
 
        user = User.objects.create_user(
            **validated_data,
            role        = User.Role.LANDLORD,
            is_approved = False,   # ← pending admin approval
            is_active   = True,    # account exists but not approved
        )
 
        LandlordProfile.objects.create(
            user         = user,
            company_name = company_name,
            kra_pin      = kra_pin or None,
        )
        return user

# ──────────────────────────────────────────────
# LOGIN SERIALIZER
# ──────────────────────────────────────────────

class LoginSerializer(serializers.Serializer):
    full_name = serializers.CharField()
    password  = serializers.CharField(write_only=True)
 
    def validate(self, attrs):
        from django.contrib.auth import authenticate
        user = authenticate(
            request  = self.context.get("request"),
            username = attrs.get("full_name"),
            password = attrs.get("password"),
        )
        if not user:
            raise serializers.ValidationError(
                {"detail": "Invalid name or password."}
          )
                    
        if not user.is_active:
            raise serializers.ValidationError(
                {"detail": "This account has been deactivated."}
            )
        # Block unapproved landlords
        if user.is_landlord and not user.is_approved:
            raise serializers.ValidationError(
                {"detail": "PENDING_APPROVAL"}  # frontend checks this exact string
            )
        attrs["user"] = user
        return attrs

# ──────────────────────────────────────────────
# PROFILE SERIALIZERS (read + update)
# ──────────────────────────────────────────────

class NextOfKinSerializer(serializers.ModelSerializer):
    class Meta:
        model  = NextOfKin
        fields = ["full_name", "relationship", "phone", "email"]


class LandlordProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model  = LandlordProfile
        fields = ["company_name", "kra_pin"]


class UserProfileSerializer(serializers.ModelSerializer):
    """
    Safe read serializer — never exposes password.
    Includes nested kin/landlord data depending on role.
    """
    next_of_kin      = NextOfKinSerializer(read_only=True)
    landlord_profile = LandlordProfileSerializer(read_only=True)

    class Meta:
        model  = User
        fields = [
            "id", "full_name", "phone", "email",
            "national_id", "role", "created_at",
            "next_of_kin", "landlord_profile",
        ]
        read_only_fields = ["id", "role", "created_at"]


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    """
    Allows tenant/landlord to update their own profile.
    Phone and role are NOT updatable — phone is the login ID.
    """
    next_of_kin = NextOfKinSerializer(required=False)

    class Meta:
        model  = User
        fields = ["full_name", "email", "national_id", "next_of_kin"]

    @transaction.atomic
    def update(self, instance, validated_data):
        kin_data = validated_data.pop("next_of_kin", None)

        # Update user fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Update kin if provided
        if kin_data:
            NextOfKin.objects.update_or_create(
                tenant   = instance,
                defaults = kin_data,
            )

        return instance


class ChangePasswordSerializer(serializers.Serializer):
    """
    Requires old password for security — user must know it to change it.
    """
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_old_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        if value.isdigit():
            raise serializers.ValidationError(
                "Password cannot be entirely numeric."
            )
        return value

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password"])
        return user
    
class CaretakerSerializer(serializers.ModelSerializer):
    caretaker_assignments = serializers.SerializerMethodField()
    raw_password          = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ["id", "full_name", "phone", "email", "caretaker_assignments", "raw_password"]

    def get_caretaker_assignments(self, obj):
        return [
            {
                "property_name": a.property.name,
                "property_id":   str(a.property.id),
            }
            for a in obj.caretaker_assignments.select_related("property").all()
        ]

    def get_raw_password(self, obj):
        # We can't recover the hashed password — return None
        # Passwords are only shown at creation time
        return None