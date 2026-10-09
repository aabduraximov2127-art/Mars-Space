from django.db.models import Count, Q, QuerySet

from core.permissions import role_of
from core.roles import AD, SA, ST, TE

from .models import Branch, Room


def branches_for(user) -> QuerySet[Branch]:
    """SA: all branches · everyone else: only their own branch."""
    role = role_of(user)
    qs = Branch.objects.all()
    if role == SA:
        return qs
    if role in (AD, TE, ST) and user.branch_id:
        return qs.filter(pk=user.branch_id)
    return qs.none()


def with_branch_stats(qs: QuerySet[Branch]) -> QuerySet[Branch]:
    return qs.annotate(
        students_count=Count("users", filter=Q(users__role=ST, users__is_active=True), distinct=True),
        teachers_count=Count("users", filter=Q(users__role=TE, users__is_active=True), distinct=True),
        active_groups_count=Count("groups", filter=Q(groups__status="active"), distinct=True),
    )


def rooms_for(user) -> QuerySet[Room]:
    role = role_of(user)
    qs = Room.objects.select_related("branch")
    if role == SA:
        return qs
    if role in (AD, TE):
        return qs.filter(branch_id=user.branch_id)
    return qs.none()
