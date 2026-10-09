from django_filters import rest_framework as filters
from rest_framework import mixins, serializers, viewsets

from core.permissions import SA, RolePermission

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.full_name", read_only=True, default=None)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = (
            "id",
            "actor",
            "actor_name",
            "actor_role",
            "action",
            "entity_type",
            "entity_id",
            "entity_repr",
            "changes",
            "branch",
            "branch_name",
            "ip_address",
            "user_agent",
            "created_at",
        )
        read_only_fields = fields


class AuditFilter(filters.FilterSet):
    date_from = filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="created_at", lookup_expr="date__lte")
    hide_auth = filters.BooleanFilter(method="filter_hide_auth", label="Kirish/chiqishlarni yashirish")

    class Meta:
        model = AuditLog
        fields = ("actor", "action", "entity_type", "branch")

    def filter_hide_auth(self, queryset, name, value):
        # Successful logins/logouts are routine noise; failed logins stay visible (security-relevant).
        return queryset.exclude(action__in=("login", "logout")) if value else queryset


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only, superadmin only. There is no write or delete endpoint."""

    permission_classes = [RolePermission]
    role_permissions = {"list": (SA,), "retrieve": (SA,)}
    serializer_class = AuditLogSerializer
    filterset_class = AuditFilter
    search_fields = ("entity_repr", "action", "actor__first_name", "actor__last_name")
    ordering = ("-created_at", "-id")
    queryset = AuditLog.objects.select_related("actor", "branch")
