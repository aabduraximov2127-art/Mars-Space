"""Read-only aggregates for the user detail pages (study history of a student, workload of a teacher)."""

from __future__ import annotations

import datetime as dt

from django.db.models import Count, Q, Sum
from django.utils import timezone

from core.roles import AD, SA


def study_history(student, viewer) -> dict:
    """Every membership of ``student`` with attendance rate and grade average per group.

    Balances (charged/paid/debt) are included only for staff viewers. Teachers only see the
    memberships of their own groups.
    """
    from attendance.calculations import summarize
    from attendance.models import AttendanceRecord
    from grades.models import Grade
    from organizations.models import SystemSettings
    from payments.calculations import balance_of, with_balances

    conf = SystemSettings.load()
    staff = viewer.role in (SA, AD)
    memberships = student.memberships.select_related("group", "group__course", "group__teacher").order_by("-joined_at")
    if not staff:
        memberships = memberships.filter(group__teacher=viewer)
    balances = {}
    if staff:
        balances = {m.pk: balance_of(m.charged, m.paid) for m in with_balances(memberships)}

    rows = []
    for m in memberships:
        records = AttendanceRecord.objects.filter(student=student, lesson__group=m.group)
        grades = Grade.objects.filter(student=student, group=m.group).aggregate(
            s=Sum("score"), mx=Sum("max_score"), c=Count("id")
        )
        row = {
            "membership": m.pk,
            "group": m.group_id,
            "group_name": m.group.name,
            "group_code": m.group.code,
            "course_name": m.group.course.name,
            "teacher_name": m.group.teacher.full_name if m.group.teacher else None,
            "status": m.status,
            "joined_at": m.joined_at,
            "left_at": m.left_at,
            "attendance": summarize(records, conf),
            "grades": {
                "graded_count": grades["c"] or 0,
                "average_percent": round(float(grades["s"]) / float(grades["mx"]) * 100, 1) if grades["mx"] else None,
            },
        }
        if staff:
            b = balances.get(m.pk)
            row["balance"] = {k: str(v) for k, v in b.items()} if b else None
        rows.append(row)
    return {"student": student.pk, "full_name": student.full_name, "memberships": rows}


def teaching_overview(teacher) -> dict:
    """Groups of a teacher, the next week's lessons and this week's workload."""
    from groups.models import Group, GroupStatus
    from schedules.models import Lesson, LessonStatus

    today = timezone.localdate()
    week_start = today - dt.timedelta(days=today.weekday())
    week_end = week_start + dt.timedelta(days=6)
    groups = (
        Group.objects.filter(teacher=teacher)
        .exclude(status=GroupStatus.CANCELLED)
        .select_related("course", "room")
        .annotate(students_count=Count("memberships", filter=Q(memberships__status="active"), distinct=True))
        .order_by("name")
    )
    lessons = (
        Lesson.objects.filter(Q(teacher=teacher) | Q(group__teacher=teacher))
        .exclude(status=LessonStatus.CANCELLED)
        .select_related("group", "room")
    )
    this_week = list(lessons.filter(date__gte=week_start, date__lte=week_end))
    minutes = sum(
        (dt.datetime.combine(today, lesson.end_time) - dt.datetime.combine(today, lesson.start_time)).seconds // 60
        for lesson in this_week
    )
    upcoming = lessons.filter(date__gte=today, date__lte=today + dt.timedelta(days=7)).order_by("date", "start_time")
    return {
        "teacher": teacher.pk,
        "full_name": teacher.full_name,
        "groups": [
            {
                "id": g.pk,
                "name": g.name,
                "code": g.code,
                "course_name": g.course.name,
                "status": g.status,
                "students_count": g.students_count,
                "days_of_week": g.days_of_week,
                "lesson_start_time": g.lesson_start_time,
                "lesson_end_time": g.lesson_end_time,
                "room_name": g.room.name if g.room else None,
            }
            for g in groups
        ],
        "upcoming_lessons": [
            {
                "id": lesson.pk,
                "group": lesson.group_id,
                "group_name": lesson.group.name,
                "date": lesson.date,
                "start_time": lesson.start_time,
                "end_time": lesson.end_time,
                "room_name": lesson.room.name if lesson.room else None,
                "topic": lesson.topic,
            }
            for lesson in upcoming[:20]
        ],
        "weekly_load": {
            "week_start": week_start,
            "lessons": len(this_week),
            "hours": round(minutes / 60, 1),
            "active_groups": sum(1 for g in groups if g.status == GroupStatus.ACTIVE),
            "students": sum(g.students_count for g in groups),
        },
    }
