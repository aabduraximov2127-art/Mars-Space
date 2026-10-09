from django.contrib.auth.backends import ModelBackend

from core.validators import normalize_email, normalize_phone

from .models import User


def find_user_by_login(login: str) -> User | None:
    """Resolve a login identifier: contains ``@`` -> email (case-insensitive), else phone."""
    login = (login or "").strip()
    if not login:
        return None
    if "@" in login:
        return User.objects.filter(email=normalize_email(login)).first()
    return User.objects.filter(phone=normalize_phone(login)).first()


class PhoneOrEmailBackend(ModelBackend):
    """Used by Django admin and ``authenticate()``; the API login view has its own flow."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        login = username or kwargs.get(User.USERNAME_FIELD) or kwargs.get("login")
        if not login or password is None:
            return None
        user = find_user_by_login(login)
        if user is None:
            User().set_password(password)  # equalise timing with the existing-user path
            return None
        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
