from django.conf import settings
from django.db import models
from django.db.models import F, Q

from core.models import TimeStampedModel


class Grade(TimeStampedModel):
    """Score for one submission. assignment/student/group are denormalised for fast reporting
    and are always copied from the submission by the grading service."""

    submission = models.OneToOneField(
        "assignments.AssignmentSubmission", on_delete=models.PROTECT, related_name="grade"
    )
    assignment = models.ForeignKey("assignments.Assignment", on_delete=models.PROTECT, related_name="grades")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="grades")
    group = models.ForeignKey("groups.Group", on_delete=models.PROTECT, related_name="grades")
    score = models.DecimalField(max_digits=6, decimal_places=2)
    max_score = models.DecimalField(max_digits=6, decimal_places=2)
    comment = models.TextField(blank=True)
    graded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="given_grades")

    class Meta:
        verbose_name = "baho"
        verbose_name_plural = "baholar"
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["student", "group"], name="grades_student_group_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(score__gte=0) & Q(score__lte=F("max_score")),
                name="grades_score_within_bounds",
                violation_error_message="Ball 0 dan maksimal ballgacha bo'lishi kerak.",
            ),
            models.CheckConstraint(condition=Q(max_score__gt=0), name="grades_max_score_positive"),
        ]

    def __str__(self) -> str:
        return f"{self.student_id}: {self.score}/{self.max_score}"

    @property
    def percent(self):
        return round(float(self.score) / float(self.max_score) * 100, 1) if self.max_score else None


class GradeChange(models.Model):
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name="changes")
    previous_score = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    new_score = models.DecimalField(max_digits=6, decimal_places=2)
    previous_comment = models.TextField(blank=True)
    new_comment = models.TextField(blank=True)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "baho o'zgarishi"
        verbose_name_plural = "baho o'zgarishlari"
        ordering = ["-changed_at", "-id"]

    def __str__(self) -> str:
        return f"{self.grade_id}: {self.previous_score} -> {self.new_score}"
