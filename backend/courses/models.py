from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from core.models import TimeStampedModel
from core.storage import UUIDUploadPath, private_storage


class Course(TimeStampedModel):
    name = models.CharField("nomi", max_length=150)
    code = models.CharField("kodi", max_length=20, unique=True)
    description = models.TextField("tavsif", blank=True)
    # NULL = global course (superadmin-managed); otherwise a branch-specific course.
    branch = models.ForeignKey(
        "organizations.Branch", null=True, blank=True, on_delete=models.PROTECT, related_name="courses"
    )
    duration_months = models.PositiveSmallIntegerField(
        "davomiyligi (oy)", validators=[MinValueValidator(1), MaxValueValidator(60)]
    )
    lessons_per_week = models.PositiveSmallIntegerField(
        default=3, validators=[MinValueValidator(1), MaxValueValidator(7)]
    )
    lesson_duration_minutes = models.PositiveSmallIntegerField(
        default=90, validators=[MinValueValidator(30), MaxValueValidator(300)]
    )
    monthly_price = models.DecimalField("oylik narx", max_digits=12, decimal_places=2)
    is_active = models.BooleanField("faol", default=True)

    class Meta:
        verbose_name = "kurs"
        verbose_name_plural = "kurslar"
        ordering = ["name"]
        constraints = [
            models.CheckConstraint(condition=Q(monthly_price__gte=0), name="courses_course_price_non_negative"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.code})"

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        super().save(*args, **kwargs)


class CourseMaterial(TimeStampedModel):
    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="materials")
    title = models.CharField("sarlavha", max_length=200)
    description = models.TextField(blank=True)
    file = models.FileField(upload_to=UUIDUploadPath("materials"), storage=private_storage, blank=True)
    file_name = models.CharField(max_length=255, blank=True)
    url = models.URLField(blank=True)
    order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "kurs materiali"
        verbose_name_plural = "kurs materiallari"
        ordering = ["course_id", "order", "id"]
        constraints = [
            models.CheckConstraint(condition=~Q(file="") | ~Q(url=""), name="courses_material_file_or_url"),
        ]

    def __str__(self) -> str:
        return self.title
