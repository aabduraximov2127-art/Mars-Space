from django.db import transaction
from django.db.models import Q, QuerySet, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.models import User
from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.permissions import AD, ALL_ROLES, SA, ST, TE, RolePermission, require, role_of
from groups.models import OPEN_MEMBERSHIP_STATUSES, Group
from notifications.services import NotificationType, notify
from organizations.models import SystemSettings

from .models import RewardCategory, RewardTransaction


def rewards_for(user) -> QuerySet[RewardTransaction]:
    role = role_of(user)
    qs = RewardTransaction.objects.select_related("student", "group", "created_by")
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(student__branch_id=user.branch_id)
    if role == TE:
        return qs.filter(student__in=_teacher_students(user))
    if role == ST:
        return qs.filter(student=user)
    return qs.none()


def _teacher_students(teacher) -> QuerySet[User]:
    return User.objects.filter(
        memberships__group__teacher=teacher, memberships__status__in=OPEN_MEMBERSHIP_STATUSES
    ).values("pk")


def balance(student_id) -> int:
    return RewardTransaction.objects.filter(student_id=student_id).aggregate(s=Sum("amount"))["s"] or 0


class RewardSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = RewardTransaction
        fields = (
            "id",
            "student",
            "student_name",
            "amount",
            "category",
            "reason",
            "group",
            "group_name",
            "created_by",
            "created_by_name",
            "created_at",
        )
        read_only_fields = ("id", "student_name", "group_name", "created_by", "created_by_name", "created_at")


class RewardViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": ALL_ROLES,
        "create": (SA, AD, TE),
        "balance": ALL_ROLES,
        "leaderboard": ALL_ROLES,
    }
    http_method_names = ["get", "post", "head"]
    serializer_class = RewardSerializer
    filterset_fields = ("student", "group", "category")
    search_fields = ("reason", "student__first_name", "student__last_name")
    ordering = ("-created_at", "-id")

    def get_queryset(self):
        return rewards_for(self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        user = self.request.user
        data = serializer.validated_data
        student = User.objects.select_for_update().get(pk=data["student"].pk)
        group = data.get("group")
        amount = data["amount"]
        if student.role != ST:
            raise ValidationError({"student": ["Coin faqat studentga beriladi."]})
        if amount == 0:
            raise ValidationError({"amount": ["Miqdor 0 bo'lmasin."]})
        role = user.role
        if role == AD:
            require(student.branch_id == user.branch_id, "Student boshqa filialga tegishli.")
        if role == TE:
            limit = SystemSettings.load().teacher_reward_limit
            require(data["category"] != RewardCategory.REDEEM, "Ustoz coin sarflash amalini bajara olmaydi.")
            if abs(amount) > limit:
                raise BusinessRuleError(
                    f"Ustoz bir martada ko'pi bilan {limit} coin bera oladi.", code="limit_exceeded"
                )
            teaches = Group.objects.filter(
                teacher=user, memberships__student=student, memberships__status__in=OPEN_MEMBERSHIP_STATUSES
            )
            if group is not None:
                teaches = teaches.filter(pk=group.pk)
            require(teaches.exists(), "Faqat o'z guruhingiz studentiga coin bera olasiz.")
        if group is not None and not group.memberships.filter(student=student).exists():
            raise ValidationError({"group": ["Student bu guruhda emas."]})
        if balance(student.pk) + amount < 0:
            raise BusinessRuleError("Coin balansi yetarli emas.", code="insufficient_balance")
        tx = serializer.save(created_by=user)
        audit(
            "reward",
            actor=user,
            obj=tx,
            changes={"student": student.pk, "amount": amount},
            branch=student.branch_id,
            request=self.request,
        )
        if amount > 0:
            notify(
                [student],
                NotificationType.REWARD,
                f"+{amount} coin",
                tx.reason,
                link="/rewards",
                data={"transaction_id": tx.pk},
            )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(RewardSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={200: OpenApiResponse(description="{student, balance, earned, spent}")})
    @action(detail=False, methods=["get"])
    def balance(self, request):
        user = request.user
        if role_of(user) == ST:
            student_id = user.pk
        else:
            raw = request.query_params.get("student")
            if not raw or not raw.isdigit():
                raise ValidationError({"student": ["Student majburiy."]})
            student_id = int(raw)
        qs = self.get_queryset().filter(student_id=student_id)
        if role_of(user) != ST and not qs.exists():
            # The student may simply have no transactions yet — check scope separately.
            scope = User.objects.filter(pk=student_id, role=ST)
            if role_of(user) == AD:
                scope = scope.filter(branch_id=user.branch_id)
            elif role_of(user) == TE:
                scope = scope.filter(pk__in=_teacher_students(user))
            get_object_or_404(scope)
        agg = qs.aggregate(
            total=Sum("amount"),
            earned=Sum("amount", filter=Q(amount__gt=0)),
            spent=Sum("amount", filter=Q(amount__lt=0)),
        )
        return Response(
            {
                "student": student_id,
                "balance": agg["total"] or 0,
                "earned": agg["earned"] or 0,
                "spent": -(agg["spent"] or 0),
            }
        )

    @extend_schema(responses={200: OpenApiResponse(description="Top 20 students by coins")})
    @action(detail=False, methods=["get"])
    def leaderboard(self, request):
        user = request.user
        role = role_of(user)
        students = User.objects.filter(role=ST, is_active=True)
        group_id = request.query_params.get("group")
        if group_id and group_id.isdigit():
            group = get_object_or_404(Group, pk=int(group_id))
            allowed = (
                role == SA
                or (role == AD and group.branch_id == user.branch_id)
                or (role == TE and group.teacher_id == user.pk)
                or (role == ST and group.memberships.filter(student=user, status__in=OPEN_MEMBERSHIP_STATUSES).exists())
            )
            if not allowed:
                return Response({"detail": "Topilmadi.", "code": "not_found"}, status=status.HTTP_404_NOT_FOUND)
            students = students.filter(memberships__group=group, memberships__status__in=OPEN_MEMBERSHIP_STATUSES)
        elif role == AD:
            students = students.filter(branch_id=user.branch_id)
        elif role == TE:
            students = students.filter(pk__in=_teacher_students(user))
        elif role == ST:
            my_groups = user.memberships.filter(status__in=OPEN_MEMBERSHIP_STATUSES).values("group_id")
            students = students.filter(
                memberships__group__in=my_groups, memberships__status__in=OPEN_MEMBERSHIP_STATUSES
            )
        rows = (
            User.objects.filter(pk__in=students.values("pk"))
            .annotate(coins=Sum("reward_transactions__amount"))
            .filter(coins__gt=0)
            .order_by("-coins", "last_name")[:20]
        )
        result = []
        for i, s in enumerate(rows, start=1):
            result.append(
                {
                    "rank": i,
                    "student": s.pk,
                    "name": s.short_name if role == ST else s.full_name,
                    "coins": s.coins,
                    "is_me": s.pk == user.pk,
                }
            )
        return Response(result)
