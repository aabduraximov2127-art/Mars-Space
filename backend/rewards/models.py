from django.conf import settings
from django.db import models
from django.db.models import Q


class RewardCategory(models.TextChoices):
    ATTENDANCE = "attendance", "Davomat"
    HOMEWORK = "homework", "Uy vazifasi"
    ACTIVITY = "activity", "Faollik"
    BEHAVIOR = "behavior", "Xulq"
    MANUAL = "manual", "Qo'lda"
    REDEEM = "redeem", "Sarflandi"
    PENALTY = "penalty", "Jarima"


class RewardTransaction(models.Model):
    """Coin ledger entry. Balance = SUM(amount); the service keeps it non-negative."""

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reward_transactions")
    amount = models.IntegerField()
    category = models.CharField(max_length=20, choices=RewardCategory.choices)
    reason = models.CharField(max_length=255)
    group = models.ForeignKey(
        "groups.Group", null=True, blank=True, on_delete=models.SET_NULL, related_name="reward_transactions"
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="given_rewards")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "coin tranzaksiyasi"
        verbose_name_plural = "coin tranzaksiyalari"
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["student", "created_at"], name="rewards_student_created_idx")]
        constraints = [
            models.CheckConstraint(condition=~Q(amount=0), name="rewards_amount_non_zero"),
        ]

    def __str__(self) -> str:
        return f"{self.student.full_name}: {self.amount:+d} coin"
