from django.db.models import Exists, OuterRef, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from core.permissions import AD, ALL_ROLES, SA, ST, TE, RolePermission, role_of
from schedules.selectors import lessons_for
from schedules.serializers import LessonSerializer
from schedules.views import annotate_marked

from . import services
from .calculations import summarize
from .models import AttendanceRecord
from .selectors import attendance_for
from .serializers import AttendanceChangeSerializer, AttendanceRecordSerializer, MarkSerializer, SummarySerializer


class AttendanceFilter(filters.FilterSet):
    group = filters.NumberFilter(field_name="lesson__group_id")
    date_from = filters.DateFilter(field_name="lesson__date", lookup_expr="gte")
    date_to = filters.DateFilter(field_name="lesson__date", lookup_expr="lte")

    class Meta:
        model = AttendanceRecord
        fields = ("student", "lesson", "status")


class AttendanceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "history": (SA, AD, TE),
        "lesson_sheet": (SA, AD, TE),
        "mark": (SA, AD, TE),
        "summary": ALL_ROLES,
        "unmarked_lessons": (SA, AD, TE),
    }
    serializer_class = AttendanceRecordSerializer
    filterset_class = AttendanceFilter
    ordering_fields = ("lesson__date", "updated_at")
    ordering = ("-lesson__date", "-lesson__start_time", "student__last_name")

    def get_queryset(self):
        return attendance_for(self.request.user)

    @extend_schema(responses={200: AttendanceChangeSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        record = self.get_object()
        return Response(AttendanceChangeSerializer(record.changes.select_related("changed_by"), many=True).data)

    def _lesson(self, lesson_id):
        return get_object_or_404(lessons_for(self.request.user).select_related("group"), pk=lesson_id)

    @extend_schema(responses={200: OpenApiResponse(description="Attendance sheet for a lesson")})
    @action(detail=False, methods=["get"], url_path=r"lesson/(?P<lesson_id>\d+)")
    def lesson_sheet(self, request, lesson_id=None):
        lesson = self._lesson(lesson_id)
        can_mark, reason = True, ""
        try:
            services.check_can_mark(request.user, lesson)
        except Exception as exc:  # noqa: BLE001 — surfaced to the UI as a read-only reason
            can_mark, reason = False, str(getattr(exc, "detail", exc))
        lesson_data = LessonSerializer(annotate_marked(lessons_for(request.user)).get(pk=lesson.pk)).data
        return Response(
            {"lesson": lesson_data, "can_mark": can_mark, "reason": reason, "students": services.sheet(lesson)}
        )

    @extend_schema(request=MarkSerializer, responses={200: OpenApiResponse(description="{created, updated}")})
    @action(detail=False, methods=["post"], url_path=r"lesson/(?P<lesson_id>\d+)/mark")
    def mark(self, request, lesson_id=None):
        lesson = self._lesson(lesson_id)
        serializer = MarkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = services.mark(request.user, lesson, request=request, **serializer.validated_data)
        return Response({**result, "students": services.sheet(lesson)})

    @extend_schema(responses={200: SummarySerializer})
    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self.filter_queryset(self.get_queryset())
        if role_of(request.user) == ST:
            qs = qs.filter(student=request.user)
        data = summarize(qs)
        data["total_lessons"] = qs.values("lesson_id").distinct().count()
        return Response(data)

    @extend_schema(responses={200: LessonSerializer(many=True)})
    @action(detail=False, methods=["get"], url_path="unmarked-lessons")
    def unmarked_lessons(self, request):
        now = timezone.localtime()
        qs = (
            lessons_for(request.user)
            .exclude(status="cancelled")
            .filter(Q(date__lt=now.date()) | Q(date=now.date(), start_time__lte=now.time()))
            .annotate(has_records=Exists(AttendanceRecord.objects.filter(lesson=OuterRef("pk"))))
            .filter(has_records=False)
        )
        if role_of(request.user) == TE:
            qs = qs.filter(Q(teacher=request.user) | Q(group__teacher=request.user))
        group = request.query_params.get("group")
        if group and group.isdigit():
            qs = qs.filter(group_id=int(group))
        qs = annotate_marked(qs).order_by("-date", "-start_time")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(LessonSerializer(page, many=True).data)
