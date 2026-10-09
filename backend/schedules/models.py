from django.conf import settings
from django.db import models
from django.db.models import F, Q

from core.models import TimeStampedModel


class LessonStatus(models.TextChoices):
    SCHEDULED = "scheduled", "Rejalashtirilgan"
    COMPLETED = "completed", "O'tilgan"
    CANCELLED = "cancelled", "Bekor qilingan"


class Lesson(TimeStampedModel):
    """A single scheduled class. ``date`` + times are local (Asia/Tashkent) wall-clock values."""

    group = models.ForeignKey("groups.Group", on_delete=models.CASCADE, related_name="lessons")
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="taught_lessons")
    room = models.ForeignKey(
        "organizations.Room", null=True, blank=True, on_delete=models.SET_NULL, related_name="lessons"
    )
    date = models.DateField("sana", db_index=True)
    start_time = models.TimeField("boshlanish")
    end_time = models.TimeField("tugash")
    topic = models.CharField("mavzu", max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=LessonStatus.choices, default=LessonStatus.SCHEDULED)
    cancel_reason = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "dars"
        verbose_name_plural = "darslar"
        ordering = ["date", "start_time", "id"]
        indexes = [
            models.Index(fields=["date", "start_time"], name="schedules_lesson_when_idx"),
            models.Index(fields=["teacher", "date"], name="schedules_lesson_teacher_idx"),
            models.Index(fields=["room", "date"], name="schedules_lesson_room_idx"),
            models.Index(fields=["group", "date"], name="schedules_lesson_group_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_time__gt=F("start_time")),
                name="schedules_lesson_times_ordered",
                violation_error_message="Dars tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak.",
            ),
            models.UniqueConstraint(
                fields=["group", "date", "start_time"],
                name="schedules_lesson_unique_slot_per_group",
                violation_error_message="Bu guruhda shu vaqtda dars mavjud.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.group.code} · {self.date:%d.%m.%Y} {self.start_time:%H:%M}"
