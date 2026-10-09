import re

from django.core.exceptions import ValidationError

_PHONE_NOISE_RE = re.compile(r"[\s\-().]")
_E164_RE = re.compile(r"^\+\d{10,15}$")
_UZ_RE = re.compile(r"^\+998\d{9}$")


def normalize_phone(value: str | None) -> str:
    """Normalise user input to E.164.

    ``90 123-45-67`` / ``901234567`` -> ``+998901234567``; ``998901234567`` -> ``+998901234567``.
    The result still has to pass :func:`validate_phone`.
    """
    if value is None:
        return ""
    raw = _PHONE_NOISE_RE.sub("", str(value).strip())
    if raw.isdigit():
        raw = f"+998{raw}" if len(raw) == 9 else f"+{raw}"
    return raw


def validate_phone(value: str) -> None:
    if value.startswith("+998"):
        if not _UZ_RE.match(value):
            raise ValidationError(
                "O'zbekiston raqami +998 dan keyin 9 ta raqamdan iborat bo'lishi kerak.",
                code="invalid_phone",
            )
    elif not _E164_RE.match(value):
        raise ValidationError(
            "Telefon raqam xalqaro formatda bo'lishi kerak, masalan +998901234567.",
            code="invalid_phone",
        )


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()
