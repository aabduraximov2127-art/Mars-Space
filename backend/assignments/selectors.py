from django.db.models import QuerySet

from core.permissions import role_of
from core.roles import AD, SA, ST, TE
from groups.models import OPEN_MEMBERSHIP_STATUSES

from .models import Assignment, AssignmentStatus, AssignmentSubmission


def assignments_for(user) -> QuerySet[Assignment]:
    """SA: all · AD: own branch · TE: own groups · ST: published/closed assignments of their open groups."""
    role = role_of(user)
    qs = Assignment.objects.select_related("group", "group__course", "created_by", "lesson")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(group__branch_id=user.branch_id)
    if role == TE:
        return qs.filter(group__teacher=user)
    if role == ST:
        return qs.filter(
            status__in=(AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED),
            group__in=user.memberships.filter(status__in=OPEN_MEMBERSHIP_STATUSES).values("group_id"),
        )
    return qs.none()


def submissions_for(user) -> QuerySet[AssignmentSubmission]:
    role = role_of(user)
    qs = AssignmentSubmission.objects.select_related(
        "assignment", "assignment__group", "student", "reviewed_by"
    ).prefetch_related("revisions")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(assignment__group__branch_id=user.branch_id)
    if role == TE:
        return qs.filter(assignment__group__teacher=user)
    if role == ST:
        return qs.filter(student=user)
    return qs.none()


def can_manage_assignment(user, assignment: Assignment) -> bool:
    role = role_of(user)
    group = assignment.group
    if role == SA:
        return True
    if role == AD:
        return group.branch_id == user.branch_id
    if role == TE:
        return group.teacher_id == user.pk
    return False
