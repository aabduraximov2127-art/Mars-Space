import datetime as dt

import pytest
from django.utils import timezone

from conftest import make_lesson

pytestmark = pytest.mark.django_db


def test_study_history_scoping(client_for, admin_user, other_admin, teacher, other_teacher, student, group, membership):
    url = f"/api/users/{student.pk}/study-history/"
    data = client_for(admin_user).get(url).data
    assert [m["group"] for m in data["memberships"]] == [group.pk]
    assert data["memberships"][0]["balance"] is not None
    teacher_view = client_for(teacher).get(url).data["memberships"][0]
    assert "balance" not in teacher_view  # money is staff-only
    assert client_for(other_admin).get(url).status_code == 404
    assert client_for(other_teacher).get(url).status_code == 404
    assert client_for(student).get(url).status_code == 403


def test_study_history_only_for_students(client_for, admin_user, teacher):
    r = client_for(admin_user).get(f"/api/users/{teacher.pk}/study-history/")
    assert r.status_code == 400 and r.data["code"] == "not_student"


def test_teaching_overview(client_for, admin_user, teacher, other_teacher, group, membership):
    make_lesson(group, date=timezone.localdate() + dt.timedelta(days=1))
    url = f"/api/users/{teacher.pk}/teaching-overview/"
    data = client_for(teacher).get(url).data
    assert data["groups"][0]["students_count"] == 1
    assert len(data["upcoming_lessons"]) == 1
    assert client_for(admin_user).get(url).status_code == 200
    assert client_for(other_teacher).get(url).status_code == 403
