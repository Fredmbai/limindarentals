from rest_framework.permissions import BasePermission


# ──────────────────────────────────────────────
# HOW PERMISSIONS WORK IN DRF
# ──────────────────────────────────────────────
# Each class has a has_permission() method.
# DRF calls it before the view runs.
# Return True  → allow the request
# Return False → 403 Forbidden
#
# Usage in views:
#   permission_classes = [IsLandlord]
#   permission_classes = [IsLandlord | IsCaretaker]
#   permission_classes = [IsAuthenticated, IsTenant]
# ──────────────────────────────────────────────


class IsLandlord(BasePermission):
    """Only landlords can access this endpoint."""
    message = "Access restricted to landlords."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_landlord
        )


class IsTenant(BasePermission):
    """Only tenants can access this endpoint."""
    message = "Access restricted to tenants."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_tenant
        )


class IsCaretaker(BasePermission):
    """Only caretakers can access this endpoint."""
    message = "Access restricted to caretakers."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.is_caretaker
        )


class IsLandlordOrCaretaker(BasePermission):
    """Landlords AND caretakers — useful for property management views."""
    message = "Access restricted to landlords and caretakers."

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and (request.user.is_landlord or request.user.is_caretaker)
        )


class IsOwnerOrLandlord(BasePermission):
    """
    Object-level permission.
    Used on detail views (retrieve, update, delete).
    Tenant can access their OWN data; landlord can access any.

    Usage:
        permission_classes = [IsOwnerOrLandlord]
        # Must call check_object_permissions(request, obj) in the view
    """
    message = "You do not have permission to access this resource."

    def has_object_permission(self, request, view, obj):
        if request.user.is_landlord:
            return True
        # For User objects
        if hasattr(obj, "id"):
            return obj.id == request.user.id
        # For objects with a tenant FK (Tenancy, Payment, etc.)
        if hasattr(obj, "tenant"):
            return obj.tenant == request.user
        # For objects with a user FK (Notification, etc.)
        if hasattr(obj, "user"):
            return obj.user == request.user
        return False
    
class IsCaretaker(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == "caretaker"
        )

class IsLandlordOrCaretaker(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role in ("landlord", "caretaker")
        )