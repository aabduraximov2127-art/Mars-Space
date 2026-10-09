"""Group configuration and enrolment lifecycle (enrol, freeze, activate, leave, transfer)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from django.db import transaction

from audit.services import record as audit
from core.exceptions import BusinessRuleError, ConflictError
from core.permissions import require
from core.roles import AD, SA, ST, TE

from .models import (
    OPEN_MEMBERSHIP_STATUSES,
    DiscountType,
    Group,
    GroupMembership,
    GroupStatus,
    MembershipStatus,
)
from .selectors import can_manage_group

CLOSED_GROUP_STATUSES = (GroupStatus.COMPLETED, GroupStatus.CANCELLED)


# --- groups ------------------------------------------------------------------------------------


def validate_group_relations(*, branch, course, teacher, room) -> None:
    if not branch.is_active:
        raise BusinessRuleError("Faol bo'lmagan filialda guruh ochib bo'lmaydi.", code="branch_inactive")
    if course.branch_id is not None and course.branch_id != branch.pk:
        raise BusinessRuleError("Kurs boshqa filialga tegishli.", code="invalid_course")
    if teacher is not None:
        if teacher.role != TE or not teacher.is_active:
            raise BusinessRuleError("Tanlangan foydalanuvchi faol ustoz emas.", code="invalid_teacher")
        if teacher.branch_id != branch.pk:
            raise BusinessRuleError("Ustoz boshqa filialga tegishli.", code="invalid_teacher")
    if room is not None and room.branch_id != branch.pk:
        raise BusinessRuleError("Xona boshqa filialga tegishli.", code="invalid_room")


# --- memberships -------------------------------------------------------------------------------


def _validate_discount(discount_type: str, value: Decimal, fee: Decimal) -> None:
    if discount_type == DiscountType.PERCENT and value > 100:
        raise BusinessRuleError("Foizli chegirma 100 dan oshmasligi kerak.", code="invalid_discount")
    if discount_type == DiscountType.FIXED and value > fee:
        raise BusinessRuleError("Chegirma oylik to'lovdan oshmasligi kerak.", code="invalid_discount")


def _membership_snapshot(m: GroupMembership) -> dict:
    return {
        "group": m.group_id,
        "student": m.student_id,
        "status": m.status,
        "joined_at": m.joined_at,
        "monthly_fee": m.monthly_fee,
        "discount_type": m.discount_type,
        "discount_value": m.discount_value,
    }


def _ensure_capacity(group: Group) -> None:
    taken = group.memberships.filter(status=MembershipStatus.ACTIVE).count()
    if taken >= group.capacity:
        raise BusinessRuleError(f"Guruh to'lgan (sig'im: {group.capacity}).", code="group_full")


@transaction.atomic
def enroll(
    actor,
    *,
    group: Group,
    student,
    joined_at: dt.date,
    discount_type: str = DiscountType.NONE,
    discount_value: Decimal = Decimal("0"),
    discount_reason: str = "",
    note: str = "",
    request=None,
    allow_other_branch: bool = False,
) -> GroupMembership:
    require(can_manage_group(actor, group), "Bu guruhga student qo'shishga ruxsat yo'q.")
    group = Group.objects.select_for_update().select_related("course").get(pk=group.pk)
    if student.role != ST:
        raise BusinessRuleError("Faqat student rolidagi foydalanuvchini guruhga qo'shish mumkin.", code="not_student")
    if not student.is_active:
        raise BusinessRuleError("Bloklangan studentni guruhga qo'shib bo'lmaydi.", code="student_inactive")
    if student.branch_id != group.branch_id and not allow_other_branch:
        raise BusinessRuleError("Student boshqa filialga tegishli.", code="branch_mismatch")
    if group.status in CLOSED_GROUP_STATUSES:
        raise BusinessRuleError("Yakunlangan yoki bekor qilingan guruhga qo'shib bo'lmaydi.", code="group_closed")
    if group.end_date and joined_at > group.end_date:
        raise BusinessRuleError("Qo'shilish sanasi guruh tugash sanasidan keyin.", code="invalid_date")
    if GroupMembership.objects.filter(group=group, student=student, status__in=OPEN_MEMBERSHIP_STATUSES).exists():
        raise ConflictError("Student bu guruhda allaqachon a'zo.", code="already_enrolled")
    _ensure_capacity(group)
    fee = group.course.monthly_price
    if discount_type == DiscountType.NONE:
        discount_value = Decimal("0")
    _validate_discount(discount_type, discount_value, fee)
    membership = GroupMembership.objects.create(
        group=group,
        student=student,
        joined_at=joined_at,
        monthly_fee=fee,
        discount_type=discount_type,
        discount_value=discount_value,
        discount_reason=discount_reason,
        note=note,
        created_by=actor,
    )
    audit(
        "enroll",
        actor=actor,
        obj=membership,
        changes=_membership_snapshot(membership),
        branch=group.branch_id,
        request=request,
    )
    return membership


def _lock(membership: GroupMembership) -> GroupMembership:
    return (
        GroupMembership.objects.select_for_update()
        .select_related("group", "group__course", "student")
        .get(pk=membership.pk)
    )


@transaction.atomic
def update_membership(actor, membership: GroupMembership, data: dict, request=None) -> GroupMembership:
    m = _lock(membership)
    require(can_manage_group(actor, m.group))
    before = {k: getattr(m, k) for k in ("discount_type", "discount_value", "discount_reason", "note")}
    for k, v in data.items():
        setattr(m, k, v)
    if m.discount_type == DiscountType.NONE:
        m.discount_value = Decimal("0")
    _validate_discount(m.discount_type, m.discount_value, m.monthly_fee)
    m.save()
    changes = {k: [before[k], getattr(m, k)] for k in before if before[k] != getattr(m, k)}
    if changes:
        audit("update", actor=actor, obj=m, changes=changes, branch=m.group.branch_id, request=request)
    return m


@transaction.atomic
def freeze(actor, membership: GroupMembership, request=None) -> GroupMembership:
    m = _lock(membership)
    require(can_manage_group(actor, m.group))
    if m.status != MembershipStatus.ACTIVE:
        raise BusinessRuleError("Faqat faol a'zolikni muzlatish mumkin.", code="invalid_status")
    m.status = MembershipStatus.FROZEN
    m.save(update_fields=["status", "updated_at"])
    audit("membership_freeze", actor=actor, obj=m, branch=m.group.branch_id, request=request)
    return m


@transaction.atomic
def activate(actor, membership: GroupMembership, request=None) -> GroupMembership:
    m = _lock(membership)
    require(can_manage_group(actor, m.group))
    if m.status != MembershipStatus.FROZEN:
        raise BusinessRuleError("Faqat muzlatilgan a'zolikni faollashtirish mumkin.", code="invalid_status")
    Group.objects.select_for_update().get(pk=m.group_id)
    _ensure_capacity(m.group)
    m.status = MembershipStatus.ACTIVE
    m.save(update_fields=["status", "updated_at"])
    audit("membership_activate", actor=actor, obj=m, branch=m.group.branch_id, request=request)
    return m


@transaction.atomic
def leave(actor, membership: GroupMembership, left_at: dt.date, reason: str = "", request=None) -> GroupMembership:
    m = _lock(membership)
    require(can_manage_group(actor, m.group))
    if m.status not in OPEN_MEMBERSHIP_STATUSES:
        raise BusinessRuleError("A'zolik allaqachon yopilgan.", code="invalid_status")
    if left_at < m.joined_at:
        raise BusinessRuleError("Chiqish sanasi qo'shilish sanasidan oldin bo'lishi mumkin emas.", code="invalid_date")
    m.status = MembershipStatus.LEFT
    m.left_at = left_at
    if reason:
        m.note = reason[:255]
    m.save(update_fields=["status", "left_at", "note", "updated_at"])
    audit(
        "membership_leave",
        actor=actor,
        obj=m,
        changes={"left_at": left_at, "reason": reason},
        branch=m.group.branch_id,
        request=request,
    )
    return m


@transaction.atomic
def transfer(actor, membership: GroupMembership, to_group: Group, on_date: dt.date, request=None) -> GroupMembership:
    m = _lock(membership)
    require(can_manage_group(actor, m.group), "Bu a'zolikni boshqarishga ruxsat yo'q.")
    require(can_manage_group(actor, to_group), "Maqsad guruhni boshqarishga ruxsat yo'q.")
    if actor.role == AD and to_group.branch_id != m.group.branch_id:
        raise BusinessRuleError("Admin faqat filial ichida ko'chira oladi.", code="branch_mismatch")
    if m.status not in OPEN_MEMBERSHIP_STATUSES:
        raise BusinessRuleError("Faqat faol yoki muzlatilgan a'zolikni ko'chirish mumkin.", code="invalid_status")
    if to_group.pk == m.group_id:
        raise BusinessRuleError("Student allaqachon shu guruhda.", code="same_group")
    if on_date < m.joined_at:
        raise BusinessRuleError("Ko'chirish sanasi qo'shilish sanasidan oldin bo'lmasin.", code="invalid_date")

    student = m.student
    cross_branch = to_group.branch_id != student.branch_id
    if cross_branch:
        others = student.memberships.filter(status__in=OPEN_MEMBERSHIP_STATUSES).exclude(pk=m.pk)
        if actor.role != SA or others.exists():
            raise BusinessRuleError(
                "Studentning boshqa faol guruhlari bor — filiallararo ko'chirib bo'lmaydi.", code="branch_mismatch"
            )

    m.status = MembershipStatus.TRANSFERRED
    m.left_at = on_date
    m.save(update_fields=["status", "left_at", "updated_at"])
    if cross_branch:
        student.branch_id = to_group.branch_id
        student.save(update_fields=["branch", "updated_at"])

    fee = to_group.course.monthly_price
    discount_value = m.discount_value
    if m.discount_type == DiscountType.FIXED:
        discount_value = min(discount_value, fee)
    new = enroll(
        actor,
        group=to_group,
        student=student,
        joined_at=on_date,
        discount_type=m.discount_type,
        discount_value=discount_value,
        discount_reason=m.discount_reason,
        note=f"Ko'chirildi: {m.group.code}",
        request=request,
    )
    m.transferred_to = new
    m.save(update_fields=["transferred_to", "updated_at"])
    audit(
        "transfer",
        actor=actor,
        obj=m,
        changes={"from_group": m.group_id, "to_group": to_group.pk, "date": on_date, "new_membership": new.pk},
        branch=m.group.branch_id,
        request=request,
    )
    return new
