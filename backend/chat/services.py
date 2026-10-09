"""Chat access rules: who may talk to whom, and who may enter which room."""

from __future__ import annotations

from django.db.models import Q, QuerySet

from accounts.models import User
from core.permissions import role_of
from core.roles import AD, SA, ST, TE
from groups.models import OPEN_MEMBERSHIP_STATUSES, Group

from .models import ChatMembership, ChatRoom, RoomKind


def _teacher_ids_of(student) -> QuerySet:
    return Group.objects.filter(
        memberships__student=student, memberships__status__in=OPEN_MEMBERSHIP_STATUSES, teacher__isnull=False
    ).values("teacher_id")


def _student_ids_of(teacher) -> QuerySet:
    return User.objects.filter(
        role=ST,
        memberships__group__teacher=teacher,
        memberships__status__in=OPEN_MEMBERSHIP_STATUSES,
    ).values("pk")


def contacts_for(user) -> QuerySet[User]:
    role = role_of(user)
    qs = User.objects.filter(is_active=True).exclude(pk=getattr(user, "pk", None)).select_related("branch")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(Q(branch_id=user.branch_id) | Q(role=SA))
    if role == TE:
        return qs.filter(
            Q(role=SA)
            | Q(role=AD, branch_id=user.branch_id)
            | Q(role=TE, branch_id=user.branch_id)
            | Q(pk__in=_student_ids_of(user))
        )
    if role == ST:
        return qs.filter(Q(role=SA) | Q(role=AD, branch_id=user.branch_id) | Q(pk__in=_teacher_ids_of(user)))
    return qs.none()


def can_message(user, other) -> bool:
    return contacts_for(user).filter(pk=other.pk).exists()


def chat_groups_for(user) -> QuerySet[Group]:
    """Groups whose chat room the user can enter."""
    role = role_of(user)
    qs = Group.objects.exclude(status="cancelled")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(branch_id=user.branch_id)
    if role == TE:
        return qs.filter(teacher=user)
    if role == ST:
        return qs.filter(memberships__student=user, memberships__status__in=OPEN_MEMBERSHIP_STATUSES).distinct()
    return qs.none()


def group_room(group: Group) -> ChatRoom:
    room, _ = ChatRoom.objects.get_or_create(
        group=group, defaults={"kind": RoomKind.GROUP, "name": f"{group.name} ({group.code})"}
    )
    return room


def direct_room(user, other) -> ChatRoom:
    key = ChatRoom.make_direct_key(user.pk, other.pk)
    room, _ = ChatRoom.objects.get_or_create(direct_key=key, defaults={"kind": RoomKind.DIRECT, "created_by": user})
    for u in (user, other):
        ChatMembership.objects.get_or_create(room=room, user=u)
    return room


def rooms_for(user) -> QuerySet[ChatRoom]:
    role = role_of(user)
    if role is None:
        return ChatRoom.objects.none()
    if role in (TE, ST):
        for group in chat_groups_for(user).filter(chat_room__isnull=True):
            group_room(group)
        group_cond = Q(kind=RoomKind.GROUP, group__in=chat_groups_for(user).values("pk"))
    else:
        group_cond = Q(kind=RoomKind.GROUP, memberships__user=user, group__in=chat_groups_for(user).values("pk"))
    direct_cond = Q(kind=RoomKind.DIRECT, memberships__user=user)
    return ChatRoom.objects.filter(group_cond | direct_cond).select_related("group").distinct()


def can_access(user, room: ChatRoom) -> bool:
    if room.kind == RoomKind.DIRECT:
        return room.memberships.filter(user=user).exists()
    return chat_groups_for(user).filter(pk=room.group_id).exists()


def can_delete_message(user, message) -> bool:
    role = role_of(user)
    if message.sender_id == user.pk or role == SA:
        return True
    if role == AD:
        room = message.room
        if room.kind == RoomKind.GROUP:
            return room.group.branch_id == user.branch_id
        return message.sender.branch_id == user.branch_id
    return False
