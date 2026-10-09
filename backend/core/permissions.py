"""Role-based access control primitives.

Every API view declares ``permission_classes = [RolePermission]`` and a ``role_permissions``
map ``{action: roles}``. Actions missing from the map are denied (default deny).

Read scoping (which rows a role may see) is implemented by each app's ``selectors`` module;
objects outside the caller's scope are simply not in the queryset and therefore yield 404.
"""

from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from .roles import AD, ALL_ROLES, SA, ST, STAFF_ROLES, TE  # noqa: F401  (re-exported)

DENIED_MESSAGE = "Bu amal uchun ruxsat yo'q."


class RolePermission(BasePermission):
    message = DENIED_MESSAGE

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not (user and user.is_authenticated and user.is_active):
            return False
        mapping = getattr(view, "role_permissions", None)
        if not mapping:
            return False
        method = request.method.lower()
        action = getattr(view, "action", None)
        if action is None:
            routed = getattr(view, "action_map", None)
            if routed is not None and method not in routed:
                return True  # unrouted method on a ViewSet -> let DRF answer 405
            if method not in getattr(view, "http_method_names", ()) or not hasattr(view, method):
                return True  # method not implemented on an APIView -> 405
            action = method
        allowed = mapping.get(action)
        if allowed is None:
            return False
        return user.role in allowed


def role_of(user) -> str | None:
    """Role of ``user`` or ``None`` (AnonymousUser, e.g. during OpenAPI schema generation)."""
    return getattr(user, "role", None) if user is not None and user.is_authenticated else None


def has_role(user, *roles) -> bool:
    return role_of(user) in roles


def require(condition: bool, message: str = DENIED_MESSAGE) -> None:
    """Raise 403 unless ``condition`` holds. Used for object-level write rules in services/views."""
    if not condition:
        raise PermissionDenied(message)


def branch_scope_id(user):
    """Branch id that an admin is confined to; ``None`` means unrestricted (superadmin)."""
    if user.role == SA:
        return None
    return user.branch_id
