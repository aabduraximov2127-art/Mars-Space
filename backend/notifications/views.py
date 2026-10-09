from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import ALL_ROLES, RolePermission

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "type", "title", "body", "link", "data", "is_read", "read_at", "created_at")
        read_only_fields = fields


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """Only the caller's own notifications."""

    permission_classes = [RolePermission]
    role_permissions = {"list": ALL_ROLES, "unread_count": ALL_ROLES, "read": ALL_ROLES, "read_all": ALL_ROLES}
    serializer_class = NotificationSerializer
    filterset_fields = ("is_read", "type")
    ordering = ("-created_at", "-id")

    def get_queryset(self):
        user = self.request.user
        if not getattr(user, "is_authenticated", False):
            return Notification.objects.none()
        return Notification.objects.filter(recipient=user)

    @extend_schema(responses={200: OpenApiResponse(description="{count}")})
    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(is_read=False).count()})

    @extend_schema(request=None, responses={200: NotificationSerializer})
    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        n = self.get_object()
        if not n.is_read:
            n.is_read, n.read_at = True, timezone.now()
            n.save(update_fields=["is_read", "read_at"])
        return Response(NotificationSerializer(n).data)

    @extend_schema(request=None, responses={200: OpenApiResponse(description="{updated}")})
    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        updated = self.get_queryset().filter(is_read=False).update(is_read=True, read_at=timezone.now())
        return Response({"updated": updated})
