from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator, RegexValidator
from django.db import models

from core.models import TimeStampedModel
from core.validators import normalize_phone, validate_phone

DEFAULT_UPLOAD_EXTENSIONS = "pdf,doc,docx,txt,zip,rar,7z,png,jpg,jpeg,py,js,ts,html,css,json,ipynb,pptx,xlsx"


class Branch(TimeStampedModel):
    name = models.CharField("nomi", max_length=150, unique=True)
    code = models.CharField(
        "kodi",
        max_length=20,
        unique=True,
        validators=[RegexValidator(r"^[A-Z0-9-]{2,20}$", "Kod 2-20 ta katta lotin harfi, raqam yoki '-' bo'lsin.")],
    )
    address = models.CharField("manzil", max_length=255, blank=True)
    phone = models.CharField("telefon", max_length=16, blank=True, validators=[validate_phone])
    is_active = models.BooleanField("faol", default=True)

    class Meta:
        verbose_name = "filial"
        verbose_name_plural = "filiallar"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        if self.phone:
            self.phone = normalize_phone(self.phone)
        super().save(*args, **kwargs)


class Room(TimeStampedModel):
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="rooms")
    name = models.CharField("nomi", max_length=100)
    capacity = models.PositiveSmallIntegerField("sig'imi", null=True, blank=True)
    is_active = models.BooleanField("faol", default=True)

    class Meta:
        verbose_name = "xona"
        verbose_name_plural = "xonalar"
        ordering = ["branch_id", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["branch", "name"],
                name="organizations_room_unique_name_per_branch",
                violation_error_message="Bu filialda shu nomli xona mavjud.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.branch_id})"


class AttendanceExcusedPolicy(models.TextChoices):
    EXCLUDE = "exclude", "Hisobdan chiqariladi"
    PRESENT = "present", "Keldi deb hisoblanadi"
    ABSENT = "absent", "Kelmadi deb hisoblanadi"


class SystemSettings(models.Model):
    """Global, superadmin-managed configuration (singleton row ``pk=1``)."""

    SINGLETON_PK = 1

    center_name = models.CharField(max_length=150, default="EduCentr")
    currency = models.CharField(max_length=3, default="UZS")
    attendance_excused_policy = models.CharField(
        max_length=10, choices=AttendanceExcusedPolicy.choices, default=AttendanceExcusedPolicy.EXCLUDE
    )
    attendance_late_counts_present = models.BooleanField(default=True)
    attendance_edit_window_hours = models.PositiveSmallIntegerField(
        default=48, validators=[MinValueValidator(1), MaxValueValidator(720)]
    )
    max_upload_mb = models.PositiveSmallIntegerField(
        default=10, validators=[MinValueValidator(1), MaxValueValidator(50)]
    )
    allowed_upload_extensions = models.CharField(max_length=500, default=DEFAULT_UPLOAD_EXTENSIONS)
    invoice_due_day = models.PositiveSmallIntegerField(
        default=10, validators=[MinValueValidator(1), MaxValueValidator(28)]
    )
    payment_void_window_hours = models.PositiveSmallIntegerField(
        default=24, validators=[MinValueValidator(0), MaxValueValidator(720)]
    )
    teacher_reward_limit = models.PositiveSmallIntegerField(
        default=50, validators=[MinValueValidator(1), MaxValueValidator(1000)]
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "tizim sozlamalari"
        verbose_name_plural = "tizim sozlamalari"
        constraints = [
            models.CheckConstraint(condition=models.Q(pk=1), name="organizations_settings_singleton"),
        ]

    def __str__(self) -> str:
        return "Tizim sozlamalari"

    def save(self, *args, **kwargs):
        self.pk = self.SINGLETON_PK
        self.allowed_upload_extensions = ",".join(sorted(self.allowed_extensions()))
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):  # pragma: no cover — singleton is never deleted
        raise RuntimeError("SystemSettings cannot be deleted.")

    @classmethod
    def load(cls) -> "SystemSettings":
        obj, _ = cls.objects.get_or_create(pk=cls.SINGLETON_PK)
        return obj

    def allowed_extensions(self) -> set[str]:
        return {
            ext.strip().lower().lstrip(".") for ext in (self.allowed_upload_extensions or "").split(",") if ext.strip()
        }
