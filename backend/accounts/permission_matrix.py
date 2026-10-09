"""Introspect the URLconf to list every API endpoint and the roles allowed per action.

Used by the superadmin "roles & permissions" screen and by the permission-audit test that
guarantees no API view silently falls back to the global default permission.
"""

from __future__ import annotations

from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.permissions import AllowAny

from core.permissions import RolePermission

# Views that are intentionally public (no authentication).
PUBLIC_VIEWS = {
    "HealthView",
    "LoginView",
    "RefreshView",
    "LogoutView",
    "PasswordResetView",
    "PasswordResetConfirmView",
    "SpectacularAPIView",
    "SpectacularSwaggerView",
    "SpectacularRedocView",
}


def _walk(patterns, prefix=""):
    for entry in patterns:
        if isinstance(entry, URLResolver):
            yield from _walk(entry.url_patterns, prefix + str(entry.pattern))
        elif isinstance(entry, URLPattern):
            yield prefix + str(entry.pattern), entry.callback


def iter_api_endpoints():
    """Yield ``(path, view_class, {http_method: action_or_method})`` for every /api/ route."""
    for path, callback in _walk(get_resolver().url_patterns):
        if not path.startswith("api/"):
            continue
        view_class = getattr(callback, "cls", None)
        if view_class is None:
            continue
        allowed_methods = set(getattr(view_class, "http_method_names", ()))
        actions = getattr(callback, "actions", None)
        if actions:
            mapping = {method: action for method, action in actions.items() if method in allowed_methods}
        else:
            mapping = {
                method: method
                for method in ("get", "post", "put", "patch", "delete")
                if hasattr(view_class, method) and method in allowed_methods
            }
        yield path, view_class, mapping


def describe_view(view_class) -> str:
    perms = getattr(view_class, "permission_classes", ())
    if view_class.__name__ in PUBLIC_VIEWS or AllowAny in perms:
        return "public"
    if RolePermission in perms:
        return "rbac"
    return "default"


def build_matrix() -> list[dict]:
    rows = []
    for path, view_class, mapping in iter_api_endpoints():
        kind = describe_view(view_class)
        role_map = getattr(view_class, "role_permissions", {}) or {}
        for method, action in sorted(mapping.items()):
            roles = role_map.get(action)
            rows.append(
                {
                    "path": "/" + path.replace("^", "").replace("$", ""),
                    "method": method.upper(),
                    "action": action,
                    "view": view_class.__name__,
                    "access": kind,
                    "roles": sorted(str(r) for r in roles) if roles else ([] if kind != "public" else ["*"]),
                }
            )
    return rows
