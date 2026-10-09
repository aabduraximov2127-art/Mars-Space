import datetime as dt

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.permissions import AD, ALL_ROLES, SA, TE, RolePermission, require, role_of

from . import services
from .models import OPEN_MEMBERSHIP_STATUSES, GroupMembership, MembershipStatus
from .selectors import can_manage_group, groups_for, memberships_for
from .serializers import (
    GenerateLessonsResultSerializer,
    GenerateLessonsSerializer,
    GroupSerializer,
    GroupStudentSerializer,
    LeaveSerializer,
    MembershipCreateSerializer,
    MembershipSerializer,
    MembershipUpdateSerializer,
    TransferSerializer,
)

GROUP_FIELDS = (
    "code",
    "name",
    "course_id",
    "branch_id",
    "teacher_id",
    "room_id",
    "status",
    "start_date",
    "end_date",
    "capacity",
    "days_of_week",
    "lesson_start_time",
    "lesson_end_time",
)


def _parse_date(value, field):
    if not value:
        return None
    try:
        return dt.date.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError({field: ["Sana formati YYYY-MM-DD bo'lishi kerak."]}) from exc


class GroupViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "create": (SA, AD),
        "partial_update": (SA, AD),
        "students": (SA, AD, TE),
        "generate_lessons": (SA, AD),
        "attendance_sheet": (SA, AD, TE),
        "gradebook": (SA, AD, TE),
    }
    http_method_names = ["get", "post", "patch", "head"]
    serializer_class = GroupSerializer
    filterset_fields = ("branch", "course", "teacher", "status", "room")
    search_fields = ("name", "code", "course__name")
    ordering_fields = ("name", "code", "start_date", "created_at")
    ordering = ("-start_date", "name")

    def get_queryset(self):
        return groups_for(self.request.user).annotate(
            students_count=Count("memberships", filter=Q(memberships__status=MembershipStatus.ACTIVE), distinct=True)
        )

    def _resolve(self, serializer):
        user = self.request.user
        inst = serializer.instance
        data = serializer.validated_data
        branch = user.branch if user.role == AD else data.get("branch") or getattr(inst, "branch", None)
        if branch is None:
            raise ValidationError({"branch": ["Filial majburiy."]})
        course = data.get("course") or getattr(inst, "course", None)
        teacher = data["teacher"] if "teacher" in data else getattr(inst, "teacher", None)
        room = data["room"] if "room" in data else getattr(inst, "room", None)
        services.validate_group_relations(branch=branch, course=course, teacher=teacher, room=room)
        return branch

    @transaction.atomic
    def perform_create(self, serializer):
        branch = self._resolve(serializer)
        group = serializer.save(branch=branch)
        audit(
            "create",
            actor=self.request.user,
            obj=group,
            changes={f: getattr(group, f) for f in GROUP_FIELDS},
            request=self.request,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        group = serializer.instance
        require(can_manage_group(self.request.user, group))
        before = {f: getattr(group, f) for f in GROUP_FIELDS}
        branch = self._resolve(serializer)
        if branch.pk != group.branch_id and group.memberships.exists():
            raise BusinessRuleError(
                "A'zolari bor guruhni boshqa filialga o'tkazib bo'lmaydi.", code="group_has_members"
            )
        group = serializer.save(branch=branch)
        changes = {f: [before[f], getattr(group, f)] for f in GROUP_FIELDS if before[f] != getattr(group, f)}
        if changes:
            audit("update", actor=self.request.user, obj=group, changes=changes, request=self.request)

    @extend_schema(responses={200: GroupStudentSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def students(self, request, pk=None):
        group = self.get_object()
        qs = group.memberships.select_related("student").order_by("student__last_name", "student__first_name")
        if request.query_params.get("include_history") not in ("1", "true"):
            qs = qs.filter(status__in=OPEN_MEMBERSHIP_STATUSES)
        return Response(GroupStudentSerializer(qs, many=True).data)

    @extend_schema(request=GenerateLessonsSerializer, responses={200: GenerateLessonsResultSerializer})
    @action(detail=True, methods=["post"], url_path="generate-lessons")
    def generate_lessons(self, request, pk=None):
        from schedules.services import generate_lessons

        group = self.get_object()
        require(can_manage_group(request.user, group))
        serializer = GenerateLessonsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = generate_lessons(request.user, group, request=request, **serializer.validated_data)
        return Response(result)

    @extend_schema(responses={200: OpenApiResponse(description="Lessons x students attendance matrix")})
    @action(detail=True, methods=["get"], url_path="attendance-sheet")
    def attendance_sheet(self, request, pk=None):
        from attendance.calculations import summarize
        from attendance.models import AttendanceRecord
        from organizations.models import SystemSettings

        group = self.get_object()
        today = timezone.localdate()
        date_to = _parse_date(request.query_params.get("date_to"), "date_to") or today
        date_from = _parse_date(request.query_params.get("date_from"), "date_from") or (date_to - dt.timedelta(days=31))
        lessons = list(
            group.lessons.filter(date__gte=date_from, date__lte=date_to)
            .exclude(status="cancelled")
            .order_by("date", "start_time")
        )
        memberships = (
            group.memberships.select_related("student")
            .filter(joined_at__lte=date_to)
            .filter(Q(left_at__isnull=True) | Q(left_at__gte=date_from))
            .order_by("student__last_name", "student__first_name")
        )
        records = AttendanceRecord.objects.filter(lesson__in=lessons)
        by_student: dict[int, dict] = {}
        for rec in records.values("student_id", "lesson_id", "status"):
            by_student.setdefault(rec["student_id"], {})[rec["lesson_id"]] = rec["status"]
        conf = SystemSettings.load()
        seen = set()
        students = []
        for m in memberships:
            if m.student_id in seen:
                continue
            seen.add(m.student_id)
            summary = summarize(records.filter(student_id=m.student_id), conf)
            students.append(
                {
                    "id": m.student_id,
                    "name": m.student.full_name,
                    "membership_status": m.status,
                    "records": {str(k): v for k, v in by_student.get(m.student_id, {}).items()},
                    "rate": summary["rate"],
                    "summary": summary,
                }
            )
        return Response(
            {
                "group": {"id": group.pk, "name": group.name, "code": group.code},
                "date_from": date_from,
                "date_to": date_to,
                "lessons": [
                    {
                        "id": lesson.pk,
                        "date": lesson.date,
                        "start_time": lesson.start_time,
                        "topic": lesson.topic,
                        "status": lesson.status,
                    }
                    for lesson in lessons
                ],
                "students": students,
            }
        )

    @extend_schema(responses={200: OpenApiResponse(description="Assignments x students scores")})
    @action(detail=True, methods=["get"])
    def gradebook(self, request, pk=None):
        from assignments.models import Assignment
        from grades.models import Grade

        group = self.get_object()
        assignments = list(Assignment.objects.filter(group=group).exclude(status="draft").order_by("due_at", "id"))
        memberships = (
            group.memberships.select_related("student")
            .filter(status__in=OPEN_MEMBERSHIP_STATUSES)
            .order_by("student__last_name", "student__first_name")
        )
        grades: dict[int, dict] = {}
        for g in Grade.objects.filter(group=group).values("student_id", "assignment_id", "score", "max_score"):
            grades.setdefault(g["student_id"], {})[str(g["assignment_id"])] = {
                "score": g["score"],
                "max_score": g["max_score"],
            }
        students = []
        for m in memberships:
            rows = grades.get(m.student_id, {})
            total = sum(float(r["score"]) for r in rows.values())
            total_max = sum(float(r["max_score"]) for r in rows.values())
            students.append(
                {
                    "id": m.student_id,
                    "name": m.student.full_name,
                    "scores": rows,
                    "average_percent": round(total / total_max * 100, 1) if total_max else None,
                }
            )
        return Response(
            {
                "assignments": [
                    {"id": a.pk, "title": a.title, "max_score": a.max_score, "due_at": a.due_at, "status": a.status}
                    for a in assignments
                ],
                "students": students,
            }
        )


class MembershipFilter(filters.FilterSet):
    class Meta:
        model = GroupMembership
        fields = {"group": ["exact"], "student": ["exact"], "status": ["exact", "in"]}


class MembershipViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "create": (SA, AD),
        "partial_update": (SA, AD),
        "freeze": (SA, AD),
        "activate": (SA, AD),
        "leave": (SA, AD),
        "transfer": (SA, AD),
    }
    http_method_names = ["get", "post", "patch", "head"]
    serializer_class = MembershipSerializer
    filterset_class = MembershipFilter
    search_fields = ("student__first_name", "student__last_name", "student__phone", "group__name", "group__code")
    ordering_fields = ("joined_at", "created_at", "student__last_name")
    ordering = ("-joined_at", "-id")

    def get_queryset(self):
        return memberships_for(self.request.user)

    def _out(self, membership, code=status.HTTP_200_OK):
        membership.refresh_from_db()
        return Response(MembershipSerializer(membership).data, status=code)

    @extend_schema(request=MembershipCreateSerializer, responses={201: MembershipSerializer})
    def create(self, request, *args, **kwargs):
        serializer = MembershipCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        group = data.pop("group")
        if not groups_for(request.user).filter(pk=group.pk).exists():
            raise ValidationError({"group": ["Guruh topilmadi."]})
        membership = services.enroll(request.user, group=group, request=request, **data)
        return self._out(membership, status.HTTP_201_CREATED)

    @extend_schema(request=MembershipUpdateSerializer, responses={200: MembershipSerializer})
    def partial_update(self, request, *args, **kwargs):
        membership = self.get_object()
        serializer = MembershipUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.update_membership(request.user, membership, serializer.validated_data, request=request)
        return self._out(membership)

    @extend_schema(request=None, responses={200: MembershipSerializer})
    @action(detail=True, methods=["post"])
    def freeze(self, request, pk=None):
        return self._out(services.freeze(request.user, self.get_object(), request=request))

    @extend_schema(request=None, responses={200: MembershipSerializer})
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        return self._out(services.activate(request.user, self.get_object(), request=request))

    @extend_schema(request=LeaveSerializer, responses={200: MembershipSerializer})
    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        serializer = LeaveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        m = services.leave(request.user, self.get_object(), request=request, **serializer.validated_data)
        return self._out(m)

    @extend_schema(request=TransferSerializer, responses={201: MembershipSerializer})
    @action(detail=True, methods=["post"])
    def transfer(self, request, pk=None):
        serializer = TransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        to_group = serializer.validated_data["to_group"]
        if not groups_for(request.user).filter(pk=to_group.pk).exists() and role_of(request.user) != SA:
            raise ValidationError({"to_group": ["Guruh topilmadi."]})
        new = services.transfer(
            request.user, self.get_object(), to_group, serializer.validated_data["date"], request=request
        )
        return self._out(new, status.HTTP_201_CREATED)
