import os
import uuid

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.utils import timezone
from django.utils.deconstruct import deconstructible
from django.utils.functional import cached_property


@deconstructible
class PrivateMediaStorage(FileSystemStorage):
    """Storage outside MEDIA_ROOT.

    Files here are never exposed by the web server; they are streamed only by API views
    that have checked the caller's permissions (see :mod:`core.files`).
    """

    def __init__(self):
        super().__init__()

    @cached_property
    def base_location(self):
        return str(settings.PRIVATE_MEDIA_ROOT)

    @cached_property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):
        return ""


private_storage = PrivateMediaStorage()


@deconstructible
class UUIDUploadPath:
    """``<prefix>/<YYYY>/<MM>/<uuid4><.ext>`` — never trusts the client-supplied file name."""

    def __init__(self, prefix: str):
        self.prefix = prefix

    def __call__(self, instance, filename: str) -> str:
        ext = os.path.splitext(filename)[1].lower()[:10]
        now = timezone.now()
        return f"{self.prefix}/{now:%Y}/{now:%m}/{uuid.uuid4().hex}{ext}"

    def __eq__(self, other):
        return isinstance(other, UUIDUploadPath) and self.prefix == other.prefix

    def __hash__(self):
        return hash(self.prefix)
