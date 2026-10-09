from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone
from rest_framework import serializers, viewsets

from accounts.models import User
from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.permissions import AD, ALL_ROLES, SA, TE, RolePermission, require, role_of
from core.roles import Role
from groups.models import OPEN_MEMBERSHIP_STATUSES, Group
from notifications.services import NotificationType, notify

from .models import Announcement, AnnouncementStatus


def announcements_for(user) -> QuerySet[Announcement]:
    role = role_of(user)
    qs = Announcement.objects.select_related("author", "branch", "group")
    if role == SA:
        return qs
    if role is None:
        return qs.none()
    now = timezone.now()
    visible = qs.filter(status=AnnouncementStatus.PUBLISHED).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    visible = visible.filter(Q(branch__isnull=True) | Q(branch_id=user.branch_id))
    if role == AD:
        # Admins also see drafts of their own branch.
        return qs.filter(Q(pk__in=visible.values("pk")) | Q(branch_id=user.branch_id))
    visible = visible.filter(Q(audience_roles=[]) | Q(audience_roles__contains=[role]))
    if role == TE:
        my_groups = Group.objects.filter(teacher=user).values("pk")
    else:
        my_groups = user.memberships.filter(status__in=OPEN_MEMBERSHIP_STATUSES).values("group_id")
    return visible.filter(Q(group__isnull=True) | Q(group__in=my_groups))


def audience(a: Announcement) -> QuerySet[User]:
    qs = User.objects.filter(is_active=True)
    if a.branch_id:
        qs = qs.filter(Q(branch_id=a.branch_id) | Q(role=Role.SUPERADMIN))
    if a.audience_roles:
        qs = qs.filter(role__in=a.audience_roles)
    if a.group_id:
        qs = qs.filter(
            Q(memberships__group_id=a.group_id, memberships__status__in=OPEN_MEMBERSHIP_STATUSES)
            | Q(teaching_groups__id=a.group_id)
        )
    return qs.exclude(pk=a.author_id).distinct()


class AnnouncementSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    group_name = serializers.CharField(source="group.name", read_only=True, default=None)
    audience_roles = serializers.ListField(
        child=serializers.ChoiceField(choices=Role.choices), required=False, allow_empty=True
    )

    class Meta:
        model = Announcement
        fields = (
            "id",
            "title",
            "body",
            "author",
            "author_name",
            "branch",
            "branch_name",
            "group",
            "group_name",
            "audience_roles",
            "is_pinned",
            "status",
            "published_at",
            "expires_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "author",
            "author_name",
            "branch_name",
            "group_name",
            "published_at",
            "created_at",
            "updated_at",
        )


class AnnouncementViewSet(viewsets.ModelViewSet):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "create": (SA, AD),
        "partial_update": (SA, AD),
        "destroy": (SA, AD),
    }
    http_method_names = ["get", "post", "patch", "delete", "head"]
    serializer_class = AnnouncementSerializer
    filterset_fields = ("status", "branch", "group", "is_pinned")
    search_fields = ("title", "body")
    ordering = ("-is_pinned", "-published_at", "-id")

    def get_queryset(self):
        qs = announcements_for(self.request.user)
        if self.request.query_params.get("pinned") in ("1", "true"):
            qs = qs.filter(is_pinned=True)
        return qs

    def _check_scope(self, data, instance=None):
        user = self.request.user
        branch = data.get("branch", getattr(instance, "branch", None))
        group = data.get("group", getattr(instance, "group", None))
        if user.role == AD:
            branch = user.branch
            if group is not None and group.branch_id != user.branch_id:
                raise BusinessRuleError("Guruh boshqa filialga tegishli.", code="invalid_group")
        if group is not None and branch is not None and group.branch_id != branch.pk:
            raise BusinessRuleError("Guruh tanlangan filialga tegishli emas.", code="invalid_group")
        if group is not None and branch is None:
            branch = group.branch
        return branch

    def _publish_side_effects(self, a: Announcement):
        notify(
            audience(a),
            NotificationType.ANNOUNCEMENT,
            a.title,
            a.body[:300],
            link=f"/announcements/{a.pk}",
            data={"announcement_id": a.pk},
        )

    @transaction.atomic
    def perform_create(self, serializer):
        branch = self._check_scope(serializer.validated_data)
        status = serializer.validated_data.get("status", AnnouncementStatus.DRAFT)
        a = serializer.save(
            author=self.request.user,
            branch=branch,
            published_at=timezone.now() if status == AnnouncementStatus.PUBLISHED else None,
        )
        audit("create", actor=self.request.user, obj=a, request=self.request)
        if a.status == AnnouncementStatus.PUBLISHED:
            self._publish_side_effects(a)

    @transaction.atomic
    def perform_update(self, serializer):
        user = self.request.user
        a = serializer.instance
        require(user.role == SA or a.branch_id == user.branch_id, "Bu e'lonni o'zgartirishga ruxsat yo'q.")
        was_published = a.status == AnnouncementStatus.PUBLISHED
        branch = self._check_scope(serializer.validated_data, a)
        extra = {"branch": branch}
        if not was_published and serializer.validated_data.get("status") == AnnouncementStatus.PUBLISHED:
            extra["published_at"] = timezone.now()
        a = serializer.save(**extra)
        audit("update", actor=user, obj=a, request=self.request)
        if not was_published and a.status == AnnouncementStatus.PUBLISHED:
            self._publish_side_effects(a)

    def perform_destroy(self, instance):
        user = self.request.user
        require(user.role == SA or instance.branch_id == user.branch_id, "Bu e'lonni o'chirishga ruxsat yo'q.")
        audit("delete", actor=user, obj=instance, request=self.request)
        instance.delete()
