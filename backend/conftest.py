"""Shared pytest fixtures and factories for every app's tests.

Factories are plain functions (``make_*``) exposed through fixtures so tests can build exactly
the data they need. All factories create *valid* rows (correct roles/branches).
"""

from __future__ import annotations

import datetime as dt
import itertools
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from core.roles import Role
from courses.models import Course
from groups.models import Group, GroupMembership, GroupStatus
from organizations.models import Branch, Room
from schedules.models import Lesson

PASSWORD = "Str0ng-Passw0rd!"
_seq = itertools.count(1)


def _n() -> int:
    return next(_seq)


# --- factories ------------------------------------------------------------------------------


def make_branch(**kw) -> Branch:
    n = _n()
    kw.setdefault("name", f"Filial {n}")
    kw.setdefault("code", f"BR{n}")
    return Branch.objects.create(**kw)


def make_user(role: str = Role.STUDENT, branch: Branch | None = None, **kw) -> User:
    n = _n()
    if role != Role.SUPERADMIN and branch is None:
        branch = make_branch()
    kw.setdefault("phone", f"+99890{n:07d}")
    kw.setdefault("first_name", f"Ism{n}")
    kw.setdefault("last_name", f"Familiya{n}")
    password = kw.pop("password", PASSWORD)
    if role == Role.SUPERADMIN:
        return User.objects.create_superuser(password=password, **kw)
    return User.objects.create_user(password=password, role=role, branch=branch, **kw)


def make_room(branch: Branch, **kw) -> Room:
    kw.setdefault("name", f"Xona {_n()}")
    return Room.objects.create(branch=branch, **kw)


def make_course(branch: Branch | None = None, **kw) -> Course:
    n = _n()
    kw.setdefault("name", f"Kurs {n}")
    kw.setdefault("code", f"C{n}")
    kw.setdefault("duration_months", 6)
    kw.setdefault("monthly_price", Decimal("500000.00"))
    return Course.objects.create(branch=branch, **kw)


def make_group(branch: Branch, teacher: User | None = None, course: Course | None = None, **kw) -> Group:
    n = _n()
    kw.setdefault("code", f"G{n}")
    kw.setdefault("name", f"Guruh {n}")
    kw.setdefault("status", GroupStatus.ACTIVE)
    kw.setdefault("start_date", timezone.localdate() - dt.timedelta(days=30))
    kw.setdefault("days_of_week", [0, 2, 4])
    kw.setdefault("lesson_start_time", dt.time(14, 0))
    kw.setdefault("lesson_end_time", dt.time(15, 30))
    return Group.objects.create(branch=branch, teacher=teacher, course=course or make_course(), **kw)


def enroll(student: User, group: Group, **kw) -> GroupMembership:
    kw.setdefault("joined_at", group.start_date)
    kw.setdefault("monthly_fee", group.course.monthly_price)
    return GroupMembership.objects.create(student=student, group=group, **kw)


def make_lesson(group: Group, date: dt.date | None = None, **kw) -> Lesson:
    kw.setdefault("start_time", dt.time(14, 0))
    kw.setdefault("end_time", dt.time(15, 30))
    return Lesson.objects.create(
        group=group,
        teacher=kw.pop("teacher", None) or group.teacher,
        date=date or timezone.localdate(),
        **kw,
    )


# --- fixtures -------------------------------------------------------------------------------


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def client_for():
    """``client_for(user)`` -> APIClient authenticated as ``user`` (JWT bypassed)."""

    def _client(user: User) -> APIClient:
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return _client


@pytest.fixture
def factories():
    class F:
        branch = staticmethod(make_branch)
        user = staticmethod(make_user)
        room = staticmethod(make_room)
        course = staticmethod(make_course)
        group = staticmethod(make_group)
        enroll = staticmethod(enroll)
        lesson = staticmethod(make_lesson)

    return F


@pytest.fixture
def branch(db) -> Branch:
    return make_branch(name="Chilonzor", code="CHL")


@pytest.fixture
def other_branch(db) -> Branch:
    return make_branch(name="Yunusobod", code="YNS")


@pytest.fixture
def superadmin(db) -> User:
    return make_user(Role.SUPERADMIN, first_name="Super", last_name="Admin")


@pytest.fixture
def admin_user(branch) -> User:
    return make_user(Role.ADMIN, branch=branch, first_name="Ali", last_name="Admin")


@pytest.fixture
def other_admin(other_branch) -> User:
    return make_user(Role.ADMIN, branch=other_branch, first_name="Olim", last_name="Boshqa")


@pytest.fixture
def teacher(branch) -> User:
    return make_user(Role.TEACHER, branch=branch, first_name="Tohir", last_name="Ustoz")


@pytest.fixture
def other_teacher(branch) -> User:
    return make_user(Role.TEACHER, branch=branch, first_name="Timur", last_name="Ikkinchi")


@pytest.fixture
def student(branch) -> User:
    return make_user(Role.STUDENT, branch=branch, first_name="Sardor", last_name="Student")


@pytest.fixture
def other_student(branch) -> User:
    return make_user(Role.STUDENT, branch=branch, first_name="Sevara", last_name="Boshqa")


@pytest.fixture
def course(db) -> Course:
    return make_course(name="Frontend", code="FE")


@pytest.fixture
def group(branch, teacher, course) -> Group:
    return make_group(branch, teacher=teacher, course=course, code="FE-1", name="Frontend 1")


@pytest.fixture
def membership(student, group) -> GroupMembership:
    return enroll(student, group)
