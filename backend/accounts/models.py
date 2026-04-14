import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


# ──────────────────────────────────────────────
# MANAGER — tells Django how to create users
# ──────────────────────────────────────────────

class UserManager(BaseUserManager):

    def create_user(self, phone, password=None, **extra_fields):
        """
        Phone is the unique identifier (not email).
        Every tenant in Kenya has a phone — not everyone has an email.
        """
        if not phone:
            raise ValueError("Phone number is required")
        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)  # hashes the password
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(phone, password, **extra_fields)


# ──────────────────────────────────────────────
# CORE USER MODEL
# ──────────────────────────────────────────────

class User(AbstractBaseUser, PermissionsMixin):
    """
    One model for ALL users: landlord, tenant, caretaker.
    Role determines what they can see and do (RBAC).
    We use UUID as PK — safer than sequential integers in APIs.
    """

    class Role(models.TextChoices):
        LANDLORD  = "landlord",  "Landlord"
        TENANT    = "tenant",    "Tenant"
        CARETAKER = "caretaker", "Caretaker"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone       = models.CharField(max_length=15)   # login field
    email       = models.EmailField(blank=True, null=True)        # optional
    full_name   = models.CharField(max_length=150, unique=True)  # login field
    national_id = models.CharField(max_length=20, blank=True, null=True)
    role        = models.CharField(max_length=20, choices=Role.choices)

    # Django internals — required for AbstractBaseUser
    is_active   = models.BooleanField(default=True)
    is_staff    = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD  = "full_name"        # used for login
    REQUIRED_FIELDS = ["phone"]  # asked when creating superuser via CLI

    class Meta:
        db_table = "users"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.full_name} ({self.role}) — {self.phone}"

    # Convenience properties — clean way to check role anywhere in the codebase
    @property
    def is_landlord(self):
        return self.role == self.Role.LANDLORD

    @property
    def is_tenant(self):
        return self.role == self.Role.TENANT

    @property
    def is_caretaker(self):
        return self.role == self.Role.CARETAKER

    # Add this field to the User model
    is_approved = models.BooleanField(
        default=True,  # True for tenants, False for landlords until admin approves
        help_text="Landlords require admin approval before they can login"
   )


# ──────────────────────────────────────────────
# LANDLORD PROFILE — extra info for landlords only
# ──────────────────────────────────────────────

class LandlordProfile(models.Model):
    """
    Extends User for landlord-specific data.
    OneToOne means: one landlord profile per user, one user per profile.
    """
    user         = models.OneToOneField(
                       User,
                       on_delete=models.CASCADE,   # delete profile if user deleted
                       related_name="landlord_profile"
                   )
    company_name = models.CharField(max_length=200)
    kra_pin      = models.CharField(max_length=20, blank=True, null=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "landlord_profiles"

    def __str__(self):
        return f"{self.company_name} — {self.user.full_name}"


# ──────────────────────────────────────────────
# NEXT OF KIN — attached to tenant
# ──────────────────────────────────────────────

class NextOfKin(models.Model):
    """
    Collected during tenant registration (Step 4 in your spec).
    Linked to User, not Tenancy — kin belongs to the person, not the unit.
    """
    tenant       = models.OneToOneField(
                       User,
                       on_delete=models.CASCADE,
                       related_name="next_of_kin"
                   )
    full_name    = models.CharField(max_length=150)
    relationship = models.CharField(max_length=50)   # e.g. "Sister", "Father"
    phone        = models.CharField(max_length=15)
    email        = models.EmailField(blank=True, null=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "next_of_kin"

    def __str__(self):
        return f"{self.full_name} (kin of {self.tenant.full_name})"

class PasswordResetOTP(models.Model):
    """
    Short-lived OTP for password reset.
    Flow: request OTP → verify OTP (get reset_token) → reset password with token.
    OTP expires in 10 min. Reset token expires in 15 min after verification.
    """
    user        = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_otps")
    otp         = models.CharField(max_length=6)
    reset_token = models.UUIDField(null=True, blank=True)   # set after OTP verified
    is_used     = models.BooleanField(default=False)
    created_at  = models.DateTimeField(auto_now_add=True)
    expires_at  = models.DateTimeField()                    # OTP expiry (10 min)
    token_expires_at = models.DateTimeField(null=True, blank=True)  # reset token expiry (15 min)

    class Meta:
        db_table = "password_reset_otps"
        ordering = ["-created_at"]

    def __str__(self):
        return f"OTP for {self.user.full_name} — used={self.is_used}"


class CaretakerAssignment(models.Model):
    """Links a caretaker to a specific property under a landlord."""
    caretaker  = models.ForeignKey(
                     User,
                     on_delete    = models.CASCADE,
                     related_name = "caretaker_assignments",
                     limit_choices_to = {"role": "caretaker"},
                 )
    property   = models.ForeignKey(
                     "properties.Property",
                     on_delete    = models.CASCADE,
                     related_name = "caretaker_assignments",
                 )
    landlord   = models.ForeignKey(
                     User,
                     on_delete    = models.CASCADE,
                     related_name = "assigned_caretakers",
                     limit_choices_to = {"role": "landlord"},
                 )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table       = "caretaker_assignments"
        unique_together = [["caretaker", "property"]]

    def __str__(self):
        return f"{self.caretaker.full_name} → {self.property.name}"