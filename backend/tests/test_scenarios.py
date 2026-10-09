"""The 12 mandatory end-to-end scenarios (docs/IMPLEMENTATION_PLAN.md, Phase 7) through the public API."""

import datetime as dt
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import User
from conftest import make_lesson

pytestmark = pytest.mark.django_db


def test_full_lifecycle(client_for, superadmin, branch, other_branch, course, factories):
    sa = client_for(superadmin)

    # 1. Superadmin creates a branch admin.
    r = sa.post(
        "/api/users/",
        {"phone": "+998911111111", "first_name": "Anvar", "last_name": "Admin", "role": "admin", "branch": branch.pk},
        format="json",
    )
    assert r.status_code == 201, r.data
    assert r.data["temporary_password"]
    admin = User.objects.get(pk=r.data["id"])
    ad = client_for(admin)

    # 2. Admin creates a teacher and a student; both are forced into the admin's branch.
    r = ad.post(
        "/api/users/",
        {"phone": "+998912222222", "first_name": "Ulug'bek", "last_name": "Ustoz", "role": "teacher"},
        format="json",
    )
    assert r.status_code == 201, r.data
    teacher = User.objects.get(pk=r.data["id"])
    assert teacher.branch_id == branch.pk
    r = ad.post(
        "/api/users/",
        {
            "phone": "+998913333333",
            "first_name": "Sitora",
            "last_name": "Student",
            "role": "student",
            "branch": other_branch.pk,  # ignored for admins
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    student = User.objects.get(pk=r.data["id"])
    assert student.branch_id == branch.pk

    # Group with the new teacher.
    r = ad.post(
        "/api/groups/",
        {
            "code": "SC-1",
            "name": "Ssenariy guruhi",
            "course": course.pk,
            "teacher": teacher.pk,
            "status": "active",
            "start_date": (timezone.localdate() - dt.timedelta(days=10)).isoformat(),
            "capacity": 10,
            "days_of_week": [0, 1, 2, 3, 4, 5, 6],
            "lesson_start_time": "08:00",
            "lesson_end_time": "09:00",
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    group_id = r.data["id"]

    # 3. Student is enrolled into the group.
    r = ad.post(
        "/api/memberships/",
        {
            "group": group_id,
            "student": student.pk,
            "joined_at": (timezone.localdate() - dt.timedelta(days=10)).isoformat(),
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    membership_id = r.data["id"]
    assert Decimal(r.data["monthly_fee"]) == course.monthly_price

    # 4. Teacher marks attendance for a past lesson of their group.
    yesterday = timezone.localdate() - dt.timedelta(days=1)
    r = ad.post(
        f"/api/groups/{group_id}/generate-lessons/",
        {"date_from": yesterday.isoformat(), "date_to": (yesterday + dt.timedelta(days=2)).isoformat()},
        format="json",
    )
    assert r.status_code == 200 and r.data["created"] == 3, r.data
    te = client_for(teacher)
    lesson_id = te.get("/api/lessons/", {"date": yesterday.isoformat()}).data["results"][0]["id"]
    sheet = te.get(f"/api/attendance/lesson/{lesson_id}/")
    assert sheet.status_code == 200 and sheet.data["can_mark"], sheet.data
    assert [s["student"] for s in sheet.data["students"]] == [student.pk]
    r = te.post(
        f"/api/attendance/lesson/{lesson_id}/mark/",
        {"records": [{"student": student.pk, "status": "late"}]},
        format="json",
    )
    assert r.status_code == 200 and r.data["created"] == 1, r.data

    # 5. Student sees their attendance.
    st = client_for(student)
    r = st.get("/api/attendance/")
    assert r.data["count"] == 1 and r.data["results"][0]["status"] == "late"
    summary = st.get("/api/attendance/summary/").data
    assert summary["late"] == 1 and summary["rate"] == 100.0

    # 6. Teacher publishes an assignment.
    r = te.post(
        "/api/assignments/",
        {
            "group": group_id,
            "title": "Birinchi vazifa",
            "description": "Bajaring",
            "max_score": 50,
            "due_at": (timezone.now() + dt.timedelta(days=3)).isoformat(),
            "status": "published",
        },
        format="json",
    )
    assert r.status_code == 201, r.data
    assignment_id = r.data["id"]
    assert student.notifications.filter(type="assignment_new").exists()

    # 7. Student submits (student is taken from the token, not from the body).
    r = st.post(
        "/api/submissions/",
        {"assignment": assignment_id, "text": "Tayyor", "student": teacher.pk},
        format="json",
    )
    assert r.status_code == 201, r.data
    submission_id = r.data["id"]
    assert r.data["student"] == student.pk

    # 8. Teacher grades it.
    r = te.post(f"/api/submissions/{submission_id}/grade/", {"score": "45", "comment": "Yaxshi"}, format="json")
    assert r.status_code == 200, r.data
    assert r.data["status"] == "graded"
    r = te.post(f"/api/submissions/{submission_id}/grade/", {"score": "51"}, format="json")
    assert r.status_code == 400  # above max_score

    # 9. Student sees the grade.
    grades = st.get("/api/grades/").data
    assert grades["count"] == 1 and Decimal(grades["results"][0]["score"]) == Decimal("45")
    assert st.get("/api/grades/summary/").data["average_percent"] == 90.0

    # 10. Admin records a payment.
    r = ad.post("/api/invoices/generate/", {"period": timezone.localdate().strftime("%Y-%m")}, format="json")
    assert r.status_code == 200 and r.data["created"] == 1, r.data
    r = ad.post(
        "/api/payments/",
        {"membership": membership_id, "amount": "200000", "method": "cash"},
        format="json",
    )
    assert r.status_code == 201, r.data
    balance = st.get("/api/balances/").data["results"][0]
    assert Decimal(balance["paid"]) == Decimal("200000") and Decimal(balance["debt"]) == course.monthly_price - 200000

    # 11. Dashboard reflects the new data.
    k = ad.get("/api/reports/dashboard/").data["kpis"]
    assert k["students"] == 1
    assert Decimal(k["revenue"]) == Decimal("200000")
    assert Decimal(k["total_debt"]) == course.monthly_price - 200000 and k["debtors"] == 1
    sk = st.get("/api/reports/dashboard/").data["kpis"]
    assert sk["average_percent"] == 90.0 and Decimal(sk["debt"]) > 0

    # 12. Nobody reaches data outside their scope.
    outsider_admin = factories.user("admin", branch=other_branch)
    oa = client_for(outsider_admin)
    assert oa.get(f"/api/groups/{group_id}/").status_code == 404
    assert oa.get(f"/api/memberships/{membership_id}/").status_code == 404
    assert (
        oa.post(
            "/api/payments/", {"membership": membership_id, "amount": "1000", "method": "cash"}, format="json"
        ).status_code
        == 400
    )
    other_student = factories.user("student", branch=branch)
    os_ = client_for(other_student)
    assert os_.get(f"/api/submissions/{submission_id}/").status_code == 404
    assert os_.get(f"/api/assignments/{assignment_id}/").status_code == 404
    assert os_.get("/api/grades/").data["count"] == 0
    assert st.post("/api/payments/", {"membership": membership_id, "amount": "1", "method": "cash"}).status_code == 403
    other_teacher = factories.user("teacher", branch=branch)
    ot = client_for(other_teacher)
    assert ot.get(f"/api/attendance/lesson/{lesson_id}/").status_code == 404
    assert ot.post(f"/api/submissions/{submission_id}/grade/", {"score": "1"}).status_code == 404
    assert st.get("/api/audit-logs/").status_code == 403
    assert ad.get("/api/audit-logs/").status_code == 403
    assert sa.get("/api/audit-logs/").status_code == 200


def test_teacher_cannot_mark_future_or_expired_lessons(client_for, teacher, group, membership):
    te = client_for(teacher)
    future = make_lesson(group, date=timezone.localdate() + dt.timedelta(days=1))
    r = te.post(
        f"/api/attendance/lesson/{future.pk}/mark/",
        {"records": [{"student": membership.student_id, "status": "present"}]},
        format="json",
    )
    assert r.status_code == 400 and r.data["code"] == "lesson_in_future"
    old = make_lesson(group, date=timezone.localdate() - dt.timedelta(days=10))
    r = te.post(
        f"/api/attendance/lesson/{old.pk}/mark/",
        {"records": [{"student": membership.student_id, "status": "present"}]},
        format="json",
    )
    assert r.status_code == 400 and r.data["code"] == "edit_window_closed"


def test_attendance_rejects_foreign_student(client_for, teacher, group, membership, other_student):
    lesson = make_lesson(group, date=timezone.localdate() - dt.timedelta(days=1))
    r = client_for(teacher).post(
        f"/api/attendance/lesson/{lesson.pk}/mark/",
        {"records": [{"student": other_student.pk, "status": "present"}]},
        format="json",
    )
    assert r.status_code == 400


def test_attendance_changes_are_recorded(client_for, admin_user, group, membership):
    lesson = make_lesson(group, date=timezone.localdate() - dt.timedelta(days=1))
    ad = client_for(admin_user)
    url = f"/api/attendance/lesson/{lesson.pk}/mark/"
    ad.post(url, {"records": [{"student": membership.student_id, "status": "absent"}]}, format="json")
    r = ad.post(
        url,
        {"records": [{"student": membership.student_id, "status": "excused"}], "reason": "Ma'lumotnoma"},
        format="json",
    )
    assert r.data["updated"] == 1
    record_id = ad.get("/api/attendance/", {"lesson": lesson.pk}).data["results"][0]["id"]
    history = ad.get(f"/api/attendance/{record_id}/history/").data
    assert [h["new_status"] for h in history] == ["excused", "absent"]
    assert history[0]["reason"] == "Ma'lumotnoma"
