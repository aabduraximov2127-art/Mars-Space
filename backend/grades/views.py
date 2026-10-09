from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q, QuerySet, Sum
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.permissions import AD, ALL_ROLES, SA, ST, TE, RolePermission, require, role_of
from notifications.services import NotificationType, notify

from .models import Grade, GradeChange


def grades_for(user) -> QuerySet[Grade]:
    role = role_of(user)
    qs = Grade.objects.select_related("assignment", "student", "group", "graded_by")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(group__branch_id=user.branch_id)
    if role == TE:
        return qs.filter(group__teacher=user)
    if role == ST:
        return qs.filter(student=user)
    return qs.none()


def grade_summary(qs: QuerySet[Grade]) -> dict:
    agg = qs.aggregate(score=Sum("score"), max_score=Sum("max_score"), count=Count("id"))
    total, total_max = agg["score"] or Decimal(0), agg["max_score"] or Decimal(0)
    return {
        "graded_count": agg["count"] or 0,
        "total_score": total,
        "total_max_score": total_max,
        "average_percent": round(float(total) / float(total_max) * 100, 1) if total_max else None,
    }


class GradeSerializer(serializers.ModelSerializer):
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    graded_by_name = serializers.CharField(source="graded_by.full_name", read_only=True)
    percent = serializers.FloatField(read_only=True)

    class Meta:
        model = Grade
        fields = (
            "id",
            "submission",
            "assignment",
            "assignment_title",
            "student",
            "student_name",
            "group",
            "group_name",
            "score",
            "max_score",
            "percent",
            "comment",
            "graded_by",
            "graded_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class GradeUpdateSerializer(serializers.Serializer):
    score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=5000)


class GradeChangeSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True, default=None)

    class Meta:
        model = GradeChange
        fields = (
            "id",
            "previous_score",
            "new_score",
            "previous_comment",
            "new_comment",
            "changed_by",
            "changed_by_name",
            "changed_at",
        )
        read_only_fields = fields


class GradeFilter(filters.FilterSet):
    class Meta:
        model = Grade
        fields = ("group", "student", "assignment")


class GradeViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "retrieve": ALL_ROLES,
        "partial_update": (TE,),
        "history": ALL_ROLES,
        "summary": ALL_ROLES,
    }
    http_method_names = ["get", "patch", "head"]
    serializer_class = GradeSerializer
    filterset_class = GradeFilter
    search_fields = ("assignment__title", "student__first_name", "student__last_name")
    ordering_fields = ("created_at", "score")
    ordering = ("-created_at", "-id")

    def get_queryset(self):
        return grades_for(self.request.user)

    @extend_schema(request=GradeUpdateSerializer, responses={200: GradeSerializer})
    @transaction.atomic
    def partial_update(self, request, *args, **kwargs):
        grade = self.get_object()
        require(grade.group.teacher_id == request.user.pk, "Faqat guruh ustozi bahoni o'zgartira oladi.")
        serializer = GradeUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        score = serializer.validated_data["score"]
        comment = serializer.validated_data.get("comment", grade.comment)
        if score > grade.max_score:
            raise BusinessRuleError(f"Ball 0 dan {grade.max_score} gacha bo'lishi kerak.", code="invalid_score")
        grade = Grade.objects.select_for_update().get(pk=grade.pk)
        GradeChange.objects.create(
            grade=grade,
            previous_score=grade.score,
            new_score=score,
            previous_comment=grade.comment,
            new_comment=comment,
            changed_by=request.user,
        )
        old = grade.score
        grade.score, grade.comment, grade.graded_by = score, comment, request.user
        grade.save()
        audit(
            "grade_update",
            actor=request.user,
            obj=grade,
            changes={"score": [old, score]},
            branch=grade.group.branch_id,
            request=request,
        )
        notify(
            [grade.student],
            NotificationType.ASSIGNMENT_GRADED,
            f"Baho yangilandi: {grade.assignment.title}",
            f"Yangi ball: {score}/{grade.max_score}",
            link=f"/assignments/{grade.assignment_id}",
        )
        return Response(GradeSerializer(self.get_queryset().get(pk=grade.pk)).data)

    @extend_schema(responses={200: GradeChangeSerializer(many=True)})
    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        grade = self.get_object()
        return Response(GradeChangeSerializer(grade.changes.select_related("changed_by"), many=True).data)

    @extend_schema(responses={200: OpenApiResponse(description="{graded_count, average_percent, ...}")})
    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = self.filter_queryset(self.get_queryset())
        data = grade_summary(qs)
        data["by_group"] = [
            {
                "group": row["group_id"],
                "group_name": row["group__name"],
                "graded_count": row["count"],
                "average_percent": round(float(row["s"]) / float(row["m"]) * 100, 1) if row["m"] else None,
            }
            for row in qs.order_by()
            .values("group_id", "group__name")
            .annotate(s=Sum("score"), m=Sum("max_score"), count=Count("id", filter=Q()))
        ]
        return Response(data)
