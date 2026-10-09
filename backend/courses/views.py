from django.db import transaction
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from audit.services import record as audit
from core.files import protected_file_response, validate_upload
from core.permissions import AD, ALL_ROLES, SA, RolePermission, require

from .models import Course
from .selectors import can_manage_course, courses_for, materials_for
from .serializers import CourseMaterialSerializer, CourseSerializer

COURSE_FIELDS = (
    "name",
    "code",
    "description",
    "duration_months",
    "lessons_per_week",
    "lesson_duration_minutes",
    "monthly_price",
    "is_active",
)
MANAGE_DENIED = "Bu kursni faqat uning filiali admini yoki superadmin o'zgartira oladi."


class CourseViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Courses are archived (``is_active=false``), never deleted."""

    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "create": (SA, AD),
        "partial_update": (SA, AD),
        "materials": ALL_ROLES,
    }
    http_method_names = ["get", "post", "patch", "head"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    serializer_class = CourseSerializer
    filterset_fields = ("branch", "is_active")
    search_fields = ("name", "code")
    ordering_fields = ("name", "code", "monthly_price", "created_at")
    ordering = ("name",)

    def get_queryset(self):
        return courses_for(self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user
        branch = user.branch if user.role == AD else serializer.validated_data.get("branch")
        course = serializer.save(branch=branch)
        audit(
            "create",
            actor=user,
            obj=course,
            changes={f: getattr(course, f) for f in COURSE_FIELDS},
            request=self.request,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        user = self.request.user
        course = serializer.instance
        require(can_manage_course(user, course), MANAGE_DENIED)
        before = {f: getattr(course, f) for f in COURSE_FIELDS}
        kwargs = {}
        if user.role == AD:
            kwargs["branch"] = course.branch  # admins cannot move a course out of their branch
        course = serializer.save(**kwargs)
        changes = {f: [before[f], getattr(course, f)] for f in COURSE_FIELDS if before[f] != getattr(course, f)}
        if changes:
            audit("update", actor=user, obj=course, changes=changes, request=self.request)

    @extend_schema(request=CourseMaterialSerializer, responses={200: CourseMaterialSerializer(many=True)})
    @action(detail=True, methods=["get", "post"])
    def materials(self, request, pk=None):
        course: Course = self.get_object()
        if request.method == "GET":
            data = CourseMaterialSerializer(course.materials.all(), many=True).data
            return Response(data)
        require(can_manage_course(request.user, course), MANAGE_DENIED)
        serializer = CourseMaterialSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = serializer.validated_data.pop("file", None)
        validate_upload(upload)
        material = serializer.save(
            course=course,
            created_by=request.user,
            file=upload or "",
            file_name=(upload.name if upload else "")[:255],
        )
        audit("create", actor=request.user, obj=material, branch=course.branch_id, request=request)
        return Response(CourseMaterialSerializer(material).data, status=status.HTTP_201_CREATED)


class CourseMaterialViewSet(mixins.UpdateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    role_permissions = {"partial_update": (SA, AD), "destroy": (SA, AD), "download": ALL_ROLES}
    http_method_names = ["get", "patch", "delete", "head"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    serializer_class = CourseMaterialSerializer

    def get_queryset(self):
        return materials_for(self.request.user)

    def perform_update(self, serializer):
        material = serializer.instance
        require(can_manage_course(self.request.user, material.course), MANAGE_DENIED)
        upload = serializer.validated_data.pop("file", None)
        extra = {}
        if upload:
            validate_upload(upload)
            extra = {"file": upload, "file_name": upload.name[:255]}
        material = serializer.save(**extra)
        audit("update", actor=self.request.user, obj=material, branch=material.course.branch_id, request=self.request)

    def perform_destroy(self, instance):
        require(can_manage_course(self.request.user, instance.course), MANAGE_DENIED)
        audit("delete", actor=self.request.user, obj=instance, branch=instance.course.branch_id, request=self.request)
        if instance.file:
            instance.file.delete(save=False)
        instance.delete()

    @extend_schema(responses={200: None})
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        material = self.get_object()
        return protected_file_response(material.file, material.file_name or None)
