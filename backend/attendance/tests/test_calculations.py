import datetime as dt

import pytest

from attendance.calculations import AttendanceCounts, rate, summarize
from attendance.models import AttendanceRecord
from conftest import enroll, make_lesson, make_user
from core.roles import Role
from organizations.models import SystemSettings

C = AttendanceCounts(present=6, absent=2, late=1, excused=1)


@pytest.mark.parametrize(
    ("policy", "late_present", "expected"),
    [
        ("exclude", True, round(7 / 9 * 100, 1)),
        ("exclude", False, round(6 / 9 * 100, 1)),
        ("present", True, round(8 / 10 * 100, 1)),
        ("absent", True, round(7 / 10 * 100, 1)),
    ],
)
def test_rate_policies(policy, late_present, expected):
    assert rate(C, excused_policy=policy, late_counts_present=late_present) == expected


def test_rate_none_when_nothing_counted():
    only_excused = AttendanceCounts(excused=3)
    assert rate(only_excused, excused_policy="exclude", late_counts_present=True) is None
    assert rate(AttendanceCounts(), excused_policy="absent", late_counts_present=True) is None


@pytest.mark.django_db
def test_summarize_ignores_cancelled_lessons(group, student):
    enroll(student, group)
    today = dt.date.today()
    normal = make_lesson(group, today - dt.timedelta(days=2))
    cancelled = make_lesson(group, today - dt.timedelta(days=1), status="cancelled")
    AttendanceRecord.objects.create(lesson=normal, student=student, status="present")
    AttendanceRecord.objects.create(lesson=cancelled, student=student, status="absent")
    result = summarize(AttendanceRecord.objects.filter(student=student), SystemSettings.load())
    assert result["present"] == 1 and result["absent"] == 0 and result["rate"] == 100.0


@pytest.mark.django_db
def test_summarize_respects_settings(group, branch):
    s = make_user(Role.STUDENT, branch=branch)
    enroll(s, group)
    lessons = [make_lesson(group, dt.date(2026, 9, d)) for d in (1, 2)]
    AttendanceRecord.objects.create(lesson=lessons[0], student=s, status="present")
    AttendanceRecord.objects.create(lesson=lessons[1], student=s, status="excused")
    conf = SystemSettings.load()
    assert summarize(AttendanceRecord.objects.all(), conf)["rate"] == 100.0
    conf.attendance_excused_policy = "absent"
    conf.save()
    assert summarize(AttendanceRecord.objects.all(), conf)["rate"] == 50.0
