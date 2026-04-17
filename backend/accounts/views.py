from rest_framework              import generics, status
from rest_framework.response    import Response
from rest_framework.views       import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.decorators import api_view, permission_classes

from django.contrib.auth import get_user_model
from django.db import transaction
from .serializers import (
    TenantRegisterSerializer,
    LandlordRegisterSerializer,
    LoginSerializer,
    UserProfileSerializer,
    UserProfileUpdateSerializer,
    ChangePasswordSerializer,
)
from .permissions import IsLandlord, IsTenant
from accounts.models import User, LandlordProfile, NextOfKin, CaretakerAssignment
User = get_user_model()


# ──────────────────────────────────────────────
# HELPER — builds the token + user payload
# ──────────────────────────────────────────────

def get_tokens_for_user(user):
    """
    Generates JWT access + refresh tokens for a user.
    We add role and name to the response so the frontend
    can immediately set up the correct dashboard — no extra request needed.
    """
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access":  str(refresh.access_token),
        "user": {
            "id":       str(user.id),
            "full_name": user.full_name,
            "phone":    user.phone,
            "email":    user.email,
            "role":     user.role,
        },
    }


# ──────────────────────────────────────────────
# REGISTRATION VIEWS
# ──────────────────────────────────────────────

class TenantRegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/tenant/

    Open endpoint — no auth needed (user doesn't exist yet).
    On success: returns tokens + user info.
    Frontend can immediately redirect to the unit-selection step.
    """
    serializer_class   = TenantRegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)   # auto-returns 400 with errors if invalid
        user = serializer.save()
        return Response(
            get_tokens_for_user(user),
            status=status.HTTP_201_CREATED,
        )


class LandlordRegisterView(generics.CreateAPIView):
    """
    POST /api/auth/register/landlord/

    Same pattern as tenant. Role is locked inside the serializer.
    """
    serializer_class   = LandlordRegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            get_tokens_for_user(user),
            status=status.HTTP_201_CREATED,
        )


# ──────────────────────────────────────────────
# LOGIN VIEW
# ──────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(
            data    = request.data,
            context = {"request": request},
        )
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]

        refresh = RefreshToken.for_user(user)
        return Response({
            "access":  str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id":          str(user.id),
                "full_name":   user.full_name,
                "phone":       user.phone,
                "email":       user.email,
                "role":        user.role,        # ← critical
                "is_approved": user.is_approved,
            },
        })


# ──────────────────────────────────────────────
# LOGOUT VIEW
# ──────────────────────────────────────────────

class LogoutView(APIView):
    """
    POST /api/auth/logout/

    Blacklists the refresh token so it can't be used again.
    Requires: { "refresh": "<refresh_token>" }

    Note: the access token will still work until it expires (60 min).
    That's normal JWT behaviour — it's stateless by design.
    On the frontend: delete both tokens from storage on logout.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh")
            if not refresh_token:
                return Response(
                    {"detail": "Refresh token is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            token = RefreshToken(refresh_token)
            token.blacklist()   # requires 'rest_framework_simplejwt.token_blacklist' in INSTALLED_APPS
            return Response(
                {"detail": "Logged out successfully."},
                status=status.HTTP_200_OK,
            )
        except Exception:
            return Response(
                {"detail": "Invalid or expired token."},
                status=status.HTTP_400_BAD_REQUEST,
            )


# ──────────────────────────────────────────────
# PROFILE VIEWS
# ──────────────────────────────────────────────

class MyProfileView(generics.RetrieveUpdateAPIView):
    """
    GET  /api/auth/profile/  → returns full profile with kin/landlord info
    PUT  /api/auth/profile/  → update name, email, national_id, kin
    PATCH /api/auth/profile/ → partial update (same endpoint)

    get_serializer_class() picks the right serializer depending on
    whether we're reading (GET) or writing (PUT/PATCH).
    This is a clean DRF pattern — one endpoint, two serializer modes.
    """
    permission_classes = [IsAuthenticated]

    def get_object(self):
        # Always returns the logged-in user — can't view someone else's profile here
        return self.request.user

    def get_serializer_class(self):
        if self.request.method in ("PUT", "PATCH"):
            return UserProfileUpdateSerializer
        return UserProfileSerializer


# ──────────────────────────────────────────────
# CHANGE PASSWORD
# ──────────────────────────────────────────────

class ChangePasswordView(APIView):
    """
    POST /api/auth/change-password/

    Body: { "old_password": "...", "new_password": "..." }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(
            data    = request.data,
            context = {"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            {"detail": "Password changed successfully."},
            status=status.HTTP_200_OK,
        )


# ──────────────────────────────────────────────
# LANDLORD: LOOKUP BY COMPANY NAME
# ──────────────────────────────────────────────

class LandlordSearchView(APIView):
    """
    GET /api/auth/landlord-search/?company_name=Sunrise

    Used in Step 2 of tenant registration:
    Tenant types the company name → we return matching landlords + their properties.
    AllowAny because tenant has just registered (might not have token yet).
    """
    permission_classes = [AllowAny]

    def get(self, request):
        from properties.models import Property
        from properties.serializers import PropertyBasicSerializer

        company_name = request.query_params.get("company_name", "").strip()
        if not company_name or len(company_name) < 2:
            return Response(
                {"detail": "Provide at least 2 characters to search."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Case-insensitive partial match on company name
        landlords = User.objects.filter(
            role                           = User.Role.LANDLORD,
            landlord_profile__company_name__icontains = company_name,
            is_active                      = True,
        ).select_related("landlord_profile").prefetch_related("properties")

        if not landlords.exists():
            return Response(
                {"detail": "No landlord found with that company name."},
                status=status.HTTP_404_NOT_FOUND,
            )

        results = []
        for landlord in landlords:
            properties = Property.objects.filter(landlord=landlord)
            results.append({
                "landlord_id":   str(landlord.id),
                "landlord_name": landlord.full_name,
                "company_name":  landlord.landlord_profile.company_name,
                "properties":    PropertyBasicSerializer(properties, many=True).data,
            })

        return Response(results, status=status.HTTP_200_OK)
    
@api_view(["POST"])
@permission_classes([IsAdminUser])
def approve_landlord(request, user_id):
    """
    POST /api/auth/approve-landlord/:user_id/
    Admin only — approves a pending landlord.
    """
    from django.contrib.auth import get_user_model
    User = get_user_model()
    try:
        landlord = User.objects.get(
            id   = user_id,
            role = User.Role.LANDLORD,
        )
        landlord.is_approved = True
        landlord.save(update_fields=["is_approved"])

        # Create approval notification
        from notifications.models import Notification
        Notification.objects.create(
            user    = landlord,
            title   = "Account approved",
            message = "Your LumidahRentals landlord account has been approved. You can now log in.",
            notification_type = "general",
        )
        return Response({"detail": f"{landlord.full_name} approved successfully."})
    except User.DoesNotExist:
        return Response({"detail": "Landlord not found."}, status=404)


class PendingLandlordsView(generics.ListAPIView):
    """
    GET /api/auth/pending-landlords/
    Admin only — lists landlords awaiting approval.
    """
    permission_classes = [IsAdminUser]
    serializer_class   = UserProfileSerializer

    def get_queryset(self):
        return User.objects.filter(
            role        = User.Role.LANDLORD,
            is_approved = False,
        ).select_related("landlord_profile")

class CreateCaretakerView(APIView):
    """
    POST /api/auth/create-caretaker/
    Landlord creates a caretaker and assigns them to a property.
    """
    permission_classes = [IsLandlord]

    @transaction.atomic
    def post(self, request):
        from properties.models import Property
        import re
    
        full_name    = request.data.get("full_name", "").strip()
        phone        = request.data.get("phone", "").strip()
        email        = request.data.get("email", "").strip() or None
        property_ids = request.data.get("property_ids", [])  # ← now a list
    
        if not full_name or not phone or not property_ids:
            return Response(
                {"detail": "full_name, phone, and at least one property_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    
        # Verify all properties belong to this landlord
        props = Property.objects.filter(
            id__in    = property_ids,
            landlord  = request.user,
        )
        if props.count() != len(property_ids):
            return Response(
                {"detail": "One or more properties not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
    
        # Generate sequential password
        existing_count = User.objects.filter(role=User.Role.CARETAKER).count()
        password        = f"caretaker-{str(existing_count + 1).zfill(3)}"
    
        # Create caretaker user
        caretaker = User.objects.create_user(
            phone       = phone,
            full_name   = full_name,
            email       = email,
            password    = password,
            role        = User.Role.CARETAKER,
            is_approved = True,
        )
    
        # Assign to all selected properties
        for prop in props:
            CaretakerAssignment.objects.create(
                caretaker = caretaker,
                property  = prop,
                landlord  = request.user,
            )
    
        return Response({
            "id":          str(caretaker.id),
            "full_name":   caretaker.full_name,
            "phone":       caretaker.phone,
            "properties": [p.name for p in props],
            "username":    full_name,
            "password":    password,
            "login_note": f"Login with name: '{full_name}' and password: '{password}'",
        }, status=status.HTTP_201_CREATED)


class LandlordCaretakersView(generics.ListAPIView):
    """GET /api/auth/caretakers/ — landlord views their caretakers"""
    permission_classes = [IsLandlord]
    serializer_class   = UserProfileSerializer

    def get_queryset(self):
        return User.objects.filter(
            caretaker_assignments__landlord=self.request.user,
            role=User.Role.CARETAKER,
        ).select_related().prefetch_related("caretaker_assignments__property")
    
class DeleteCaretakerView(APIView):
    """DELETE /api/auth/caretakers/:id/ — landlord removes a caretaker"""
    permission_classes = [IsLandlord]

    def delete(self, request, user_id):
        try:
            caretaker = User.objects.filter(
                id   = user_id,
                role = User.Role.CARETAKER,
                caretaker_assignments__landlord = request.user,
            ).distinct().get()
            caretaker.delete()
            return Response({"detail": "Caretaker removed."})
        except User.DoesNotExist:
            return Response({"detail": "Caretaker not found."}, status=404)
        
# ──────────────────────────────────────────────
# DELETE ACCOUNT VIEW
# ──────────────────────────────────────────────
class DeleteMyAccountView(APIView):
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def delete(self, request):
        user = request.user

        try:
            from tenancies.models import Tenancy
            from properties.models import Unit
            from notifications.service import notify

            # Step 1 — Notify landlords and free units BEFORE deletion
            active_tenancies = Tenancy.objects.filter(
                tenant     = user,
                status__in = ["active", "pending"],
            ).select_related("unit", "landlord", "unit__property")

            for t in active_tenancies:
                try:
                    # Free the unit
                    t.unit.status = Unit.Status.VACANT
                    t.unit.save(update_fields=["status"])
                    # Notify landlord
                    notify(
                        user              = t.landlord,
                        title             = f"Tenant deleted account — Unit {t.unit.unit_number}",
                        message           = f"{user.full_name} deleted their LumidahRentals account. Unit {t.unit.unit_number} at {t.unit.property.name} is now vacant.",
                        notification_type = "tenancy",
                        send_sms_flag     = False,
                    )
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).error(f"Pre-delete error: {e}")

            # Step 2 — Delete the user
            # With SET_NULL on Tenancy.tenant, Django will null out
            # the FK automatically — no ProtectedError
            user.delete()

            return Response(
                {"detail": "Account deleted successfully."},
                status=200,
            )

        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Delete account error: {e}")
            return Response(
                {"detail": f"Failed to delete account: {str(e)}"},
                status=500,
            )


# ──────────────────────────────────────────────
# PASSWORD RESET — shared helper
# ──────────────────────────────────────────────

def _find_user_by_identifier(identifier: str):
    """
    Look up a user by phone or email.
    Handles mixed phone formats in the DB (0XXXXXXXXX and 254XXXXXXXXX).
    """
    identifier = identifier.strip()

    # Build both phone variants to query against regardless of stored format
    phone_variants = {identifier}
    if identifier.startswith("0") and len(identifier) <= 10:
        phone_variants.add("254" + identifier[1:])
    elif identifier.startswith("+254"):
        phone_variants.add(identifier[1:])          # drop the +
        phone_variants.add("0" + identifier[4:])    # 0XXXXXXX form
    elif identifier.startswith("254") and len(identifier) == 12:
        phone_variants.add("0" + identifier[3:])    # 0XXXXXXX form

    user = User.objects.filter(phone__in=phone_variants).first()
    if not user:
        user = User.objects.filter(email__iexact=identifier).first()
    return user


# ──────────────────────────────────────────────
# PASSWORD RESET — step 1: request OTP
# ──────────────────────────────────────────────

class ForgotPasswordView(APIView):
    """
    POST /api/auth/forgot-password/
    Body: { "identifier": "phone or email" }
    Returns: { "full_name": "...", "message": "OTP sent" }
    Sends a 6-digit OTP via SMS (and email if available).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from .models import PasswordResetOTP
        from notifications.sms import send_sms
        from django.core.mail import send_mail
        from django.conf import settings as django_settings
        from django.utils import timezone
        from datetime import timedelta
        import random

        identifier = (request.data.get("identifier") or "").strip()
        if not identifier:
            return Response({"detail": "Phone number or email is required."}, status=400)

        user = _find_user_by_identifier(identifier)

        if not user:
            return Response({"detail": "If that account exists, an OTP has been sent."}, status=200)

        # Delete any old unused OTPs for this user
        PasswordResetOTP.objects.filter(user=user, is_used=False).delete()

        # Generate 6-digit OTP
        otp = str(random.randint(100000, 999999))
        now = timezone.now()

        PasswordResetOTP.objects.create(
            user       = user,
            otp        = otp,
            expires_at = now + timedelta(minutes=10),
        )

        is_email = "@" in identifier

        if is_email and user.email:
            # Send via email
            try:
                send_mail(
                    subject    = "LumidahRentals — Your password reset code",
                    message    = (
                        f"Hi {user.full_name},\n\n"
                        f"Your password reset code is:\n\n"
                        f"    {otp}\n\n"
                        f"This code expires in 10 minutes. Do not share it with anyone.\n\n"
                        f"If you did not request this, you can safely ignore this email.\n\n"
                        f"— LumidahRentals"
                    ),
                    from_email = django_settings.DEFAULT_FROM_EMAIL,
                    recipient_list = [user.email],
                    fail_silently  = False,
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"Reset email failed for {user.email}: {e}")
                return Response({"detail": "Failed to send email. Please try with your phone number."}, status=500)
        else:
            # Send via SMS
            sms_phone = user.phone
            if not sms_phone.startswith("+"):
                sms_phone = f"+{sms_phone}" if sms_phone.startswith("254") else f"+254{sms_phone[1:]}"
            send_sms(sms_phone, f"LumidahRentals: Your password reset code is {otp}. It expires in 10 minutes. Do not share it.")

        return Response({
            "full_name": user.full_name,
            "message":   "OTP sent successfully.",
        }, status=200)


# ──────────────────────────────────────────────
# PASSWORD RESET — step 2: verify OTP
# ──────────────────────────────────────────────

class VerifyResetOTPView(APIView):
    """
    POST /api/auth/verify-reset-otp/
    Body: { "identifier": "phone or email", "otp": "123456" }
    Returns: { "reset_token": "uuid", "full_name": "..." }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from .models import PasswordResetOTP
        from django.utils import timezone
        from datetime import timedelta
        import uuid as uuid_lib

        identifier = (request.data.get("identifier") or "").strip()
        otp_input  = (request.data.get("otp") or "").strip()

        if not identifier or not otp_input:
            return Response({"detail": "Identifier and OTP are required."}, status=400)

        user = _find_user_by_identifier(identifier)

        if not user:
            return Response({"detail": "Invalid OTP."}, status=400)

        now = timezone.now()
        record = PasswordResetOTP.objects.filter(
            user    = user,
            otp     = otp_input,
            is_used = False,
        ).order_by("-created_at").first()

        if not record:
            return Response({"detail": "Invalid OTP."}, status=400)

        if record.expires_at < now:
            return Response({"detail": "OTP has expired. Please request a new one."}, status=400)

        # Issue a reset token valid for 15 min
        reset_token              = uuid_lib.uuid4()
        record.reset_token       = reset_token
        record.token_expires_at  = now + timedelta(minutes=15)
        record.save(update_fields=["reset_token", "token_expires_at"])

        return Response({
            "reset_token": str(reset_token),
            "full_name":   user.full_name,
        }, status=200)


# ──────────────────────────────────────────────
# PASSWORD RESET — step 3: set new password
# ──────────────────────────────────────────────

class ResetPasswordView(APIView):
    """
    POST /api/auth/reset-password/
    Body: { "reset_token": "uuid", "new_password": "..." }
    """
    permission_classes = [AllowAny]

    def post(self, request):
        from .models import PasswordResetOTP
        from django.utils import timezone

        reset_token  = (request.data.get("reset_token") or "").strip()
        new_password = (request.data.get("new_password") or "").strip()

        if not reset_token or not new_password:
            return Response({"detail": "reset_token and new_password are required."}, status=400)

        if len(new_password) < 8:
            return Response({"detail": "Password must be at least 8 characters."}, status=400)

        if new_password.isdigit():
            return Response({"detail": "Password cannot be all numbers."}, status=400)

        now = timezone.now()

        try:
            record = PasswordResetOTP.objects.select_related("user").get(
                reset_token = reset_token,
                is_used     = False,
            )
        except PasswordResetOTP.DoesNotExist:
            return Response({"detail": "Invalid or expired reset link."}, status=400)

        if not record.token_expires_at or record.token_expires_at < now:
            return Response({"detail": "Reset session expired. Please start over."}, status=400)

        user = record.user
        user.set_password(new_password)
        user.save(update_fields=["password", "updated_at"])

        record.is_used = True
        record.save(update_fields=["is_used"])

        return Response({"detail": "Password reset successfully. You can now log in."}, status=200)