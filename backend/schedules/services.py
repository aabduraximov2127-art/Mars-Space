"""Lesson scheduling: conflict detection, CRUD transitions and bulk generation from a group timetable."""

from __future__ import annotations

import datetime as dt

from django.db import transaction
from django.db.models import Q

from audit.services import record as audit
from core.exceptions import BusinessRuleError, ConflictError
from core.roles import TE
from notifications.services import NotificationType, notify

from .models import Lesson, LessonStatus

MAX_GENERATE_DAYS = 366
TIME_FMT = "%H:%M"


def _conflict_row(lesson: Lesson, kind: str) -> dict:
    labels = {"group": "Guruhda", "teacher": "Ustozda", "room": "Xonada"}
    return {
        "type": kind,
        "lesson_id": lesson.pk,
        "group": lesson.group.code,
        "date": lesson.date.isoformat(),
        "start_time": lesson.start_time.strftime(TIME_FMT),
        "end_time": lesson.end_time.strftime(TIME_FMT),
        "message": (
            f"{labels[kind]} shu vaqtda boshqa dars bor: {lesson.group.code}, "
            f"{lesson.date:%d.%m.%Y} {lesson.start_time:%H:%M}-{lesson.end_time:%H:%M}."
        ),
    }


def find_conflicts(
    *,
    date: dt.date,
    start_time: dt.time,
    end_time: dt.time,
    group_id: int,
    teacher_id: int | None,
    room_id: int | None,
    exclude_pk: int | None = None,
    lock: bool = True,
) -> list[dict]:
    """Overlapping, non-cancelled lessons that share the group, the teacher or the room."""
    cond = Q(group_id=group_id)
    if teacher_id:
        cond |= Q(teacher_id=teacher_id)
    if room_id:
        cond |= Q(room_id=room_id)
    qs = (
        Lesson.objects.filter(date=date, start_time__lt=end_time, end_time__gt=start_time)
        .exclude(status=LessonStatus.CANCELLED)
        .filter(cond)
        .select_related("group")
    )
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    if lock:
        qs = qs.select_for_update(of=("self",))
    rows = []
    for lesson in qs:
        if lesson.group_id == group_id:
            rows.append(_conflict_row(lesson, "group"))
        elif teacher_id and lesson.teacher_id == teacher_id:
            rows.append(_conflict_row(lesson, "teacher"))
        else:
            rows.append(_conflict_row(lesson, "room"))
    return rows


def _validate_resources(group, teacher, room) -> None:
    if teacher is None:
        raise BusinessRuleError("Dars uchun ustoz belgilanmagan (guruhga ustoz biriktiring).", code="teacher_required")
    if teacher.role != TE or not teacher.is_active:
        raise BusinessRuleError("Tanlangan foydalanuvchi faol ustoz emas.", code="invalid_teacher")
    if teacher.branch_id != group.branch_id:
        raise BusinessRuleError("Ustoz guruh filialiga tegishli emas.", code="invalid_teacher")
    if room is not None and room.branch_id != group.branch_id:
        raise BusinessRuleError("Xona guruh filialiga tegishli emas.", code="invalid_room")


def _check_times(start_time, end_time) -> None:
    if end_time <= start_time:
        raise BusinessRuleError("Dars tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak.", code="invalid_time")


def _participants(group) -> list:
    from groups.selectors import open_memberships

    users = [m.student for m in open_memberships(group).select_related("student")]
    if group.teacher_id:
        users.append(group.teacher)
    return users


@transaction.atomic
def create_lesson(actor, *, group, date, start_time, end_time, teacher=None, room=None, topic="", request=None):
    teacher = teacher or group.teacher
    room = room if room is not None else group.room
    _validate_resources(group, teacher, room)
    _check_times(start_time, end_time)
    conflicts = find_conflicts(
        date=date,
        start_time=start_time,
        end_time=end_time,
        group_id=group.pk,
        teacher_id=teacher.pk,
        room_id=room.pk if room else None,
    )
    if conflicts:
        raise ConflictError("Dars jadvalida to'qnashuv bor.", code="schedule_conflict", extra={"conflicts": conflicts})
    lesson = Lesson.objects.create(
        group=group,
        teacher=teacher,
        room=room,
        date=date,
        start_time=start_time,
        end_time=end_time,
        topic=topic or "",
        created_by=actor,
    )
    audit("create", actor=actor, obj=lesson, branch=group.branch_id, request=request)
    return lesson


SCHEDULE_FIELDS = ("date", "start_time", "end_time", "teacher_id", "room_id")


@transaction.atomic
def update_lesson(actor, lesson: Lesson, data: dict, request=None) -> Lesson:
    lesson = Lesson.objects.select_for_update().select_related("group").get(pk=lesson.pk)
    if lesson.status == LessonStatus.CANCELLED and set(data) - {"topic", "notes"}:
        raise BusinessRuleError("Bekor qilingan darsni o'zgartirib bo'lmaydi.", code="lesson_cancelled")
    before = {f: getattr(lesson, f) for f in (*SCHEDULE_FIELDS, "topic", "notes")}
    for field, value in data.items():
        setattr(lesson, field, value)
    schedule_changed = any(before[f] != getattr(lesson, f) for f in SCHEDULE_FIELDS)
    if schedule_changed:
        _validate_resources(lesson.group, lesson.teacher, lesson.room)
        _check_times(lesson.start_time, lesson.end_time)
        if lesson.attendance_records.exists() and before["date"] != lesson.date:
            raise BusinessRuleError(
                "Davomati belgilangan darsning sanasini o'zgartirib bo'lmaydi.", code="lesson_has_attendance"
            )
        conflicts = find_conflicts(
            date=lesson.date,
            start_time=lesson.start_time,
            end_time=lesson.end_time,
            group_id=lesson.group_id,
            teacher_id=lesson.teacher_id,
            room_id=lesson.room_id,
            exclude_pk=lesson.pk,
        )
        if conflicts:
            raise ConflictError(
                "Dars jadvalida to'qnashuv bor.", code="schedule_conflict", extra={"conflicts": conflicts}
            )
    lesson.save()
    after = {f: getattr(lesson, f) for f in before}
    changes = {k: [before[k], after[k]] for k in before if before[k] != after[k]}
    if changes:
        audit("update", actor=actor, obj=lesson, changes=changes, branch=lesson.group.branch_id, request=request)
    if schedule_changed:
        notify(
            _participants(lesson.group),
            NotificationType.SCHEDULE_CHANGED,
            f"Dars jadvali o'zgardi: {lesson.group.name}",
            f"Yangi vaqt: {lesson.date:%d.%m.%Y} {lesson.start_time:%H:%M}-{lesson.end_time:%H:%M}.",
            link="/schedule",
            data={"lesson_id": lesson.pk},
        )
    return lesson


@transaction.atomic
def cancel_lesson(actor, lesson: Lesson, reason: str, request=None) -> Lesson:
    lesson = Lesson.objects.select_for_update().select_related("group").get(pk=lesson.pk)
    if lesson.status == LessonStatus.CANCELLED:
        raise BusinessRuleError("Dars allaqachon bekor qilingan.", code="already_cancelled")
    if lesson.status == LessonStatus.COMPLETED:
        raise BusinessRuleError("O'tilgan darsni bekor qilib bo'lmaydi.", code="lesson_completed")
    lesson.status = LessonStatus.CANCELLED
    lesson.cancel_reason = reason[:255]
    lesson.save(update_fields=["status", "cancel_reason", "updated_at"])
    audit(
        "lesson_cancel",
        actor=actor,
        obj=lesson,
        changes={"reason": reason},
        branch=lesson.group.branch_id,
        request=request,
    )
    notify(
        _participants(lesson.group),
        NotificationType.SCHEDULE_CHANGED,
        f"Dars bekor qilindi: {lesson.group.name}",
        f"{lesson.date:%d.%m.%Y} {lesson.start_time:%H:%M} dagi dars bekor qilindi. Sabab: {reason}",
        link="/schedule",
        data={"lesson_id": lesson.pk},
    )
    return lesson


@transaction.atomic
def delete_lesson(actor, lesson: Lesson, request=None) -> None:
    if lesson.attendance_records.exists() or lesson.assignments.exists():
        raise BusinessRuleError(
            "Darsga davomat yoki vazifa bog'langan. O'chirish o'rniga uni bekor qiling.", code="lesson_in_use"
        )
    audit("delete", actor=actor, obj=lesson, branch=lesson.group.branch_id, request=request)
    lesson.delete()


@transaction.atomic
def generate_lessons(actor, group, date_from: dt.date, date_to: dt.date, request=None) -> dict:
    if date_to < date_from:
        raise BusinessRuleError("Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas.", code="invalid_range")
    if (date_to - date_from).days > MAX_GENERATE_DAYS:
        raise BusinessRuleError("Bir martada ko'pi bilan 1 yillik dars yaratish mumkin.", code="range_too_large")
    if not group.days_of_week or not group.lesson_start_time or not group.lesson_end_time:
        raise BusinessRuleError("Guruhda dars kunlari va vaqti belgilanmagan.", code="timetable_missing")
    if group.status in ("completed", "cancelled"):
        raise BusinessRuleError("Yakunlangan yoki bekor qilingan guruhga dars yaratib bo'lmaydi.", code="group_closed")
    _validate_resources(group, group.teacher, group.room)

    created: list[Lesson] = []
    skipped: list[dict] = []
    day = max(date_from, group.start_date)
    last = min(date_to, group.end_date) if group.end_date else date_to
    days = set(group.days_of_week)
    while day <= last:
        if day.weekday() in days:
            if Lesson.objects.filter(group=group, date=day, start_time=group.lesson_start_time).exists():
                skipped.append({"date": day.isoformat(), "reason": "Dars allaqachon mavjud."})
            else:
                conflicts = find_conflicts(
                    date=day,
                    start_time=group.lesson_start_time,
                    end_time=group.lesson_end_time,
                    group_id=group.pk,
                    teacher_id=group.teacher_id,
                    room_id=group.room_id,
                )
                if conflicts:
                    skipped.append({"date": day.isoformat(), "reason": conflicts[0]["message"]})
                else:
                    created.append(
                        Lesson.objects.create(
                            group=group,
                            teacher=group.teacher,
                            room=group.room,
                            date=day,
                            start_time=group.lesson_start_time,
                            end_time=group.lesson_end_time,
                            created_by=actor,
                        )
                    )
        day += dt.timedelta(days=1)
    audit(
        "generate_lessons",
        actor=actor,
        obj=group,
        changes={"date_from": date_from, "date_to": date_to, "created": len(created), "skipped": len(skipped)},
        request=request,
    )
    return {"created": len(created), "skipped": skipped}
