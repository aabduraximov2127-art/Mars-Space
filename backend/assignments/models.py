from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from core.models import TimeStampedModel
from core.storage import UUIDUploadPath, private_storage


class AssignmentStatus(models.TextChoices):
    DRAFT = "draft", "Qoralama"
    PUBLISHED = "published", "E'lon qilingan"
    CLOSED = "closed", "Yopilgan"


class Assignment(TimeStampedModel):
    group = models.ForeignKey("groups.Group", on_delete=models.PROTECT, related_name="assignments")
    lesson = models.ForeignKey(
        "schedules.Lesson", null=True, blank=True, on_delete=models.SET_NULL, related_name="assignments"
    )
    title = models.CharField("sarlavha", max_length=200)
    description = models.TextField("tavsif")
    grading_criteria = models.TextField("baholash mezoni", blank=True)
    max_score = models.PositiveSmallIntegerField(
        default=100, validators=[MinValueValidator(1), MaxValueValidator(1000)]
    )
    due_at = models.DateTimeField("muddat")
    allow_late = models.BooleanField("kechikib topshirishga ruxsat", default=True)
    attachment = models.FileField(upload_to=UUIDUploadPath("assignments"), storage=private_storage, blank=True)
    attachment_name = models.CharField(max_length=255, blank=True)
    link = models.URLField(blank=True)
    status = models.CharField(max_length=10, choices=AssignmentStatus.choices, default=AssignmentStatus.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_assignments"
    )

    class Meta:
        verbose_name = "vazifa"
        verbose_name_plural = "vazifalar"
        ordering = ["-due_at", "-id"]
        indexes = [
            models.Index(fields=["group", "status", "due_at"], name="assignments_group_status_idx"),
        ]

    def __str__(self) -> str:
        return self.title


class SubmissionStatus(models.TextChoices):
    SUBMITTED = "submitted", "Topshirilgan"
    UNDER_REVIEW = "under_review", "Tekshirilmoqda"
    NEEDS_REVISION = "needs_revision", "Qayta ishlash kerak"
    GRADED = "graded", "Baholangan"


# Pseudo-status used by API responses for students without a submission row.
NOT_SUBMITTED = "not_submitted"


class AssignmentSubmission(TimeStampedModel):
    """Current state of one student's work on one assignment; history lives in revisions."""

    assignment = models.ForeignKey(Assignment, on_delete=models.PROTECT, related_name="submissions")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="submissions")
    status = models.CharField(
        max_length=20, choices=SubmissionStatus.choices, default=SubmissionStatus.SUBMITTED, db_index=True
    )
    revision_count = models.PositiveSmallIntegerField(default=0)
    last_submitted_at = models.DateTimeField()
    is_late = models.BooleanField(default=False)
    feedback = models.TextField("ustoz izohi", blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "topshiriq"
        verbose_name_plural = "topshiriqlar"
        ordering = ["-last_submitted_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "student"],
                name="assignments_one_submission_per_student",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.assignment_id}/{self.student_id}: {self.status}"


class SubmissionRevision(models.Model):
    submission = models.ForeignKey(AssignmentSubmission, on_delete=models.CASCADE, related_name="revisions")
    number = models.PositiveSmallIntegerField()
    text = models.TextField(max_length=10000, blank=True)
    file = models.FileField(upload_to=UUIDUploadPath("submissions"), storage=private_storage, blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    link = models.URLField(blank=True)
    is_late = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "topshiriq versiyasi"
        verbose_name_plural = "topshiriq versiyalari"
        ordering = ["submission_id", "-number"]
        constraints = [
            models.UniqueConstraint(fields=["submission", "number"], name="assignments_revision_unique_number"),
            models.CheckConstraint(
                condition=~Q(text="") | ~Q(file="") | ~Q(link=""),
                name="assignments_revision_has_content",
                violation_error_message="Matn, fayl yoki havoladan kamida bittasi bo'lishi kerak.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.submission_id} v{self.number}"
