from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from core.files import protected_file_response
from core.permissions import AD, ALL_ROLES, SA, ST, TE, RolePermission, role_of
from groups.models import MembershipStatus
from groups.selectors import groups_for

from . import services
from .models import NOT_SUBMITTED, Assignment, AssignmentSubmission, SubmissionStatus
from .selectors import assignments_for, submissions_for
from .serializers import (
    AssignmentSerializer,
    AssignmentUpdateSerializer,
    AssignmentWriteSerializer,
    FeedbackSerializer,
    GradeSubmissionSerializer,
    SubmissionSerializer,
    SubmitSerializer,
)


class AssignmentFilter(filters.FilterSet):
    due_from = filters.DateFilter(field_name="due_at", lookup_expr="date__gte")
    due_to = filters.DateFilter(field_name="due_at", lookup_expr="date__lte")
    course = filters.NumberFilter(field_name="group__course_id")

    class Meta:
        model = Assignment
        fields = ("group", "status", "lesson")


class AssignmentViewSet(
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
        "create": (SA, AD, TE),
        "partial_update": (SA, AD, TE),
        "destroy": (SA, AD, TE),
        "publish": (SA, AD, TE),
        "close": (SA, AD, TE),
        "submissions": (SA, AD, TE),
        "attachment": ALL_ROLES,
    }
    http_method_names = ["get", "post", "patch", "delete", "head"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    serializer_class = AssignmentSerializer
    filterset_class = AssignmentFilter
    search_fields = ("title", "group__name", "group__code")
    ordering_fields = ("due_at", "created_at", "title")
    ordering = ("-due_at", "-id")

    def get_queryset(self):
        qs = assignments_for(self.request.user)
        if role_of(self.request.user) in (SA, AD, TE):
            qs = qs.annotate(
                submissions_count=Count("submissions", distinct=True),
                pending_review_count=Count(
                    "submissions",
                    filter=Q(submissions__status__in=(SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW)),
                    distinct=True,
                ),
            )
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        user = self.request.user
        if role_of(user) == ST:
            ctx["my_submissions"] = {
                s.assignment_id: s for s in AssignmentSubmission.objects.filter(student=user).select_related("grade")
            }
        return ctx

    def _out(self, assignment, code=status.HTTP_200_OK):
        obj = self.get_queryset().get(pk=assignment.pk)
        return Response(AssignmentSerializer(obj, context=self.get_serializer_context()).data, status=code)

    @extend_schema(request=AssignmentWriteSerializer, responses={201: AssignmentSerializer})
    def create(self, request, *args, **kwargs):
        serializer = AssignmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        group = data.pop("group")
        attachment = data.pop("attachment", None)
        if not groups_for(request.user).filter(pk=group.pk).exists():
            raise ValidationError({"group": ["Guruh topilmadi."]})
        a = services.create_assignment(request.user, group=group, data=data, attachment=attachment, request=request)
        return self._out(a, status.HTTP_201_CREATED)

    @extend_schema(request=AssignmentUpdateSerializer, responses={200: AssignmentSerializer})
    def partial_update(self, request, *args, **kwargs):
        a = self.get_object()
        serializer = AssignmentUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        attachment = data.pop("attachment", None)
        a = services.update_assignment(request.user, a, data, attachment=attachment, request=request)
        return self._out(a)

    def destroy(self, request, *args, **kwargs):
        services.delete(request.user, self.get_object(), request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={200: AssignmentSerializer})
    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        return self._out(services.publish(request.user, self.get_object(), request=request))

    @extend_schema(request=None, responses={200: AssignmentSerializer})
    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        return self._out(services.close(request.user, self.get_object(), request=request))

    @extend_schema(responses={200: OpenApiResponse(description="Every active student with submission state")})
    @action(detail=True, methods=["get"])
    def submissions(self, request, pk=None):
        a = self.get_object()
        subs = {s.student_id: s for s in a.submissions.select_related("student", "grade").prefetch_related("revisions")}
        rows = []
        members = a.group.memberships.select_related("student").filter(
            status__in=(MembershipStatus.ACTIVE, MembershipStatus.FROZEN)
        )
        student_ids = set()
        for m in members.order_by("student__last_name", "student__first_name"):
            student_ids.add(m.student_id)
            s = subs.get(m.student_id)
            if s:
                rows.append(SubmissionSerializer(s).data)
            else:
                rows.append(
                    {
                        "id": None,
                        "student": m.student_id,
                        "student_name": m.student.full_name,
                        "status": NOT_SUBMITTED,
                        "revision_count": 0,
                        "last_submitted_at": None,
                        "is_late": False,
                        "grade": None,
                        "revisions": [],
                    }
                )
        # Former members who already submitted are still listed.
        for sid, s in subs.items():
            if sid not in student_ids:
                rows.append(SubmissionSerializer(s).data)
        return Response(rows)

    @extend_schema(responses={200: None})
    @action(detail=True, methods=["get"])
    def attachment(self, request, pk=None):
        a = self.get_object()
        return protected_file_response(a.attachment, a.attachment_name or None)


class SubmissionFilter(filters.FilterSet):
    group = filters.NumberFilter(field_name="assignment__group_id")

    class Meta:
        model = AssignmentSubmission
        fields = ("assignment", "student", "status")


class SubmissionViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "create": (ST,),
        "start_review": (TE,),
        "request_revision": (TE,),
        "grade": (TE,),
        "revision_file": ALL_ROLES,
    }
    http_method_names = ["get", "post", "head"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    serializer_class = SubmissionSerializer
    filterset_class = SubmissionFilter
    search_fields = ("student__first_name", "student__last_name", "assignment__title")
    ordering_fields = ("last_submitted_at",)
    ordering = ("-last_submitted_at", "-id")

    def get_queryset(self):
        return submissions_for(self.request.user).select_related("grade")

    def _out(self, submission, code=status.HTTP_200_OK):
        return Response(SubmissionSerializer(self.get_queryset().get(pk=submission.pk)).data, status=code)

    @extend_schema(request=SubmitSerializer, responses={201: SubmissionSerializer})
    def create(self, request, *args, **kwargs):
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        assignment = data.pop("assignment")
        if not assignments_for(request.user).filter(pk=assignment.pk).exists():
            raise ValidationError({"assignment": ["Vazifa topilmadi."]})
        s = services.submit(request.user, assignment, request=request, **data)
        return self._out(s, status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={200: SubmissionSerializer})
    @action(detail=True, methods=["post"], url_path="start-review")
    def start_review(self, request, pk=None):
        return self._out(services.start_review(request.user, self.get_object(), request=request))

    @extend_schema(request=FeedbackSerializer, responses={200: SubmissionSerializer})
    @action(detail=True, methods=["post"], url_path="request-revision")
    def request_revision(self, request, pk=None):
        serializer = FeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        s = services.request_revision(
            request.user, self.get_object(), serializer.validated_data["feedback"], request=request
        )
        return self._out(s)

    @extend_schema(request=GradeSubmissionSerializer, responses={200: SubmissionSerializer})
    @action(detail=True, methods=["post"])
    def grade(self, request, pk=None):
        submission = self.get_object()
        serializer = GradeSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.grade(request.user, submission, request=request, **serializer.validated_data)
        return self._out(submission)

    @extend_schema(responses={200: None})
    @action(detail=True, methods=["get"], url_path=r"revisions/(?P<number>\d+)/file")
    def revision_file(self, request, pk=None, number=None):
        submission = self.get_object()
        revision = get_object_or_404(submission.revisions, number=number)
        return protected_file_response(revision.file, revision.file_name or None)
