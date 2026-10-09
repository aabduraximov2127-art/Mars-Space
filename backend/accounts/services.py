"""Account business operations: tokens, lock-out, user lifecycle, passwords."""

from __future__ import annotations

import hashlib
import secrets
import string

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.roles import AD, SA, ST, TE

from .models import User, UserProfile

# --- login lock-out ---------------------------------------------------------------------------


def _lock_key(identifier: str) -> str:
    digest = hashlib.sha256((identifier or "").strip().lower().encode()).hexdigest()
    return f"login-failures:{digest}"


def is_login_locked(identifier: str) -> bool:
    return cache.get(_lock_key(identifier), 0) >= settings.LOGIN_MAX_FAILURES


def register_login_failure(identifier: str) -> int:
    key = _lock_key(identifier)
    timeout = settings.LOGIN_LOCKOUT_MINUTES * 60
    if cache.add(key, 1, timeout):
        return 1
    try:
        return cache.incr(key)
    except ValueError:  # expired between add() and incr()
        cache.set(key, 1, timeout)
        return 1


def clear_login_failures(identifier: str) -> None:
    cache.delete(_lock_key(identifier))


def mask_identifier(identifier: str) -> str:
    identifier = (identifier or "").strip()
    if "@" in identifier:
        name, _, domain = identifier.partition("@")
        return f"{name[:2]}***@{domain}"
    return f"{identifier[:5]}***{identifier[-2:]}" if len(identifier) > 7 else "***"


# --- tokens & cookie --------------------------------------------------------------------------


def issue_tokens(user: User) -> tuple[str, str]:
    refresh = RefreshToken.for_user(user)
    return str(refresh.access_token), str(refresh)


def set_refresh_cookie(response, refresh: str) -> None:
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        path=settings.REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response) -> None:
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
    )


def revoke_user_tokens(user: User) -> int:
    """Blacklist every outstanding refresh token of ``user`` (logout everywhere)."""
    count = 0
    for token in OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False):
        BlacklistedToken.objects.get_or_create(token=token)
        count += 1
    return count


# --- passwords ----------------------------------------------------------------------------------

_TEMP_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0OolI1")


def generate_temporary_password(length: int = 10) -> str:
    while True:
        candidate = "".join(secrets.choice(_TEMP_ALPHABET) for _ in range(length))
        if any(c.isdigit() for c in candidate) and any(c.isalpha() for c in candidate):
            return candidate


def _validate_new_password(password: str, user: User | None, field: str = "new_password") -> None:
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise ValidationError({field: list(exc.messages)}) from exc


def change_own_password(user: User, old_password: str, new_password: str, *, request=None) -> None:
    if not user.check_password(old_password):
        raise ValidationError({"old_password": ["Joriy parol noto'g'ri."]})
    if old_password == new_password:
        raise ValidationError({"new_password": ["Yangi parol eskisidan farq qilishi kerak."]})
    _validate_new_password(new_password, user)
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_user_tokens(user)
    audit("password_change", actor=user, obj=user, request=request)


def send_password_reset(email: str, *, request=None) -> None:
    """Send a reset link if an active user has this email. Silent otherwise (no enumeration)."""
    user = User.objects.filter(email=(email or "").strip().lower(), is_active=True).first()
    if user is None:
        return
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
    send_mail(
        subject="EduCentr: parolni tiklash",
        message=(
            f"Assalomu alaykum, {user.first_name}!\n\n"
            f"Parolingizni tiklash uchun quyidagi havolani oching (24 soat amal qiladi):\n{link}\n\n"
            "Agar bu so'rovni siz yubormagan bo'lsangiz, xatni e'tiborsiz qoldiring."
        ),
        from_email=None,
        recipient_list=[user.email],
        fail_silently=False,
    )
    audit("password_reset_requested", actor=user, obj=user, request=request)


def confirm_password_reset(uidb64: str, token: str, new_password: str, *, request=None) -> User:
    invalid = ValidationError({"token": ["Havola yaroqsiz yoki muddati o'tgan."]})
    try:
        user_id = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=user_id, is_active=True)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        raise invalid from None
    if not default_token_generator.check_token(user, token):
        raise invalid
    _validate_new_password(new_password, user)
    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_user_tokens(user)
    audit("password_reset", actor=user, obj=user, request=request)
    return user


# --- user lifecycle -----------------------------------------------------------------------------

PROFILE_FIELDS = ("birth_date", "parent_name", "parent_phone", "specialization", "bio", "notes")


def allowed_roles_to_manage(actor: User) -> tuple[str, ...]:
    if actor.role == SA:
        return (SA, AD, TE, ST)
    if actor.role == AD:
        return (TE, ST)
    return ()


def _apply_profile(user: User, profile_data: dict | None) -> dict:
    if not profile_data:
        return {}
    profile, _ = UserProfile.objects.get_or_create(user=user)
    before = {f: getattr(profile, f) for f in PROFILE_FIELDS}
    for field, value in profile_data.items():
        if field in PROFILE_FIELDS:
            setattr(profile, field, value)
    profile.full_clean(exclude=["user"])
    profile.save()
    after = {f: getattr(profile, f) for f in PROFILE_FIELDS}
    return {f"profile.{k}": [before[k], after[k]] for k in PROFILE_FIELDS if before[k] != after[k]}


@transaction.atomic
def create_user(actor: User, *, data: dict, profile_data: dict | None = None, request=None) -> tuple[User, str | None]:
    """Create an account. Returns ``(user, temporary_password_or_None)``."""
    role = data["role"]
    if role not in allowed_roles_to_manage(actor):
        raise PermissionDenied("Bu rolda foydalanuvchi yaratishga ruxsat yo'q.")
    branch = data.get("branch")
    if actor.role == AD:
        branch = actor.branch  # admins can only create users in their own branch
    if role == SA:
        branch = None
    elif branch is None:
        raise ValidationError({"branch": ["Filial majburiy."]})
    elif not branch.is_active:
        raise ValidationError({"branch": ["Filial faol emas."]})

    password = data.get("password") or None
    temporary = None
    if password:
        _validate_new_password(password, None, field="password")
    else:
        temporary = generate_temporary_password()
        password = temporary

    user = User(
        phone=data["phone"],
        email=data.get("email", ""),
        first_name=data["first_name"],
        last_name=data["last_name"],
        role=role,
        branch=branch,
        is_staff=role == SA,
        is_superuser=role == SA,
        must_change_password=temporary is not None,
    )
    if data.get("avatar"):
        user.avatar = data["avatar"]
    user.set_password(password)
    user.save()
    _apply_profile(user, profile_data)
    audit(
        "create",
        actor=actor,
        obj=user,
        changes={"role": role, "branch": getattr(branch, "pk", None), "phone": user.phone},
        request=request,
    )
    return user, temporary


@transaction.atomic
def update_user(actor: User, user: User, *, data: dict, profile_data: dict | None = None, request=None) -> User:
    tracked = ("phone", "email", "first_name", "last_name")
    before = {f: getattr(user, f) for f in tracked}
    for field in tracked:
        if field in data:
            setattr(user, field, data[field])
    if "avatar" in data:
        user.avatar = data["avatar"] or ""
    user.save()
    changes = {f: [before[f], getattr(user, f)] for f in tracked if before[f] != getattr(user, f)}
    changes.update(_apply_profile(user, profile_data))
    if changes:
        audit("update", actor=actor, obj=user, changes=changes, request=request)
    return user


def _ensure_not_last_superadmin(user: User) -> None:
    if user.role == SA and not User.objects.filter(role=SA, is_active=True).exclude(pk=user.pk).exists():
        raise BusinessRuleError("Oxirgi faol superadminni o'zgartirib bo'lmaydi.", code="last_superadmin")


@transaction.atomic
def block_user(actor: User, user: User, *, reason: str = "", request=None) -> User:
    if user.pk == actor.pk:
        raise BusinessRuleError("O'zingizni bloklay olmaysiz.", code="self_block")
    _ensure_not_last_superadmin(user)
    if not user.is_active:
        return user
    user.is_active = False
    user.deactivated_at = timezone.now()
    user.save(update_fields=["is_active", "deactivated_at", "updated_at"])
    revoke_user_tokens(user)
    audit("block", actor=actor, obj=user, changes={"reason": reason}, request=request)
    return user


@transaction.atomic
def unblock_user(actor: User, user: User, *, request=None) -> User:
    if user.is_active:
        return user
    if user.branch_id and not user.branch.is_active:
        raise BusinessRuleError("Foydalanuvchi filiali faol emas.", code="branch_inactive")
    user.is_active = True
    user.deactivated_at = None
    user.save(update_fields=["is_active", "deactivated_at", "updated_at"])
    audit("unblock", actor=actor, obj=user, request=request)
    return user


@transaction.atomic
def admin_set_password(actor: User, user: User, *, new_password: str | None = None, request=None) -> str | None:
    """Reset someone else's password. Returns the generated temporary password (if any)."""
    temporary = None
    if new_password:
        _validate_new_password(new_password, user)
    else:
        temporary = generate_temporary_password()
        new_password = temporary
    user.set_password(new_password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    revoke_user_tokens(user)
    audit("password_set_by_admin", actor=actor, obj=user, request=request)
    return temporary


@transaction.atomic
def change_role(actor: User, user: User, *, role: str, branch=None, request=None) -> User:
    if actor.role != SA:
        raise PermissionDenied("Rolni faqat superadmin o'zgartira oladi.")
    if user.pk == actor.pk:
        raise BusinessRuleError("O'z rolingizni o'zgartira olmaysiz.", code="self_role_change")
    if user.role == role and (branch is None or branch.pk == user.branch_id):
        return user
    if user.role == SA and role != SA:
        _ensure_not_last_superadmin(user)
    if role != SA:
        branch = branch or user.branch
        if branch is None:
            raise ValidationError({"branch": ["Bu rol uchun filial majburiy."]})
    else:
        branch = None
    _ensure_role_change_is_safe(user, new_role=role, new_branch=branch)
    before = {"role": user.role, "branch": user.branch_id}
    user.role = role
    user.branch = branch
    user.is_staff = role == SA
    user.is_superuser = role == SA
    user.save(update_fields=["role", "branch", "is_staff", "is_superuser", "updated_at"])
    revoke_user_tokens(user)
    audit(
        "role_change",
        actor=actor,
        obj=user,
        changes={"role": [before["role"], role], "branch": [before["branch"], user.branch_id]},
        request=request,
    )
    return user


def _ensure_role_change_is_safe(user: User, *, new_role: str, new_branch) -> None:
    """Refuse changes that would orphan open work (keeps data consistent)."""
    from groups.models import OPEN_MEMBERSHIP_STATUSES

    if (
        user.role == TE
        and new_role != TE
        and user.teaching_groups.exclude(status__in=("completed", "cancelled")).exists()
    ):
        raise BusinessRuleError(
            "Ustozning faol guruhlari bor. Avval guruhlarni boshqa ustozga o'tkazing.", code="teacher_has_groups"
        )
    if user.role == ST and (new_role != ST or (new_branch and new_branch.pk != user.branch_id)):
        if user.memberships.filter(status__in=OPEN_MEMBERSHIP_STATUSES).exists():
            raise BusinessRuleError(
                "Studentning faol guruh a'zoligi bor. Avval a'zolikni yakunlang.", code="student_has_memberships"
            )
    if user.role == TE and new_role == TE and new_branch and new_branch.pk != user.branch_id:
        if user.teaching_groups.exclude(status__in=("completed", "cancelled")).exists():
            raise BusinessRuleError(
                "Ustozning faol guruhlari bor. Avval guruhlarni boshqa ustozga o'tkazing.", code="teacher_has_groups"
            )
