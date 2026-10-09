"""Settings overrides for the automated test-suite."""

import tempfile
from pathlib import Path

from .settings import *  # noqa: F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # fast, tests only
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

_tmp = Path(tempfile.gettempdir()) / "educentr-tests"
MEDIA_ROOT = str(_tmp / "media")
PRIVATE_MEDIA_ROOT = str(_tmp / "private_media")

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
SECURE_SSL_REDIRECT = False
REFRESH_COOKIE_SECURE = False

# Generous defaults so unrelated tests are never throttled; throttle tests override these.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_THROTTLE_RATES": {
        "login": "1000/min",
        "password_reset": "1000/min",
        "chat_message": "1000/min",
    },
}
