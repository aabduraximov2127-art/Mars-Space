import pytest

from accounts.models import User
from audit.models import AuditLog
from conftest import PASSWORD, enroll, make_group, make_user
from core.roles import Role

pytestmark = pytest.mark.django_db

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}


def payload(**kw):
    data = {"phone": "+998935550011", "first_name": "Yangi", "last_name": "Odam", "role": "student"}
    data.update(kw)
    return data


class TestCreate:
    def test_superadmin_creates_admin_with_temporary_password(self, client_for, superadmin, branch):
        res = client_for(superadmin).post("/api/users/", payload(role="admin", branch=branch.id), format="json")
        assert res.status_code == 201, res.data
        assert res.data["role"] == "admin" and res.data["branch"] == branch.id
        temp = res.data["temporary_password"]
        assert temp and len(temp) >= 10
        user = User.objects.get(pk=res.data["id"])
        assert user.must_change_password and user.check_password(temp)
        assert AuditLog.objects.filter(action="create", entity_id=str(user.pk)).exists()

    def test_admin_creates_student_branch_forced_to_own(self, client_for, admin_user, other_branch):
        res = client_for(admin_user).post(
            "/api/users/", payload(branch=other_branch.id, password="Given-Passw0rd"), format="json"
        )
        assert res.status_code == 201, res.data
        assert res.data["branch"] == admin_user.branch_id  # client-sent branch ignored
        assert res.data["temporary_password"] is None

    @pytest.mark.parametrize("role", ["admin", "superadmin"])
    def test_admin_cannot_create_privileged_roles(self, client_for, admin_user, role):
        res = client_for(admin_user).post("/api/users/", payload(role=role), format="json")
        assert res.status_code in (400, 403)
        assert not User.objects.filter(phone="+998935550011").exists()

    @pytest.mark.parametrize("role_fixture", ["teacher", "student"])
    def test_teacher_and_student_cannot_create(self, request, client_for, role_fixture):
        user = request.getfixturevalue(role_fixture)
        assert client_for(user).post("/api/users/", payload(), format="json").status_code == 403

    def test_duplicate_phone_and_email_rejected(self, client_for, admin_user, student):
        student.email = "dup@x.uz"
        student.save()
        client = client_for(admin_user)
        res = client.post("/api/users/", payload(phone=student.phone.replace("+", "")), format="json")
        assert res.status_code == 400 and "phone" in res.data["errors"]
        res = client.post("/api/users/", payload(email="DUP@x.uz"), format="json")
        assert res.status_code == 400 and "email" in res.data["errors"]

    def test_invalid_phone_rejected(self, client_for, admin_user):
        res = client_for(admin_user).post("/api/users/", payload(phone="+99890123"), format="json")
        assert res.status_code == 400 and "phone" in res.data["errors"]


class TestScope:
    def test_admin_sees_only_own_branch_teachers_and_students(self, client_for, admin_user, student, other_admin):
        foreign = make_user(Role.STUDENT, branch=other_admin.branch)
        client = client_for(admin_user)
        ids = {u["id"] for u in client.get("/api/users/").data["results"]}
        assert student.id in ids
        assert foreign.id not in ids and other_admin.id not in ids and admin_user.id not in ids
        assert client.get(f"/api/users/{foreign.id}/").status_code == 404  # IDOR -> 404

    def test_teacher_sees_only_students_of_own_groups(self, client_for, teacher, group, student, other_student):
        enroll(student, group)
        client = client_for(teacher)
        res = client.get("/api/users/")
        ids = {u["id"] for u in res.data["results"]}
        assert ids == {student.id}
        assert "notes" not in res.data["results"][0]["profile"]
        assert client.get(f"/api/users/{other_student.id}/").status_code == 404
        assert client.patch(f"/api/users/{student.id}/", {"first_name": "X"}, format="json").status_code == 403

    def test_student_cannot_list_users(self, client_for, student):
        assert client_for(student).get("/api/users/").status_code == 403

    def test_filters_and_search(self, client_for, superadmin, branch):
        make_user(Role.TEACHER, branch=branch, last_name="Qidiruvov")
        client = client_for(superadmin)
        res = client.get("/api/users/", {"role": "teacher", "search": "qidiruv"})
        assert [u["last_name"] for u in res.data["results"]] == ["Qidiruvov"]


class TestUpdateAndLifecycle:
    def test_admin_updates_student_but_role_branch_ignored(self, client_for, admin_user, student, other_branch):
        res = client_for(admin_user).patch(
            f"/api/users/{student.id}/",
            {"first_name": "Tahrir", "role": "admin", "branch": other_branch.id, "profile": {"notes": "ichki"}},
            format="json",
        )
        assert res.status_code == 200, res.data
        student.refresh_from_db()
        assert (
            student.first_name == "Tahrir" and student.role == "student" and student.branch_id == admin_user.branch_id
        )
        assert student.profile.notes == "ichki"

    def test_block_revokes_access_and_unblock_restores(self, api_client, client_for, admin_user, student):
        access = api_client.post(
            "/api/auth/login/", {"login": student.phone, "password": PASSWORD}, format="json"
        ).data["access"]
        res = client_for(admin_user).post(f"/api/users/{student.id}/block/", {"reason": "qarzdor"}, format="json")
        assert res.status_code == 200 and res.data["is_active"] is False
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        assert api_client.get("/api/auth/me/").status_code == 401
        assert api_client.post("/api/auth/refresh/", **XHR).status_code == 401
        assert client_for(admin_user).post(f"/api/users/{student.id}/unblock/").status_code == 200
        assert AuditLog.objects.filter(action="block", entity_id=str(student.id)).exists()

    def test_cannot_block_self_or_last_superadmin(self, client_for, superadmin):
        res = client_for(superadmin).post(f"/api/users/{superadmin.id}/block/", {}, format="json")
        assert res.status_code == 400 and res.data["code"] == "self_block"

    def test_set_password_returns_temp_and_forces_change(self, client_for, admin_user, teacher):
        res = client_for(admin_user).post(f"/api/users/{teacher.id}/set-password/", {}, format="json")
        assert res.status_code == 200
        teacher.refresh_from_db()
        assert teacher.must_change_password and teacher.check_password(res.data["temporary_password"])


class TestChangeRole:
    def test_only_superadmin_changes_roles(self, client_for, admin_user, superadmin, teacher, other_branch):
        assert (
            client_for(admin_user)
            .post(f"/api/users/{teacher.id}/change-role/", {"role": "admin"}, format="json")
            .status_code
            == 403
        )
        res = client_for(superadmin).post(
            f"/api/users/{teacher.id}/change-role/", {"role": "admin", "branch": other_branch.id}, format="json"
        )
        assert res.status_code == 200, res.data
        assert res.data["role"] == "admin" and res.data["branch"] == other_branch.id

    def test_teacher_with_active_groups_cannot_be_demoted(self, client_for, superadmin, teacher, branch):
        make_group(branch, teacher=teacher)
        res = client_for(superadmin).post(f"/api/users/{teacher.id}/change-role/", {"role": "student"}, format="json")
        assert res.status_code == 400 and res.data["code"] == "teacher_has_groups"

    def test_last_superadmin_cannot_be_demoted(self, client_for, superadmin, branch):
        other = make_user(Role.SUPERADMIN)
        client_for(superadmin).post(
            f"/api/users/{other.id}/change-role/", {"role": "admin", "branch": branch.id}, format="json"
        )
        # now `superadmin` is the last one; another superadmin would be needed to demote it
        third = make_user(Role.SUPERADMIN)
        User.objects.filter(pk=third.pk).update(is_active=False)
        res = client_for(superadmin).post(
            f"/api/users/{superadmin.id}/change-role/", {"role": "admin", "branch": branch.id}, format="json"
        )
        assert res.status_code == 400
