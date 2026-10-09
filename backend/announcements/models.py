from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AnnouncementStatus(models.TextChoices):
    DRAFT = "draft", "Qoralama"
    PUBLISHED = "published", "E'lon qilingan"


class Announcement(TimeStampedModel):
    """Audience = branch (NULL: all branches) ∩ group (NULL: all groups) ∩ roles ([]: all roles)."""

    title = models.CharField(max_length=200)
    body = models.TextField(max_length=5000)  # plain text, never rendered as HTML
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="announcements")
    branch = models.ForeignKey(
        "organizations.Branch", null=True, blank=True, on_delete=models.PROTECT, related_name="announcements"
    )
    group = models.ForeignKey(
        "groups.Group", null=True, blank=True, on_delete=models.PROTECT, related_name="announcements"
    )
    audience_roles = models.JSONField(default=list, blank=True)
    is_pinned = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=AnnouncementStatus.choices, default=AnnouncementStatus.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "e'lon"
        verbose_name_plural = "e'lonlar"
        ordering = ["-is_pinned", "-published_at", "-id"]
        indexes = [
            models.Index(fields=["status", "published_at"], name="announce_status_pub_idx"),
        ]

    def __str__(self) -> str:
        return self.title
