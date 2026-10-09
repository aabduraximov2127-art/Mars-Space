import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q

from core.models import TimeStampedModel


class InvoiceStatus(models.TextChoices):
    OPEN = "open", "Ochiq"
    CANCELLED = "cancelled", "Bekor qilingan"


class Invoice(TimeStampedModel):
    """Monthly charge for one membership. Paid/partial/unpaid is derived (FIFO), not stored."""

    membership = models.ForeignKey("groups.GroupMembership", on_delete=models.PROTECT, related_name="invoices")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="invoices")
    group = models.ForeignKey("groups.Group", on_delete=models.PROTECT, related_name="invoices")
    period = models.DateField("davr (oyning 1-kuni)", db_index=True)
    base_amount = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField("to'lov muddati")
    status = models.CharField(max_length=10, choices=InvoiceStatus.choices, default=InvoiceStatus.OPEN)
    cancel_reason = models.CharField(max_length=255, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        verbose_name = "hisob"
        verbose_name_plural = "hisoblar"
        ordering = ["-period", "-id"]
        indexes = [
            models.Index(fields=["student", "status"], name="payments_invoice_student_idx"),
            models.Index(fields=["group", "period"], name="payments_invoice_group_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["membership", "period"],
                name="payments_invoice_one_per_membership_period",
                violation_error_message="Bu oy uchun hisob allaqachon yaratilgan.",
            ),
            models.CheckConstraint(
                condition=Q(base_amount__gte=0) & Q(discount_amount__gte=0) & Q(amount__gte=0),
                name="payments_invoice_amounts_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(amount=F("base_amount") - F("discount_amount")),
                name="payments_invoice_amount_consistent",
            ),
        ]

    def __str__(self) -> str:
        return f"Invoice {self.id} {self.period:%Y-%m} {self.amount}"


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Naqd"
    CARD = "card", "Karta"
    TRANSFER = "transfer", "Bank o'tkazmasi"
    CLICK = "click", "Click (qo'lda qayd)"
    PAYME = "payme", "Payme (qo'lda qayd)"
    OTHER = "other", "Boshqa"


class PaymentStatus(models.TextChoices):
    COMPLETED = "completed", "Qabul qilingan"
    VOIDED = "voided", "Bekor qilingan"


class Payment(TimeStampedModel):
    """Money received for a membership. Never deleted — only voided (with audit trail)."""

    membership = models.ForeignKey("groups.GroupMembership", on_delete=models.PROTECT, related_name="payments")
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    status = models.CharField(
        max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.COMPLETED, db_index=True
    )
    paid_at = models.DateTimeField("to'langan vaqt", db_index=True)
    idempotency_key = models.UUIDField(unique=True, default=uuid.uuid4, editable=False)
    note = models.CharField(max_length=255, blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="received_payments"
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    void_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = "to'lov"
        verbose_name_plural = "to'lovlar"
        ordering = ["-paid_at", "-id"]
        indexes = [
            models.Index(fields=["student", "status"], name="payments_payment_student_idx"),
            models.Index(fields=["membership", "status"], name="payments_payment_member_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="payments_payment_amount_positive"),
            models.CheckConstraint(
                condition=Q(status="completed") | Q(voided_at__isnull=False),
                name="payments_payment_void_has_timestamp",
            ),
        ]

    def __str__(self) -> str:
        return f"Payment {self.receipt_number} {self.amount}"

    @property
    def receipt_number(self) -> str:
        return f"{self.pk:06d}" if self.pk else ""
