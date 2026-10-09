"""Business rules of the new modules: schedule conflicts, enrolment, payments, chat, rewards, announcements."""

import datetime as dt
import uuid
from decimal import Decimal

import pytest
from django.utils import timezone

from conftest import enroll, make_group, make_lesson, make_room, make_user
from core.roles import Role
from groups.models import MembershipStatus
from payments.models import Payment

pytestmark = pytest.mark.django_db


# --- schedule -------------------------------------------------------------------------------


def test_lesson_conflicts_return_409(client_for, admin_user, branch, teacher, group):
    room = make_room(branch)
    other = make_group(branch, teacher=teacher)
    day = timezone.localdate() + dt.timedelta(days=2)
    make_lesson(group, date=day, room=room)
    r = client_for(admin_user).post(
        "/api/lessons/",
        {"group": other.pk, "date": day.isoformat(), "start_time": "14:30", "end_time": "16:00"},
        format="json",
    )
    assert r.status_code == 409
    assert r.data["conflicts"][0]["type"] == "teacher"


def test_generate_lessons_skips_existing_and_conflicts(client_for, admin_user, group):
    start = timezone.localdate() + dt.timedelta(days=7)
    url = f"/api/groups/{group.pk}/generate-lessons/"
    body = {"date_from": start.isoformat(), "date_to": (start + dt.timedelta(days=13)).isoformat()}
    first = client_for(admin_user).post(url, body, format="json").data
    assert first["created"] == 6  # Mon/Wed/Fri over two weeks
    again = client_for(admin_user).post(url, body, format="json").data
    assert again["created"] == 0 and len(again["skipped"]) == 6


def test_teacher_can_only_edit_topic(client_for, teacher, group):
    lesson = make_lesson(group, date=timezone.localdate() + dt.timedelta(days=1))
    te = client_for(teacher)
    assert te.patch(f"/api/lessons/{lesson.pk}/", {"topic": "Yangi mavzu"}, format="json").status_code == 200
    assert te.patch(f"/api/lessons/{lesson.pk}/", {"start_time": "10:00"}, format="json").status_code == 403


def test_cancel_lesson_notifies_students(client_for, admin_user, group, membership):
    lesson = make_lesson(group, date=timezone.localdate() + dt.timedelta(days=1))
    r = client_for(admin_user).post(f"/api/lessons/{lesson.pk}/cancel/", {"reason": "Bayram"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "cancelled"
    assert membership.student.notifications.filter(type="schedule_changed").exists()


# --- enrolment ------------------------------------------------------------------------------


def test_enrolment_rules(client_for, admin_user, branch, other_branch, group, student):
    ad = client_for(admin_user)
    body = {"group": group.pk, "student": student.pk, "joined_at": group.start_date.isoformat()}
    assert ad.post("/api/memberships/", body, format="json").status_code == 201
    assert ad.post("/api/memberships/", body, format="json").status_code == 409  # already enrolled
    foreign = make_user(Role.STUDENT, branch=other_branch)
    r = ad.post("/api/memberships/", {**body, "student": foreign.pk}, format="json")
    assert r.status_code == 400 and r.data["code"] == "branch_mismatch"
    group.capacity = 1
    group.save()
    r = ad.post("/api/memberships/", {**body, "student": make_user(Role.STUDENT, branch=branch).pk}, format="json")
    assert r.data["code"] == "group_full"


def test_transfer_keeps_history(client_for, admin_user, branch, teacher, group, membership):
    target = make_group(branch, teacher=teacher)
    today = timezone.localdate()
    r = client_for(admin_user).post(
        f"/api/memberships/{membership.pk}/transfer/", {"to_group": target.pk, "date": today.isoformat()}, format="json"
    )
    assert r.status_code == 201, r.data
    membership.refresh_from_db()
    assert membership.status == MembershipStatus.TRANSFERRED and membership.transferred_to_id == r.data["id"]


# --- payments -------------------------------------------------------------------------------


def test_payment_idempotency_and_duplicate_guard(client_for, admin_user, membership):
    ad = client_for(admin_user)
    key = str(uuid.uuid4())
    body = {"membership": membership.pk, "amount": "100000", "method": "cash", "idempotency_key": key}
    assert ad.post("/api/payments/", body, format="json").status_code == 201
    replay = ad.post("/api/payments/", body, format="json")
    assert replay.status_code == 200 and Payment.objects.count() == 1
    body2 = {**body, "idempotency_key": str(uuid.uuid4())}
    dup = ad.post("/api/payments/", body2, format="json")
    assert dup.status_code == 409 and dup.data["code"] == "duplicate_suspected"
    assert ad.post("/api/payments/", {**body2, "confirm_duplicate": True}, format="json").status_code == 201


def test_payment_void_window_for_admin(client_for, admin_user, superadmin, membership):
    ad = client_for(admin_user)
    pid = ad.post(
        "/api/payments/", {"membership": membership.pk, "amount": "5000", "method": "card"}, format="json"
    ).data["id"]
    Payment.objects.filter(pk=pid).update(created_at=timezone.now() - dt.timedelta(days=3))
    r = ad.post(f"/api/payments/{pid}/void/", {"reason": "Xato"}, format="json")
    assert r.status_code == 400 and r.data["code"] == "void_window_closed"
    r = client_for(superadmin).post(f"/api/payments/{pid}/void/", {"reason": "Xato"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "voided"
    assert ad.delete(f"/api/payments/{pid}/").status_code == 405


def test_invoices_are_idempotent_and_fifo(client_for, admin_user, membership):
    ad = client_for(admin_user)
    period = membership.joined_at.replace(day=1)
    first = ad.post("/api/invoices/generate/", {"period": period.strftime("%Y-%m")}, format="json").data
    assert first == {"created": 1, "skipped": 0}
    assert ad.post("/api/invoices/generate/", {"period": period.strftime("%Y-%m")}, format="json").data["skipped"] == 1
    ad.post("/api/payments/", {"membership": membership.pk, "amount": "100000", "method": "cash"}, format="json")
    inv = ad.get("/api/invoices/").data["results"][0]
    assert inv["payment_state"] == "partial" and Decimal(inv["paid_amount"]) == Decimal("100000")
    summary = ad.get("/api/balances/summary/").data
    assert summary["debtors_count"] == 1
    assert ad.get("/api/balances/", {"has_debt": "true"}).data["count"] == 1


def test_teacher_has_no_payment_access(client_for, teacher):
    assert client_for(teacher).get("/api/payments/").status_code == 403
    assert client_for(teacher).get("/api/reports/finance/").status_code == 403


def test_finance_csv_export(client_for, admin_user, membership):
    ad = client_for(admin_user)
    ad.post("/api/payments/", {"membership": membership.pk, "amount": "1000", "method": "cash"}, format="json")
    r = ad.get("/api/reports/finance/", {"export": "csv"})
    assert r.status_code == 200 and r["Content-Type"].startswith("text/csv")
    assert "Sardor Student" in r.content.decode("utf-8-sig")


# --- chat, rewards, announcements ------------------------------------------------------------


def test_chat_rules(client_for, student, other_student, teacher, membership):
    st = client_for(student)
    assert st.post("/api/chat/rooms/direct/", {"user_id": other_student.pk}, format="json").status_code == 403
    room = st.post("/api/chat/rooms/direct/", {"user_id": teacher.pk}, format="json").data
    assert st.post(f"/api/chat/rooms/{room['id']}/messages/", {"body": "Salom"}, format="json").status_code == 201
    assert client_for(other_student).get(f"/api/chat/rooms/{room['id']}/messages/").status_code == 403
    rooms = client_for(teacher).get("/api/chat/rooms/").data
    direct = next(r for r in rooms if r["kind"] == "direct")
    assert direct["unread_count"] == 1
    assert any(r["kind"] == "group" for r in rooms)


def test_teacher_reward_limit_and_balance(client_for, teacher, membership):
    te = client_for(teacher)
    sid = membership.student_id
    assert (
        te.post("/api/rewards/", {"student": sid, "amount": 500, "category": "activity", "reason": "x"}).status_code
        == 400
    )
    assert (
        te.post("/api/rewards/", {"student": sid, "amount": 20, "category": "activity", "reason": "Faol"}).status_code
        == 201
    )
    assert (
        te.post("/api/rewards/", {"student": sid, "amount": -30, "category": "penalty", "reason": "x"}).status_code
        == 400
    )
    assert client_for(membership.student).get("/api/rewards/balance/").data["balance"] == 20


def test_announcement_visibility(client_for, superadmin, admin_user, teacher, student, other_admin):
    sa = client_for(superadmin)
    sa.post(
        "/api/announcements/",
        {"title": "Ustozlar uchun", "body": "x", "audience_roles": ["teacher"], "status": "published"},
        format="json",
    )
    client_for(other_admin).post(
        "/api/announcements/", {"title": "Boshqa filial", "body": "x", "status": "published"}, format="json"
    )
    titles = lambda u: {a["title"] for a in client_for(u).get("/api/announcements/").data["results"]}  # noqa: E731
    assert "Ustozlar uchun" in titles(teacher)
    assert "Ustozlar uchun" not in titles(student)
    assert "Boshqa filial" not in titles(admin_user)
    assert teacher.notifications.filter(type="announcement").exists()


def test_student_scoping_on_lists(client_for, student, other_student, group, membership):
    enroll(other_student, make_group(group.branch))
    st = client_for(student)
    assert {g["id"] for g in st.get("/api/groups/").data["results"]} == {group.pk}
    assert st.get("/api/users/").status_code == 403
    assert st.get(f"/api/groups/{group.pk}/students/").status_code == 403
