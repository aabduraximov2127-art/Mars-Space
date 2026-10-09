from django.db.models import Q, QuerySet

from core.permissions import role_of
from core.roles import AD, SA, ST, TE
from groups.models import OPEN_MEMBERSHIP_STATUSES

from .models import Lesson


def lessons_for(user) -> QuerySet[Lesson]:
    """SA: all · AD: own branch · TE: lessons they teach or of groups they lead ·
    ST: lessons of groups with an open (active/frozen) membership."""
    role = role_of(user)
    qs = Lesson.objects.select_related("group", "group__course", "group__branch", "teacher", "room")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(group__branch_id=user.branch_id)
    if role == TE:
        return qs.filter(Q(teacher=user) | Q(group__teacher=user))
    if role == ST:
        return qs.filter(
            group__memberships__student=user,
            group__memberships__status__in=OPEN_MEMBERSHIP_STATUSES,
        ).distinct()
    return qs.none()


def can_teach_lesson(user, lesson: Lesson) -> bool:
    return role_of(user) == TE and (lesson.teacher_id == user.pk or lesson.group.teacher_id == user.pk)
