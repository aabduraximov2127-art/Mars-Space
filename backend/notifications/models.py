from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    ASSIGNMENT_NEW = "assignment_new", "Yangi vazifa"
    ASSIGNMENT_GRADED = "assignment_graded", "Vazifa baholandi"
    REVISION_REQUESTED = "revision_requested", "Qayta ishlash so'raldi"
    SUBMISSION_NEW = "submission_new", "Yangi topshiriq"
    SCHEDULE_CHANGED = "schedule_changed", "Jadval o'zgardi"
    PAYMENT_REMINDER = "payment_reminder", "To'lov eslatmasi"
    PAYMENT_RECEIVED = "payment_received", "To'lov qabul qilindi"
    ANNOUNCEMENT = "announcement", "E'lon"
    REWARD = "reward", "Mukofot"
    SYSTEM = "system", "Tizim"


class Notification(models.Model):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    type = models.CharField(max_length=30, choices=NotificationType.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=255, blank=True)
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "bildirishnoma"
        verbose_name_plural = "bildirishnomalar"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["recipient", "is_read", "created_at"], name="notif_recipient_read_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.recipient_id}: {self.title}"
