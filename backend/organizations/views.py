from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.permissions import AD, ALL_ROLES, SA, TE, RolePermission, require, role_of

from .models import Branch, Room, SystemSettings
from .selectors import branches_for, rooms_for, with_branch_stats
from .serializers import BranchSerializer, PublicSettingsSerializer, RoomSerializer, SystemSettingsSerializer

BRANCH_FIELDS = ("name", "code", "address", "phone", "is_active")
ROOM_FIELDS = ("name", "capacity", "is_active", "branch")


def _snapshot(obj, fields):
    return {f: getattr(obj, f"{f}_id" if f == "branch" else f) for f in fields}


class BranchViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Branches are archived (``is_active=false``), never deleted."""

    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "create": (SA,),
        "partial_update": (SA,),
    }
    http_method_names = ["get", "post", "patch", "head"]
    serializer_class = BranchSerializer
    filterset_fields = ("is_active",)
    search_fields = ("name", "code", "address")
    ordering_fields = ("name", "code", "created_at")
    ordering = ("name",)

    def get_queryset(self):
        qs = branches_for(self.request.user)
        if role_of(self.request.user) == SA:
            qs = with_branch_stats(qs)
        return qs

    def perform_create(self, serializer):
        branch = serializer.save()
        audit(
            "create",
            actor=self.request.user,
            obj=branch,
            changes=_snapshot(branch, BRANCH_FIELDS),
            request=self.request,
        )

    def perform_update(self, serializer):
        before = _snapshot(serializer.instance, BRANCH_FIELDS)
        branch = serializer.save()
        after = _snapshot(branch, BRANCH_FIELDS)
        changes = {k: [before[k], after[k]] for k in BRANCH_FIELDS if before[k] != after[k]}
        if changes:
            audit("update", actor=self.request.user, obj=branch, changes=changes, request=self.request)


class RoomViewSet(viewsets.ModelViewSet):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": (SA, AD, TE),
        "retrieve": (SA, AD, TE),
        "create": (SA, AD),
        "partial_update": (SA, AD),
        "destroy": (SA, AD),
    }
    http_method_names = ["get", "post", "patch", "delete", "head"]
    serializer_class = RoomSerializer
    filterset_fields = ("branch", "is_active")
    search_fields = ("name",)
    ordering_fields = ("name", "capacity", "branch")
    ordering = ("branch__name", "name")

    def get_queryset(self):
        return rooms_for(self.request.user)

    def _resolve_branch(self, serializer) -> Branch:
        user = self.request.user
        if user.role == AD:
            return user.branch  # admins always work inside their own branch
        branch = serializer.validated_data.get("branch") or getattr(serializer.instance, "branch", None)
        if branch is None:
            raise BusinessRuleError("Filial majburiy.", code="branch_required")
        return branch

    def _check_unique(self, branch: Branch, name: str, exclude_pk=None) -> None:
        qs = Room.objects.filter(branch=branch, name__iexact=name)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if qs.exists():
            raise ValidationError({"name": ["Bu filialda shu nomli xona mavjud."]})

    @transaction.atomic
    def perform_create(self, serializer):
        branch = self._resolve_branch(serializer)
        require(branch.is_active, "Faol bo'lmagan filialga xona qo'shib bo'lmaydi.")
        self._check_unique(branch, serializer.validated_data["name"])
        room = serializer.save(branch=branch)
        audit("create", actor=self.request.user, obj=room, branch=branch, request=self.request)

    @transaction.atomic
    def perform_update(self, serializer):
        room = serializer.instance
        before = _snapshot(room, ROOM_FIELDS)
        branch = self._resolve_branch(serializer)
        if branch.pk != room.branch_id and room.lessons.exists():
            raise BusinessRuleError(
                "Darslarda ishlatilgan xonani boshqa filialga o'tkazib bo'lmaydi.", code="room_in_use"
            )
        name = serializer.validated_data.get("name", room.name)
        self._check_unique(branch, name, exclude_pk=room.pk)
        room = serializer.save(branch=branch)
        after = _snapshot(room, ROOM_FIELDS)
        changes = {k: [before[k], after[k]] for k in ROOM_FIELDS if before[k] != after[k]}
        if changes:
            audit("update", actor=self.request.user, obj=room, changes=changes, request=self.request)

    def destroy(self, request, *args, **kwargs):
        room = self.get_object()
        if room.lessons.exists() or room.groups.exists():
            raise BusinessRuleError(
                "Xona darslar yoki guruhlarda ishlatilgan. O'chirish o'rniga uni nofaol qiling.", code="room_in_use"
            )
        audit("delete", actor=request.user, obj=room, request=request)
        room.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SystemSettingsView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"get": (SA, AD), "patch": (SA,)}

    @extend_schema(responses={200: SystemSettingsSerializer}, tags=["settings"])
    def get(self, request):
        return Response(SystemSettingsSerializer(SystemSettings.load()).data)

    @extend_schema(request=SystemSettingsSerializer, responses={200: SystemSettingsSerializer}, tags=["settings"])
    @transaction.atomic
    def patch(self, request):
        conf = SystemSettings.objects.select_for_update().get(pk=SystemSettings.load().pk)
        fields = [
            f for f in SystemSettingsSerializer.Meta.fields if f not in SystemSettingsSerializer.Meta.read_only_fields
        ]
        before = {f: getattr(conf, f) for f in fields}
        serializer = SystemSettingsSerializer(conf, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        conf = serializer.save(updated_by=request.user)
        changes = {f: [before[f], getattr(conf, f)] for f in fields if before[f] != getattr(conf, f)}
        if changes:
            audit("settings_update", actor=request.user, obj=conf, changes=changes, branch=None, request=request)
        return Response(SystemSettingsSerializer(conf).data)


class PublicSettingsView(APIView):
    permission_classes = [RolePermission]
    role_permissions = {"get": ALL_ROLES}

    @extend_schema(responses={200: PublicSettingsSerializer}, tags=["settings"])
    def get(self, request):
        return Response(PublicSettingsSerializer(SystemSettings.load()).data)
