import pytest

from audit.models import AuditLog
from conftest import make_lesson, make_room, make_user
from core.roles import Role
from organizations.models import Branch, SystemSettings

pytestmark = pytest.mark.django_db


class TestBranches:
    def test_superadmin_crud_and_stats(self, client_for, superadmin, branch, student, teacher):
        client = client_for(superadmin)
        res = client.post("/api/branches/", {"name": "Sergeli", "code": "srg", "phone": "90 111 22 33"}, format="json")
        assert res.status_code == 201, res.data
        assert res.data["code"] == "SRG" and res.data["phone"] == "+998901112233"
        listing = {b["id"]: b for b in client.get("/api/branches/").data["results"]}
        assert listing[branch.id]["students_count"] == 1 and listing[branch.id]["teachers_count"] == 1
        upd = client.patch(f"/api/branches/{res.data['id']}/", {"is_active": False}, format="json")
        assert upd.status_code == 200 and upd.data["is_active"] is False
        assert AuditLog.objects.filter(entity_type="organizations.Branch", action="update").exists()

    def test_duplicate_code_rejected(self, client_for, superadmin, branch):
        res = client_for(superadmin).post("/api/branches/", {"name": "X", "code": branch.code.lower()}, format="json")
        assert res.status_code == 400 and "code" in res.data["errors"]

    def test_no_delete_endpoint(self, client_for, superadmin, branch):
        assert client_for(superadmin).delete(f"/api/branches/{branch.id}/").status_code == 405

    @pytest.mark.parametrize("who", ["admin_user", "teacher", "student"])
    def test_others_see_only_own_branch_and_cannot_write(self, request, client_for, who, branch, other_branch):
        user = request.getfixturevalue(who)
        client = client_for(user)
        ids = [b["id"] for b in client.get("/api/branches/").data["results"]]
        assert ids == [branch.id]
        assert client.get(f"/api/branches/{other_branch.id}/").status_code == 404
        assert client.post("/api/branches/", {"name": "Z", "code": "ZZ"}, format="json").status_code == 403
        assert client.patch(f"/api/branches/{branch.id}/", {"name": "Hack"}, format="json").status_code == 403
        assert "students_count" in client.get(f"/api/branches/{branch.id}/").data


class TestRooms:
    def test_admin_room_branch_forced(self, client_for, admin_user, other_branch):
        res = client_for(admin_user).post(
            "/api/rooms/", {"name": "101", "capacity": 15, "branch": other_branch.id}, format="json"
        )
        assert res.status_code == 201, res.data
        assert res.data["branch"] == admin_user.branch_id

    def test_superadmin_must_choose_branch(self, client_for, superadmin):
        assert client_for(superadmin).post("/api/rooms/", {"name": "A"}, format="json").status_code == 400

    def test_duplicate_room_name_in_branch(self, client_for, admin_user, branch):
        make_room(branch, name="Lab")
        res = client_for(admin_user).post("/api/rooms/", {"name": "lab"}, format="json")
        assert res.status_code == 400 and "name" in res.data["errors"]

    def test_scope_and_teacher_read_only(self, client_for, admin_user, teacher, student, branch, other_branch):
        mine, foreign = make_room(branch), make_room(other_branch)
        assert client_for(admin_user).get(f"/api/rooms/{foreign.id}/").status_code == 404
        t = client_for(teacher)
        assert [r["id"] for r in t.get("/api/rooms/").data["results"]] == [mine.id]
        assert t.post("/api/rooms/", {"name": "x"}, format="json").status_code == 403
        assert client_for(student).get("/api/rooms/").status_code == 403

    def test_room_in_use_cannot_be_deleted(self, client_for, admin_user, group, branch):
        room = make_room(branch)
        make_lesson(group, room=room)
        res = client_for(admin_user).delete(f"/api/rooms/{room.id}/")
        assert res.status_code == 400 and res.data["code"] == "room_in_use"
        unused = make_room(branch)
        assert client_for(admin_user).delete(f"/api/rooms/{unused.id}/").status_code == 204


class TestSettings:
    def test_superadmin_updates_with_audit(self, client_for, superadmin):
        res = client_for(superadmin).patch(
            "/api/settings/",
            {"attendance_excused_policy": "absent", "allowed_upload_extensions": "PDF, .zip"},
            format="json",
        )
        assert res.status_code == 200, res.data
        conf = SystemSettings.load()
        assert conf.attendance_excused_policy == "absent" and conf.allowed_upload_extensions == "pdf,zip"
        assert conf.updated_by == superadmin
        assert AuditLog.objects.filter(action="settings_update").exists()

    def test_dangerous_extensions_and_ranges_rejected(self, client_for, superadmin):
        client = client_for(superadmin)
        assert (
            client.patch("/api/settings/", {"allowed_upload_extensions": "pdf,exe"}, format="json").status_code == 400
        )
        assert client.patch("/api/settings/", {"max_upload_mb": 500}, format="json").status_code == 400
        assert client.patch("/api/settings/", {"invoice_due_day": 31}, format="json").status_code == 400

    def test_admin_reads_but_cannot_write(self, client_for, admin_user):
        client = client_for(admin_user)
        assert client.get("/api/settings/").status_code == 200
        assert client.patch("/api/settings/", {"center_name": "X"}, format="json").status_code == 403

    @pytest.mark.parametrize("who", ["teacher", "student"])
    def test_public_settings_for_everyone(self, request, client_for, who):
        client = client_for(request.getfixturevalue(who))
        assert client.get("/api/settings/").status_code == 403
        res = client.get("/api/settings/public/")
        assert res.status_code == 200 and res.data["currency"] == "UZS"
        assert "payment_void_window_hours" not in res.data


def test_inactive_branch_blocks_user_creation(client_for, superadmin):
    closed = Branch.objects.create(name="Yopiq", code="CLS", is_active=False)
    res = client_for(superadmin).post(
        "/api/users/",
        {"phone": "+998935550077", "first_name": "A", "last_name": "B", "role": "student", "branch": closed.id},
        format="json",
    )
    assert res.status_code == 400
    assert make_user(Role.STUDENT, branch=closed).branch_id == closed.id  # model itself allows it (admin tools)
