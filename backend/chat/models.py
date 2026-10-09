from django.conf import settings
from django.db import models
from django.db.models import Q


class RoomKind(models.TextChoices):
    GROUP = "group", "Guruh"
    DIRECT = "direct", "Shaxsiy"


class ChatRoom(models.Model):
    kind = models.CharField(max_length=10, choices=RoomKind.choices)
    group = models.OneToOneField(
        "groups.Group", null=True, blank=True, on_delete=models.CASCADE, related_name="chat_room"
    )
    # "<min_user_id>:<max_user_id>" — one direct room per pair of users.
    direct_key = models.CharField(max_length=50, null=True, blank=True, unique=True)
    name = models.CharField(max_length=150, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "chat xonasi"
        verbose_name_plural = "chat xonalari"
        ordering = ["-last_message_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(kind="group") & Q(group__isnull=False) & Q(direct_key__isnull=True))
                | (Q(kind="direct") & Q(direct_key__isnull=False) & Q(group__isnull=True)),
                name="chat_room_kind_consistent",
            ),
        ]

    def __str__(self) -> str:
        return self.name or f"{self.kind} #{self.pk}"

    @staticmethod
    def make_direct_key(user_a_id: int, user_b_id: int) -> str:
        low, high = sorted((int(user_a_id), int(user_b_id)))
        return f"{low}:{high}"


class ChatMembership(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="chat_memberships")
    last_read_at = models.DateTimeField(null=True, blank=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "chat a'zoligi"
        verbose_name_plural = "chat a'zoliklari"
        constraints = [
            models.UniqueConstraint(fields=["room", "user"], name="chat_membership_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id} in {self.room_id}"


MESSAGE_MAX_LENGTH = 2000


class ChatMessage(models.Model):
    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="chat_messages")
    body = models.TextField(max_length=MESSAGE_MAX_LENGTH)
    is_deleted = models.BooleanField(default=False)
    edited_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "xabar"
        verbose_name_plural = "xabarlar"
        ordering = ["id"]
        indexes = [models.Index(fields=["room", "id"], name="chat_message_room_idx")]

    def __str__(self) -> str:
        return f"Xabar #{self.pk} ({self.room})"
