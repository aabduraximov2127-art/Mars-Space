import re

import pytest
from django.core import mail
from django.test import override_settings

from accounts.models import User
from audit.models import AuditLog
from conftest import PASSWORD, make_user
from core.roles import Role

pytestmark = pytest.mark.django_db

XHR = {"HTTP_X_REQUESTED_WITH": "XMLHttpRequest"}
COOKIE = "ec_refresh"


def login(client, login_value, password=PASSWORD):
    return client.post("/api/auth/login/", {"login": login_value, "password": password}, format="json")


class TestLogin:
    def test_login_with_phone_returns_access_and_sets_httponly_cookie(self, api_client, student):
        res = login(api_client, student.phone)
        assert res.status_code == 200, res.data
        assert res.data["access"]
        assert res.data["user"]["id"] == student.id
        assert res.data["user"]["role"] == "student"
        assert "refresh" not in res.data  # refresh token never in the body
        cookie = res.cookies[COOKIE]
        assert cookie["httponly"]
        assert cookie["samesite"] == "Strict"
        assert cookie["path"] == "/api/auth/"
        assert AuditLog.objects.filter(action="login", actor=student).exists()

    @pytest.mark.parametrize("variant", ["90 {a} {b} {c}", "998{raw}", "{raw9}"])
    def test_login_accepts_phone_formats(self, api_client, branch, variant):
        user = make_user(Role.STUDENT, branch=branch, phone="+998901112233")
        value = variant.format(a="111", b="22", c="33", raw="901112233", raw9="901112233")
        assert login(api_client, value).status_code == 200
        assert user.phone == "+998901112233"

    def test_login_with_email_case_insensitive(self, api_client, branch):
        make_user(Role.TEACHER, branch=branch, email="Teacher@Example.com")
        assert login(api_client, "TEACHER@example.COM").status_code == 200

    def test_wrong_password_is_generic_400_and_audited(self, api_client, student):
        res = login(api_client, student.phone, "wrong-password")
        assert res.status_code == 400
        assert res.data["code"] == "invalid_credentials"
        unknown = login(api_client, "+998909999999", "whatever")
        assert unknown.status_code == 400
        assert unknown.data["detail"] == res.data["detail"]  # no user enumeration
        assert AuditLog.objects.filter(action="login_failed").count() == 2

    def test_blocked_user_cannot_login(self, api_client, student):
        student.is_active = False
        student.save()
        res = login(api_client, student.phone)
        assert res.status_code == 403
        assert res.data["code"] == "account_disabled"

    @override_settings(LOGIN_MAX_FAILURES=3)
    def test_lockout_after_repeated_failures(self, api_client, student):
        for _ in range(3):
            assert login(api_client, student.phone, "bad").status_code == 400
        res = login(api_client, student.phone)  # even the right password is refused now
        assert res.status_code == 429
        assert res.data["code"] == "login_locked"

    def test_login_ip_throttle(self, api_client, student, settings):
        settings.REST_FRAMEWORK = {
            **settings.REST_FRAMEWORK,
            "DEFAULT_THROTTLE_RATES": {"login": "2/min", "password_reset": "5/hour", "chat_message": "30/min"},
        }
        from django.core.cache import cache

        cache.clear()
        assert login(api_client, student.phone).status_code == 200
        assert login(api_client, student.phone).status_code == 200
        res = login(api_client, student.phone)
        assert res.status_code == 429
        assert res.data["code"] == "throttled"


class TestRefreshAndLogout:
    def test_refresh_requires_xhr_header(self, api_client, student):
        login(api_client, student.phone)
        res = api_client.post("/api/auth/refresh/")
        assert res.status_code == 403

    def test_refresh_rotates_and_old_token_is_rejected(self, api_client, student):
        login(api_client, student.phone)
        old = api_client.cookies[COOKIE].value
        res = api_client.post("/api/auth/refresh/", **XHR)
        assert res.status_code == 200 and res.data["access"]
        new = res.cookies[COOKIE].value
        assert new and new != old
        # replaying the rotated (blacklisted) token fails
        replay = api_client.__class__()
        replay.cookies[COOKIE] = old
        assert replay.post("/api/auth/refresh/", **XHR).status_code == 401

    def test_refresh_without_cookie_is_401(self, api_client):
        assert api_client.post("/api/auth/refresh/", **XHR).status_code == 401

    def test_refresh_fails_for_blocked_user(self, api_client, student):
        login(api_client, student.phone)
        User.objects.filter(pk=student.pk).update(is_active=False)
        assert api_client.post("/api/auth/refresh/", **XHR).status_code == 401

    def test_access_token_works_and_blocked_user_is_rejected_immediately(self, api_client, student):
        access = login(api_client, student.phone).data["access"]
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        assert api_client.get("/api/auth/me/").status_code == 200
        User.objects.filter(pk=student.pk).update(is_active=False)
        assert api_client.get("/api/auth/me/").status_code == 401

    def test_logout_blacklists_refresh_and_clears_cookie(self, api_client, student):
        login(api_client, student.phone)
        token = api_client.cookies[COOKIE].value
        res = api_client.post("/api/auth/logout/", **XHR)
        assert res.status_code == 204
        assert res.cookies[COOKIE].value == ""
        again = api_client.__class__()
        again.cookies[COOKIE] = token
        assert again.post("/api/auth/refresh/", **XHR).status_code == 401


class TestMe:
    def test_me_requires_auth(self, api_client):
        res = api_client.get("/api/auth/me/")
        assert res.status_code == 401
        assert res.data["code"] == "not_authenticated"

    def test_student_cannot_change_name_role_or_branch(self, client_for, student, other_branch):
        client = client_for(student)
        res = client.patch("/api/auth/me/", {"first_name": "Hacker"}, format="json")
        assert res.status_code == 400
        res = client.patch(
            "/api/auth/me/", {"role": "superadmin", "branch": other_branch.id, "email": "me@x.uz"}, format="json"
        )
        assert res.status_code == 200
        student.refresh_from_db()
        assert student.role == "student" and student.branch_id != other_branch.id
        assert student.email == "me@x.uz"

    def test_admin_can_change_own_name(self, client_for, admin_user):
        res = client_for(admin_user).patch("/api/auth/me/", {"first_name": "Yangi"}, format="json")
        assert res.status_code == 200 and res.data["first_name"] == "Yangi"

    def test_me_email_must_be_unique(self, client_for, student, teacher):
        teacher.email = "taken@x.uz"
        teacher.save()
        res = client_for(student).patch("/api/auth/me/", {"email": "TAKEN@x.uz"}, format="json")
        assert res.status_code == 400 and "email" in res.data["errors"]

    def test_me_hides_internal_notes(self, client_for, student):
        student.profile.notes = "secret admin note"
        student.profile.save()
        res = client_for(student).get("/api/auth/me/")
        assert "notes" not in res.data["profile"]


class TestPasswords:
    def test_change_password_revokes_old_sessions(self, api_client, student):
        access = login(api_client, student.phone).data["access"]
        old_refresh = api_client.cookies[COOKIE].value
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = api_client.post(
            "/api/auth/change-password/",
            {"old_password": PASSWORD, "new_password": "An0ther-Secret!"},
            format="json",
        )
        assert res.status_code == 200 and res.data["access"]
        stale = api_client.__class__()
        stale.cookies[COOKIE] = old_refresh
        assert stale.post("/api/auth/refresh/", **XHR).status_code == 401
        assert login(api_client.__class__(), student.phone, "An0ther-Secret!").status_code == 200

    def test_change_password_validates(self, client_for, student):
        client = client_for(student)
        bad_old = client.post(
            "/api/auth/change-password/", {"old_password": "nope", "new_password": "An0ther-Secret!"}, format="json"
        )
        assert bad_old.status_code == 400 and "old_password" in bad_old.data["errors"]
        weak = client.post(
            "/api/auth/change-password/", {"old_password": PASSWORD, "new_password": "123"}, format="json"
        )
        assert weak.status_code == 400 and "new_password" in weak.data["errors"]

    def test_password_reset_flow(self, api_client, branch):
        user = make_user(Role.STUDENT, branch=branch, email="reset@x.uz")
        res = api_client.post("/api/auth/password-reset/", {"email": "reset@x.uz"}, format="json")
        assert res.status_code == 200
        assert len(mail.outbox) == 1
        link = re.search(r"uid=([^&\s]+)&token=([^\s]+)", mail.outbox[0].body)
        uid, token = link.group(1), link.group(2)
        bad = api_client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": "x-y", "new_password": "Brand-New-9"},
            format="json",
        )
        assert bad.status_code == 400
        ok = api_client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "Brand-New-9"},
            format="json",
        )
        assert ok.status_code == 204
        user.refresh_from_db()
        assert user.check_password("Brand-New-9")
        # token is single-use: password hash changed, so the same token is now invalid
        again = api_client.post(
            "/api/auth/password-reset/confirm/",
            {"uid": uid, "token": token, "new_password": "Other-Pass-9"},
            format="json",
        )
        assert again.status_code == 400

    def test_password_reset_unknown_email_is_silent(self, api_client):
        res = api_client.post("/api/auth/password-reset/", {"email": "nobody@x.uz"}, format="json")
        assert res.status_code == 200
        assert len(mail.outbox) == 0
