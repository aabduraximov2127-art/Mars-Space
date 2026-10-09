from django.db.models import Exists, OuterRef
from django_filters import rest_framework as filters
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.permissions import AD, ALL_ROLES, SA, TE, RolePermission, require, role_of
from groups.selectors import can_manage_group, groups_for

from . import services
from .models import Lesson
from .selectors import can_teach_lesson, lessons_for
from .serializers import CancelSerializer, LessonCreateSerializer, LessonSerializer, LessonUpdateSerializer

TEACHER_EDITABLE = {"topic", "notes"}


class LessonFilter(filters.FilterSet):
    date_from = filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="date", lookup_expr="lte")
    branch = filters.NumberFilter(field_name="group__branch_id")
    course = filters.NumberFilter(field_name="group__course_id")

    class Meta:
        model = Lesson
        fields = ("group", "teacher", "room", "status", "date")


def annotate_marked(qs):
    from attendance.models import AttendanceRecord

    return qs.annotate(attendance_marked=Exists(AttendanceRecord.objects.filter(lesson=OuterRef("pk"))))


class LessonViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "create": (SA, AD),
        "partial_update": (SA, AD, TE),
        "destroy": (SA, AD),
        "cancel": (SA, AD),
    }
    http_method_names = ["get", "post", "patch", "delete", "head"]
    serializer_class = LessonSerializer
    filterset_class = LessonFilter
    search_fields = ("topic", "group__name", "group__code")
    ordering_fields = ("date", "start_time", "created_at")
    ordering = ("date", "start_time", "id")

    def get_queryset(self):
        return annotate_marked(lessons_for(self.request.user))

    def _out(self, lesson, code=status.HTTP_200_OK):
        return Response(LessonSerializer(self.get_queryset().get(pk=lesson.pk)).data, status=code)

    @extend_schema(request=LessonCreateSerializer, responses={201: LessonSerializer})
    def create(self, request, *args, **kwargs):
        serializer = LessonCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        group = data.pop("group")
        if not groups_for(request.user).filter(pk=group.pk).exists():
            raise ValidationError({"group": ["Guruh topilmadi."]})
        require(can_manage_group(request.user, group))
        lesson = services.create_lesson(request.user, group=group, request=request, **data)
        return self._out(lesson, status.HTTP_201_CREATED)

    @extend_schema(request=LessonUpdateSerializer, responses={200: LessonSerializer})
    def partial_update(self, request, *args, **kwargs):
        lesson = self.get_object()
        serializer = LessonUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if role_of(request.user) == TE:
            require(can_teach_lesson(request.user, lesson), "Faqat o'z darsingizni o'zgartira olasiz.")
            require(set(data) <= TEACHER_EDITABLE, "Ustoz faqat dars mavzusi va izohini o'zgartira oladi.")
        else:
            require(can_manage_group(request.user, lesson.group))
        lesson = services.update_lesson(request.user, lesson, data, request=request)
        return self._out(lesson)

    def destroy(self, request, *args, **kwargs):
        lesson = self.get_object()
        require(can_manage_group(request.user, lesson.group))
        services.delete_lesson(request.user, lesson, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=CancelSerializer, responses={200: LessonSerializer})
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        lesson = self.get_object()
        require(can_manage_group(request.user, lesson.group))
        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lesson = services.cancel_lesson(request.user, lesson, serializer.validated_data["reason"], request=request)
        return self._out(lesson)
