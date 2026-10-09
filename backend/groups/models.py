from decimal import ROUND_HALF_UP, Decimal

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q

from core.models import TimeStampedModel

CENT = Decimal("0.01")


class GroupStatus(models.TextChoices):
    FORMING = "forming", "Shakllanmoqda"
    ACTIVE = "active", "Faol"
    COMPLETED = "completed", "Yakunlangan"
    CANCELLED = "cancelled", "Bekor qilingan"


class Group(TimeStampedModel):
    code = models.CharField("kodi", max_length=30, unique=True)
    name = models.CharField("nomi", max_length=150)
    course = models.ForeignKey("courses.Course", on_delete=models.PROTECT, related_name="groups")
    branch = models.ForeignKey("organizations.Branch", on_delete=models.PROTECT, related_name="groups")
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="teaching_groups",
    )
    room = models.ForeignKey(
        "organizations.Room", null=True, blank=True, on_delete=models.SET_NULL, related_name="groups"
    )
    status = models.CharField(max_length=20, choices=GroupStatus.choices, default=GroupStatus.FORMING)
    start_date = models.DateField("boshlanish sanasi")
    end_date = models.DateField("tugash sanasi", null=True, blank=True)
    capacity = models.PositiveSmallIntegerField(
        "sig'im", default=20, validators=[MinValueValidator(1), MaxValueValidator(500)]
    )
    # 0 = Monday ... 6 = Sunday
    days_of_week = models.JSONField(default=list, blank=True)
    lesson_start_time = models.TimeField(null=True, blank=True)
    lesson_end_time = models.TimeField(null=True, blank=True)

    class Meta:
        verbose_name = "guruh"
        verbose_name_plural = "guruhlar"
        ordering = ["-start_date", "name"]
        indexes = [
            models.Index(fields=["branch", "status"], name="groups_group_branch_status_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(end_date__isnull=True) | Q(end_date__gte=F("start_date")),
                name="groups_group_dates_ordered",
                violation_error_message="Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas.",
            ),
            models.CheckConstraint(
                condition=Q(lesson_start_time__isnull=True)
                | Q(lesson_end_time__isnull=True)
                | Q(lesson_end_time__gt=F("lesson_start_time")),
                name="groups_group_times_ordered",
                violation_error_message="Dars tugash vaqti boshlanish vaqtidan keyin bo'lishi kerak.",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} — {self.name}"

    def save(self, *args, **kwargs):
        self.code = (self.code or "").strip().upper()
        super().save(*args, **kwargs)


class MembershipStatus(models.TextChoices):
    ACTIVE = "active", "Faol"
    FROZEN = "frozen", "Muzlatilgan"
    COMPLETED = "completed", "Bitirgan"
    LEFT = "left", "Chiqib ketgan"
    TRANSFERRED = "transferred", "Ko'chirilgan"


OPEN_MEMBERSHIP_STATUSES = (MembershipStatus.ACTIVE, MembershipStatus.FROZEN)


class DiscountType(models.TextChoices):
    NONE = "none", "Chegirmasiz"
    PERCENT = "percent", "Foiz"
    FIXED = "fixed", "Belgilangan summa"


class GroupMembership(TimeStampedModel):
    """A student's enrolment in a group (history is kept) plus its payment plan."""

    group = models.ForeignKey(Group, on_delete=models.PROTECT, related_name="memberships")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="memberships")
    status = models.CharField(
        max_length=20, choices=MembershipStatus.choices, default=MembershipStatus.ACTIVE, db_index=True
    )
    joined_at = models.DateField("qo'shilgan sana")
    left_at = models.DateField("chiqqan sana", null=True, blank=True)
    transferred_to = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="transferred_from"
    )
    monthly_fee = models.DecimalField("oylik to'lov", max_digits=12, decimal_places=2)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.NONE)
    discount_value = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    discount_reason = models.CharField(max_length=255, blank=True)
    note = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "guruh a'zoligi"
        verbose_name_plural = "guruh a'zoliklari"
        ordering = ["-joined_at", "-id"]
        indexes = [
            models.Index(fields=["student", "status"], name="groups_membership_student_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["group", "student"],
                condition=Q(status__in=["active", "frozen"]),
                name="groups_membership_one_open_per_group",
                violation_error_message="Student bu guruhda allaqachon faol a'zo.",
            ),
            models.CheckConstraint(
                condition=Q(left_at__isnull=True) | Q(left_at__gte=F("joined_at")),
                name="groups_membership_dates_ordered",
            ),
            models.CheckConstraint(condition=Q(monthly_fee__gte=0), name="groups_membership_fee_non_negative"),
            models.CheckConstraint(
                condition=Q(discount_value__gte=0)
                & (~Q(discount_type="percent") | Q(discount_value__lte=100))
                & (~Q(discount_type="fixed") | Q(discount_value__lte=F("monthly_fee"))),
                name="groups_membership_discount_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.student_id} @ {self.group_id} ({self.status})"

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_MEMBERSHIP_STATUSES

    def discount_for(self, base: Decimal) -> Decimal:
        if self.discount_type == DiscountType.PERCENT:
            value = base * self.discount_value / Decimal(100)
        elif self.discount_type == DiscountType.FIXED:
            value = self.discount_value
        else:
            value = Decimal(0)
        return min(base, max(Decimal(0), value)).quantize(CENT, rounding=ROUND_HALF_UP)

    @property
    def monthly_amount(self) -> Decimal:
        """Monthly charge after discount (single source of truth for invoices)."""
        base = self.monthly_fee.quantize(CENT, rounding=ROUND_HALF_UP)
        return (base - self.discount_for(base)).quantize(CENT, rounding=ROUND_HALF_UP)
