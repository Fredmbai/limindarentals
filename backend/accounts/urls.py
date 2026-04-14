# ─────────────────────────────────────────────
# accounts/urls.py
# ─────────────────────────────────────────────
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CreateCaretakerView,
    DeleteMyAccountView,
    LandlordCaretakersView,
    TenantRegisterView,
    LandlordRegisterView,
    LoginView,
    LogoutView,
    MyProfileView,
    ChangePasswordView,
    LandlordSearchView,
    approve_landlord,
    PendingLandlordsView,
    DeleteCaretakerView,
    ForgotPasswordView,
    VerifyResetOTPView,
    ResetPasswordView,
)

urlpatterns = [
    # Registration
    path("register/tenant/",   TenantRegisterView.as_view(),   name="register-tenant"),
    path("register/landlord/", LandlordRegisterView.as_view(), name="register-landlord"),

    # Auth
    path("login/",             LoginView.as_view(),            name="login"),
    path("logout/",            LogoutView.as_view(),           name="logout"),
    path("token/refresh/",     TokenRefreshView.as_view(),     name="token-refresh"),

    # Profile
    path("profile/",           MyProfileView.as_view(),        name="my-profile"),
    path("change-password/",   ChangePasswordView.as_view(),   name="change-password"),

    # Tenant registration helper
    path("landlord-search/",   LandlordSearchView.as_view(),   name="landlord-search"),

    # Admin landlord approval   
    path("pending-landlords/",           PendingLandlordsView.as_view(),        name="pending-landlords"),
    path("approve-landlord/<uuid:user_id>/", approve_landlord,                  name="approve-landlord"),
    #caretaker registration helper
    path("create-caretaker/", CreateCaretakerView.as_view(), name="create-caretaker"),
    path("caretakers/",       LandlordCaretakersView.as_view(), name="caretakers"),
    path("caretakers/<uuid:user_id>/", DeleteCaretakerView.as_view(), name="delete-caretaker"),
    # DELETE
    path("delete-account/", DeleteMyAccountView.as_view(), name="delete-account"),

    # Password reset
    path("forgot-password/",    ForgotPasswordView.as_view(),   name="forgot-password"),
    path("verify-reset-otp/",   VerifyResetOTPView.as_view(),   name="verify-reset-otp"),
    path("reset-password/",     ResetPasswordView.as_view(),    name="reset-password"),
]