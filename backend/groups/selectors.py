"""Read scoping for groups and memberships (single source of truth for every app)."""

from __future__ import annotations

import datetime as dt

from django.db.models import Q, QuerySet

from core.permissions import role_of
from core.roles import AD, SA, ST, TE

from .models import OPEN_MEMBERSHIP_STATUSES, Group, GroupMembership, MembershipStatus


def groups_for(user) -> QuerySet[Group]:
    """SA: all · AD: own branch · TE: groups they teach · ST: groups they were ever enrolled in."""
    role = role_of(user)
    qs = Group.objects.select_related("course", "branch", "teacher", "room")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(branch_id=user.branch_id)
    if role == TE:
        return qs.filter(teacher=user)
    if role == ST:
        return qs.filter(memberships__student=user).distinct()
    return qs.none()


def memberships_for(user) -> QuerySet[GroupMembership]:
    role = role_of(user)
    qs = GroupMembership.objects.select_related("group", "group__course", "group__branch", "student")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(group__branch_id=user.branch_id)
    if role == TE:
        return qs.filter(group__teacher=user)
    if role == ST:
        return qs.filter(student=user)
    return qs.none()


def is_group_teacher(user, group: Group) -> bool:
    return role_of(user) == TE and group.teacher_id == user.pk


def can_manage_group(user, group: Group) -> bool:
    """Write access to group configuration / enrolments."""
    role = role_of(user)
    return role == SA or (role == AD and group.branch_id == user.branch_id)


def is_active_member(student, group: Group) -> bool:
    return GroupMembership.objects.filter(group=group, student=student, status=MembershipStatus.ACTIVE).exists()


def open_memberships(group: Group) -> QuerySet[GroupMembership]:
    return group.memberships.filter(status__in=OPEN_MEMBERSHIP_STATUSES)


def attendance_eligible_memberships(group: Group, on_date: dt.date) -> QuerySet[GroupMembership]:
    """Students who belong on the attendance sheet of a lesson held on ``on_date``.

    The enrolment period must cover the date. Frozen memberships are excluded (no freeze
    history is kept, so a currently frozen student is treated as not attending).
    """
    return (
        group.memberships.select_related("student")
        .filter(joined_at__lte=on_date)
        .filter(Q(left_at__isnull=True) | Q(left_at__gte=on_date))
        .exclude(status=MembershipStatus.FROZEN)
        .order_by("student__last_name", "student__first_name")
    )
