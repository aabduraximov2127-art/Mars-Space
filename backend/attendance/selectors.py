from django.db.models import Q, QuerySet

from core.permissions import role_of
from core.roles import AD, SA, ST, TE

from .models import AttendanceRecord


def attendance_for(user) -> QuerySet[AttendanceRecord]:
    """SA: all · AD: own branch · TE: lessons of own groups / own lessons · ST: own records."""
    role = role_of(user)
    qs = AttendanceRecord.objects.select_related("lesson", "lesson__group", "student", "marked_by")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(lesson__group__branch_id=user.branch_id)
    if role == TE:
        return qs.filter(Q(lesson__group__teacher=user) | Q(lesson__teacher=user))
    if role == ST:
        return qs.filter(student=user)
    return qs.none()
