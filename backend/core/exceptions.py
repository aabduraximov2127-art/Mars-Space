"""Uniform API error format: ``{"detail": str, "code": str, "errors"?: {...}, ...extra}``."""

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models import ProtectedError, RestrictedError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.serializers import as_serializer_error
from rest_framework.views import exception_handler, set_rollback


class BusinessRuleError(exceptions.APIException):
    """A request that is well-formed but violates a domain rule (HTTP 400)."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Amalni bajarib bo'lmaydi."
    default_code = "business_rule"

    def __init__(self, detail=None, code=None, extra: dict | None = None):
        super().__init__(detail, code)
        self.extra = extra or {}


class ConflictError(BusinessRuleError):
    """Duplicate / overlapping data (HTTP 409)."""

    status_code = status.HTTP_409_CONFLICT
    default_detail = "Ma'lumotlar ziddiyati."
    default_code = "conflict"


_UZ_MESSAGES = {
    "not_authenticated": "Tizimga kirish talab qilinadi.",
    "authentication_failed": "Autentifikatsiya muvaffaqiyatsiz.",
    "token_not_valid": "Sessiya muddati tugagan. Qaytadan kiring.",
    "user_inactive": "Akkaunt bloklangan.",
    "user_not_found": "Foydalanuvchi topilmadi.",
    "permission_denied": "Bu amal uchun ruxsat yo'q.",
    "not_found": "Topilmadi.",
    "method_not_allowed": "Bu so'rov metodiga ruxsat yo'q.",
    "parse_error": "So'rov formati noto'g'ri.",
    "unsupported_media_type": "So'rov turi qo'llab-quvvatlanmaydi.",
    "not_acceptable": "Javob formati qo'llab-quvvatlanmaydi.",
}
# simplejwt raises these with English text that callers never customise.
_ALWAYS_TRANSLATE = {"token_not_valid", "user_inactive", "user_not_found", "authentication_failed"}


def _first_message(errors):
    if isinstance(errors, dict):
        for value in errors.values():
            msg = _first_message(value)
            if msg:
                return msg
    elif isinstance(errors, (list, tuple)):
        for value in errors:
            msg = _first_message(value)
            if msg:
                return msg
    elif errors:
        return str(errors)
    return None


def _code_of(exc, data) -> str:
    if isinstance(data, dict) and isinstance(data.get("code"), str):
        return data["code"]
    codes = exc.get_codes() if hasattr(exc, "get_codes") else None
    if isinstance(codes, str):
        return codes
    if isinstance(codes, dict) and isinstance(codes.get("detail"), str):
        return codes["detail"]
    return getattr(exc, "default_code", "error")


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(detail=as_serializer_error(exc))
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()

    if isinstance(exc, (ProtectedError, RestrictedError)):
        set_rollback()
        return Response(
            {
                "detail": "Bu yozuv boshqa ma'lumotlarga bog'langan, uni o'chirib bo'lmaydi.",
                "code": "protected",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if isinstance(exc, IntegrityError):
        set_rollback()
        return Response(
            {"detail": "Ma'lumotlar ziddiyati: bunday yozuv allaqachon mavjud.", "code": "integrity_error"},
            status=status.HTTP_409_CONFLICT,
        )

    response = exception_handler(exc, context)
    if response is None:
        return None

    data = response.data
    if isinstance(exc, exceptions.ValidationError):
        errors = data if isinstance(data, dict) else {"non_field_errors": data}
        response.data = {
            "detail": _first_message(errors) or "Ma'lumotlar noto'g'ri.",
            "code": "validation_error",
            "errors": errors,
        }
        return response

    code = _code_of(exc, data)
    detail = data.get("detail") if isinstance(data, dict) else _first_message(data)
    detail = str(detail) if detail is not None else ""
    default_detail = str(getattr(type(exc), "default_detail", ""))
    if code in _UZ_MESSAGES and (code in _ALWAYS_TRANSLATE or not detail or detail == default_detail):
        detail = _UZ_MESSAGES[code]
    if isinstance(exc, exceptions.Throttled):
        wait = int(exc.wait) if exc.wait else None
        detail = (
            f"Juda ko'p so'rov yuborildi. {wait} soniyadan so'ng qayta urinib ko'ring."
            if wait
            else "Juda ko'p so'rov yuborildi. Birozdan so'ng qayta urinib ko'ring."
        )
        response.data = {"detail": detail, "code": "throttled", "retry_after": wait}
        return response

    payload = {"detail": detail, "code": code}
    if isinstance(data, dict):
        payload.update({k: v for k, v in data.items() if k not in ("detail", "code", "messages")})
    payload.update(getattr(exc, "extra", {}) or {})
    response.data = payload
    return response
