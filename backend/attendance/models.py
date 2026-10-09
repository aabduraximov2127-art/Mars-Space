from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AttendanceStatus(models.TextChoices):
    PRESENT = "present", "Keldi"
    ABSENT = "absent", "Kelmadi"
    LATE = "late", "Kechikdi"
    EXCUSED = "excused", "Uzrli"


class AttendanceRecord(TimeStampedModel):
    lesson = models.ForeignKey("schedules.Lesson", on_delete=models.PROTECT, related_name="attendance_records")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="attendance_records")
    status = models.CharField(max_length=10, choices=AttendanceStatus.choices)
    comment = models.CharField(max_length=255, blank=True)
    marked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "davomat yozuvi"
        verbose_name_plural = "davomat yozuvlari"
        ordering = ["lesson_id", "student_id"]
        indexes = [
            models.Index(fields=["student", "status"], name="attendance_student_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["lesson", "student"],
                name="attendance_one_record_per_lesson_student",
                violation_error_message="Bu dars uchun studentning davomati allaqachon mavjud.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student.full_name}: {self.get_status_display()} ({self.lesson})"


class AttendanceChange(models.Model):
    """Immutable edit history of an attendance record (first marking included)."""

    record = models.ForeignKey(AttendanceRecord, on_delete=models.CASCADE, related_name="changes")
    previous_status = models.CharField(max_length=10, blank=True)
    new_status = models.CharField(max_length=10, choices=AttendanceStatus.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reason = models.CharField(max_length=255, blank=True)
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "davomat o'zgarishi"
        verbose_name_plural = "davomat o'zgarishlari"
        ordering = ["-changed_at", "-id"]

    def __str__(self) -> str:
        return f"{self.record_id}: {self.previous_status or '-'} -> {self.new_status}"
