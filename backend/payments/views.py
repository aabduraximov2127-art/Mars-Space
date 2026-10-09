import datetime as dt

from django.db.models import F
from django_filters import rest_framework as filters
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from core.permissions import AD, SA, ST, RolePermission
from groups.models import GroupMembership
from groups.selectors import groups_for

from . import services
from .calculations import allocate_fifo, totals, with_balances
from .models import Invoice, Payment
from .serializers import (
    BalanceSerializer,
    GenerateInvoicesSerializer,
    InvoiceSerializer,
    PaymentCreateSerializer,
    PaymentSerializer,
    ReasonSerializer,
)


class PaymentFilter(filters.FilterSet):
    group = filters.NumberFilter(field_name="membership__group_id")
    branch = filters.NumberFilter(field_name="membership__group__branch_id")
    date_from = filters.DateFilter(field_name="paid_at", lookup_expr="date__gte")
    date_to = filters.DateFilter(field_name="paid_at", lookup_expr="date__lte")

    class Meta:
        model = Payment
        fields = ("student", "membership", "method", "status")


class PaymentViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet
):
    """Payments are never deleted — only voided with a reason."""

    permission_classes = [RolePermission]
    role_permissions = {
        "list": (SA, AD, ST),
        "retrieve": (SA, AD, ST),
        "create": (SA, AD),
        "void": (SA, AD),
        "send_reminders": (SA, AD),
    }
    http_method_names = ["get", "post", "head"]
    serializer_class = PaymentSerializer
    filterset_class = PaymentFilter
    search_fields = ("student__first_name", "student__last_name", "student__phone", "note")
    ordering_fields = ("paid_at", "amount", "created_at")
    ordering = ("-paid_at", "-id")

    def get_queryset(self):
        return services.payments_for(self.request.user)

    @extend_schema(request=PaymentCreateSerializer, responses={201: PaymentSerializer, 200: PaymentSerializer})
    def create(self, request, *args, **kwargs):
        serializer = PaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        membership = data.pop("membership")
        if not services.balance_memberships_for(request.user).filter(pk=membership.pk).exists():
            raise ValidationError({"membership": ["A'zolik topilmadi."]})
        payment, created = services.create_payment(request.user, membership=membership, request=request, **data)
        return Response(
            PaymentSerializer(self.get_queryset().get(pk=payment.pk)).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @extend_schema(request=ReasonSerializer, responses={200: PaymentSerializer})
    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        p = services.void_payment(request.user, self.get_object(), serializer.validated_data["reason"], request=request)
        return Response(PaymentSerializer(self.get_queryset().get(pk=p.pk)).data)

    @extend_schema(request=None, responses={200: OpenApiResponse(description="{notified}")})
    @action(detail=False, methods=["post"], url_path="send-reminders")
    def send_reminders(self, request):
        qs = services.balance_memberships_for(request.user)
        group = request.data.get("group") if hasattr(request.data, "get") else None
        if group:
            qs = qs.filter(group_id=group)
        return Response({"notified": services.send_reminders(request.user, qs, request=request)})


class InvoiceFilter(filters.FilterSet):
    period = filters.CharFilter(method="filter_period")

    class Meta:
        model = Invoice
        fields = ("student", "group", "membership", "status")

    def filter_period(self, queryset, name, value):
        try:
            first = dt.date.fromisoformat(f"{value}-01")
        except ValueError as exc:
            raise ValidationError({"period": ["Davr YYYY-MM formatida bo'lsin."]}) from exc
        return queryset.filter(period=first)


class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    role_permissions = {
        "list": (SA, AD, ST),
        "retrieve": (SA, AD, ST),
        "generate": (SA, AD),
        "cancel": (SA, AD),
    }
    serializer_class = InvoiceSerializer
    filterset_class = InvoiceFilter
    search_fields = ("student__first_name", "student__last_name", "group__name")
    ordering_fields = ("period", "due_date", "amount")
    ordering = ("-period", "-id")

    def get_queryset(self):
        return services.invoices_for(self.request.user)

    def _allocations(self, invoices) -> dict:
        membership_ids = {i.membership_id for i in invoices}
        if not membership_ids:
            return {}
        result = {}
        paid = {
            row["pk"]: row["paid"]
            for row in with_balances(
                services.balance_memberships_for(self.request.user).filter(pk__in=membership_ids)
            ).values("pk", "paid")
        }
        all_invoices: dict[int, list] = {}
        for inv in Invoice.objects.filter(membership_id__in=membership_ids):
            all_invoices.setdefault(inv.membership_id, []).append(inv)
        for mid, invs in all_invoices.items():
            for alloc in allocate_fifo(invs, paid.get(mid)):
                result[alloc.invoice.pk] = alloc
        return result

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        ctx = {**self.get_serializer_context(), "allocations": self._allocations(page)}
        return self.get_paginated_response(InvoiceSerializer(page, many=True, context=ctx).data)

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        ctx = {**self.get_serializer_context(), "allocations": self._allocations([obj])}
        return Response(InvoiceSerializer(obj, context=ctx).data)

    @extend_schema(
        request=GenerateInvoicesSerializer, responses={200: OpenApiResponse(description="{created, skipped}")}
    )
    @action(detail=False, methods=["post"])
    def generate(self, request):
        serializer = GenerateInvoicesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = serializer.validated_data.get("group")
        if group is not None and not groups_for(request.user).filter(pk=group.pk).exists():
            raise ValidationError({"group": ["Guruh topilmadi."]})
        period = dt.date.fromisoformat(f"{serializer.validated_data['period']}-01")
        return Response(services.generate_invoices(request.user, period, group=group, request=request))

    @extend_schema(request=ReasonSerializer, responses={200: InvoiceSerializer})
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        serializer = ReasonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        inv = services.cancel_invoice(
            request.user, self.get_object(), serializer.validated_data["reason"], request=request
        )
        ctx = {**self.get_serializer_context(), "allocations": self._allocations([inv])}
        return Response(InvoiceSerializer(inv, context=ctx).data)


class BalanceFilter(filters.FilterSet):
    branch = filters.NumberFilter(field_name="group__branch_id")
    has_debt = filters.BooleanFilter(method="filter_debt")

    class Meta:
        model = GroupMembership
        fields = ("group", "student", "status")

    def filter_debt(self, queryset, name, value):
        if value:
            return queryset.filter(charged__gt=F("paid"))
        return queryset.filter(charged__lte=F("paid"))


class BalanceViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [RolePermission]
    role_permissions = {"list": (SA, AD, ST), "summary": (SA, AD)}
    serializer_class = BalanceSerializer
    filterset_class = BalanceFilter
    search_fields = ("student__first_name", "student__last_name", "student__phone", "group__name")
    ordering_fields = ("student__last_name", "charged", "paid")
    ordering = ("student__last_name", "student__first_name", "id")

    def get_queryset(self):
        return with_balances(services.balance_memberships_for(self.request.user))

    @extend_schema(
        responses={200: OpenApiResponse(description="{total_charged, total_paid, total_debt, debtors_count}")}
    )
    @action(detail=False, methods=["get"])
    def summary(self, request):
        qs = services.balance_memberships_for(request.user)
        for param, field in (("group", "group_id"), ("branch", "group__branch_id"), ("student", "student_id")):
            value = request.query_params.get(param)
            if value and value.isdigit():
                qs = qs.filter(**{field: int(value)})
        return Response(totals(qs))
