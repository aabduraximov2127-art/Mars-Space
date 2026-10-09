"""Attendance marking (upsert + immutable change history)."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.permissions import require
from core.roles import TE
from groups.selectors import attendance_eligible_memberships, can_manage_group
from organizations.models import SystemSettings
from schedules.models import Lesson, LessonStatus
from schedules.selectors import can_teach_lesson

from .models import AttendanceChange, AttendanceRecord


def lesson_start(lesson: Lesson) -> dt.datetime:
    return timezone.make_aware(dt.datetime.combine(lesson.date, lesson.start_time))


def lesson_end(lesson: Lesson) -> dt.datetime:
    return timezone.make_aware(dt.datetime.combine(lesson.date, lesson.end_time))


def check_can_mark(user, lesson: Lesson, conf: SystemSettings | None = None) -> None:
    if user.role == TE:
        require(can_teach_lesson(user, lesson), "Faqat o'z darsingiz davomatini belgilay olasiz.")
    else:
        require(can_manage_group(user, lesson.group))
    if lesson.status == LessonStatus.CANCELLED:
        raise BusinessRuleError("Bekor qilingan dars uchun davomat belgilab bo'lmaydi.", code="lesson_cancelled")
    now = timezone.now()
    if lesson_start(lesson) > now:
        raise BusinessRuleError("Hali boshlanmagan dars uchun davomat belgilab bo'lmaydi.", code="lesson_in_future")
    if user.role == TE:
        conf = conf or SystemSettings.load()
        deadline = lesson_end(lesson) + dt.timedelta(hours=conf.attendance_edit_window_hours)
        if now > deadline:
            raise BusinessRuleError(
                f"Davomatni dars tugaganidan so'ng {conf.attendance_edit_window_hours} soat ichida belgilash mumkin. "
                "Administratorga murojaat qiling.",
                code="edit_window_closed",
            )


def sheet(lesson: Lesson) -> list[dict]:
    """Eligible students with their current status for the lesson."""
    records = {r.student_id: r for r in lesson.attendance_records.all()}
    rows = []
    for m in attendance_eligible_memberships(lesson.group, lesson.date):
        rec = records.get(m.student_id)
        rows.append(
            {
                "student": m.student_id,
                "student_name": m.student.full_name,
                "record_id": rec.pk if rec else None,
                "status": rec.status if rec else None,
                "comment": rec.comment if rec else "",
            }
        )
    return rows


@transaction.atomic
def mark(user, lesson: Lesson, records: list[dict], reason: str = "", request=None) -> dict:
    lesson = Lesson.objects.select_for_update().select_related("group").get(pk=lesson.pk)
    check_can_mark(user, lesson)
    eligible = {m.student_id for m in attendance_eligible_memberships(lesson.group, lesson.date)}
    seen: set[int] = set()
    for i, row in enumerate(records):
        sid = row["student"]
        if sid not in eligible:
            raise ValidationError({"records": {i: {"student": ["Student bu dars guruhiga tegishli emas."]}}})
        if sid in seen:
            raise ValidationError({"records": {i: {"student": ["Student ikki marta berilgan."]}}})
        seen.add(sid)

    existing = {r.student_id: r for r in AttendanceRecord.objects.select_for_update().filter(lesson=lesson)}
    created = updated = 0
    changes = []
    for row in records:
        sid, new_status, comment = row["student"], row["status"], row.get("comment", "") or ""
        rec = existing.get(sid)
        if rec is None:
            rec = AttendanceRecord.objects.create(
                lesson=lesson, student_id=sid, status=new_status, comment=comment, marked_by=user
            )
            AttendanceChange.objects.create(
                record=rec, previous_status="", new_status=new_status, changed_by=user, reason=reason
            )
            created += 1
            changes.append([sid, None, new_status])
        elif rec.status != new_status or rec.comment != comment:
            if rec.status != new_status:
                AttendanceChange.objects.create(
                    record=rec, previous_status=rec.status, new_status=new_status, changed_by=user, reason=reason
                )
                changes.append([sid, rec.status, new_status])
            rec.status = new_status
            rec.comment = comment
            rec.marked_by = user
            rec.save(update_fields=["status", "comment", "marked_by", "updated_at"])
            updated += 1
    if lesson.status != LessonStatus.COMPLETED:
        lesson.status = LessonStatus.COMPLETED
        lesson.save(update_fields=["status", "updated_at"])
    if changes:
        audit(
            "attendance_mark",
            actor=user,
            obj=lesson,
            changes={"records": changes, "reason": reason},
            branch=lesson.group.branch_id,
            request=request,
        )
    return {"created": created, "updated": updated}
