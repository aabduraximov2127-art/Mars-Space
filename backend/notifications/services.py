"""In-app notifications. Other apps call :func:`notify`; delivery is in-app only."""

from __future__ import annotations

from collections.abc import Iterable

from .models import Notification, NotificationType  # noqa: F401  (re-exported for callers)


def notify(
    recipients: Iterable,
    type: str,
    title: str,
    body: str = "",
    link: str = "",
    data: dict | None = None,
) -> int:
    """Create one notification per distinct active recipient. Returns the number created."""
    seen: set[int] = set()
    rows = []
    for user in recipients:
        user_id = getattr(user, "pk", user)
        if user_id is None or user_id in seen:
            continue
        if hasattr(user, "is_active") and not user.is_active:
            continue
        seen.add(user_id)
        rows.append(
            Notification(
                recipient_id=user_id,
                type=type,
                title=title[:200],
                body=body,
                link=link[:255],
                data=data or {},
            )
        )
    Notification.objects.bulk_create(rows, batch_size=500)
    return len(rows)
