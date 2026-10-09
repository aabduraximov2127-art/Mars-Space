"""Upload validation and permission-checked downloads."""

import os

from django.http import FileResponse, Http404
from rest_framework.exceptions import ValidationError

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def _settings():
    from organizations.models import SystemSettings

    return SystemSettings.load()


def validate_upload(uploaded_file, *, field: str = "file") -> None:
    """Reject files whose extension is not whitelisted or which exceed the configured size."""
    if uploaded_file is None:
        return
    conf = _settings()
    ext = os.path.splitext(uploaded_file.name or "")[1].lower().lstrip(".")
    allowed = conf.allowed_extensions()
    if not ext or ext not in allowed:
        raise ValidationError(
            {field: [f"Ruxsat etilmagan fayl turi. Ruxsat etilganlar: {', '.join(sorted(allowed))}."]}
        )
    max_bytes = conf.max_upload_mb * 1024 * 1024
    if uploaded_file.size > max_bytes:
        raise ValidationError({field: [f"Fayl hajmi {conf.max_upload_mb} MB dan oshmasligi kerak."]})


def validate_avatar(uploaded_file, *, max_bytes: int) -> None:
    if uploaded_file is None:
        return
    ext = os.path.splitext(uploaded_file.name or "")[1].lower()
    if ext not in IMAGE_EXTENSIONS:
        raise ValidationError({"avatar": ["Faqat JPG, PNG yoki WEBP rasm yuklash mumkin."]})
    if uploaded_file.size > max_bytes:
        raise ValidationError({"avatar": [f"Rasm hajmi {max_bytes // (1024 * 1024)} MB dan oshmasligi kerak."]})


def safe_download_name(name: str, fallback: str = "file") -> str:
    base = os.path.basename(name or "").replace("\r", "").replace("\n", "").replace('"', "")
    return base or fallback


def protected_file_response(field_file, download_name: str | None = None) -> FileResponse:
    """Stream a private file as an attachment (never rendered inline by the browser)."""
    if not field_file:
        raise Http404("Fayl topilmadi.")
    try:
        handle = field_file.open("rb")
    except FileNotFoundError as exc:
        raise Http404("Fayl topilmadi.") from exc
    name = safe_download_name(download_name or os.path.basename(field_file.name))
    response = FileResponse(handle, as_attachment=True, filename=name)
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response
