"""Audit trail API used by every other app's service layer."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from .models import AuditLog

# Never written to the audit log, whatever the caller passes.
SENSITIVE_KEYS = {"password", "new_password", "old_password", "token", "access", "refresh", "secret"}


def _client_ip(request) -> str | None:
    if request is None:
        return None
    # Behind the trusted reverse proxy, Nginx sets X-Real-IP; fall back to the socket address.
    ip = request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR")
    return ip or None


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if hasattr(value, "pk"):
        return value.pk
    return value


def diff(instance_before: dict, instance_after: dict) -> dict:
    """``{field: [old, new]}`` for fields whose value changed."""
    return {
        key: [_jsonable(instance_before.get(key)), _jsonable(value)]
        for key, value in instance_after.items()
        if instance_before.get(key) != value
    }


def record(
    action: str,
    *,
    actor=None,
    obj=None,
    changes: dict | None = None,
    branch=None,
    request=None,
    entity_type: str = "",
    entity_id: str = "",
    entity_repr: str = "",
) -> AuditLog:
    if actor is None and request is not None and getattr(request.user, "is_authenticated", False):
        actor = request.user
    if obj is not None:
        entity_type = entity_type or f"{obj._meta.app_label}.{obj.__class__.__name__}"
        entity_id = entity_id or str(obj.pk)
        entity_repr = entity_repr or str(obj)[:255]
        if branch is None:
            branch_id = getattr(obj, "branch_id", None)
            if branch_id is not None:
                branch = branch_id
    clean_changes = {k: _jsonable(v) for k, v in (changes or {}).items() if k.lower() not in SENSITIVE_KEYS}
    if branch is None and actor is not None:
        branch = getattr(actor, "branch_id", None)
    user_agent = ""
    if request is not None:
        user_agent = (request.META.get("HTTP_USER_AGENT") or "")[:255]
    return AuditLog.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        actor_role=getattr(actor, "role", "") or "",
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id)[:64],
        entity_repr=entity_repr[:255],
        changes=clean_changes,
        branch_id=branch.pk if hasattr(branch, "pk") else branch,
        ip_address=_client_ip(request),
        user_agent=user_agent,
    )
