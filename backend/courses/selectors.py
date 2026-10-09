from django.db.models import Count, Q, QuerySet

from core.permissions import role_of
from core.roles import AD, SA, ST, TE

from .models import Course, CourseMaterial


def courses_for(user) -> QuerySet[Course]:
    """SA: all · AD: global + own branch · TE: courses of groups they teach · ST: courses of their groups."""
    role = role_of(user)
    qs = Course.objects.select_related("branch").annotate(
        groups_count=Count("groups", filter=~Q(groups__status="cancelled"), distinct=True)
    )
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(Q(branch__isnull=True) | Q(branch_id=user.branch_id))
    if role == TE:
        return qs.filter(pk__in=Course.objects.filter(groups__teacher=user).values("pk"))
    if role == ST:
        return qs.filter(pk__in=Course.objects.filter(groups__memberships__student=user).values("pk"))
    return qs.none()


def can_manage_course(user, course: Course) -> bool:
    role = role_of(user)
    return role == SA or (role == AD and course.branch_id is not None and course.branch_id == user.branch_id)


def materials_for(user) -> QuerySet[CourseMaterial]:
    return CourseMaterial.objects.select_related("course").filter(course__in=courses_for(user).values("pk"))
