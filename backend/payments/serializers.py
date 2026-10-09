import uuid
from decimal import Decimal

from rest_framework import serializers

from groups.models import Group, GroupMembership

from .calculations import balance_of
from .models import Invoice, Payment, PaymentMethod


class PaymentSerializer(serializers.ModelSerializer):
    receipt_number = serializers.CharField(read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    group = serializers.IntegerField(source="membership.group_id", read_only=True)
    group_name = serializers.CharField(source="membership.group.name", read_only=True)
    course_name = serializers.CharField(source="membership.group.course.name", read_only=True)
    received_by_name = serializers.CharField(source="received_by.full_name", read_only=True)
    voided_by_name = serializers.CharField(source="voided_by.full_name", read_only=True, default=None)

    class Meta:
        model = Payment
        fields = (
            "id",
            "receipt_number",
            "membership",
            "student",
            "student_name",
            "group",
            "group_name",
            "course_name",
            "amount",
            "method",
            "status",
            "paid_at",
            "note",
            "received_by",
            "received_by_name",
            "voided_at",
            "voided_by_name",
            "void_reason",
            "created_at",
        )
        read_only_fields = fields


class PaymentCreateSerializer(serializers.Serializer):
    membership = serializers.PrimaryKeyRelatedField(queryset=GroupMembership.objects.all())
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    paid_at = serializers.DateTimeField(required=False, allow_null=True)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    idempotency_key = serializers.UUIDField(default=uuid.uuid4)
    confirm_duplicate = serializers.BooleanField(default=False)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)


class InvoiceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    paid_amount = serializers.SerializerMethodField()
    payment_state = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = (
            "id",
            "membership",
            "student",
            "student_name",
            "group",
            "group_name",
            "period",
            "base_amount",
            "discount_amount",
            "amount",
            "due_date",
            "status",
            "cancel_reason",
            "paid_amount",
            "payment_state",
            "created_at",
        )
        read_only_fields = fields

    def _alloc(self, obj):
        return (self.context.get("allocations") or {}).get(obj.pk)

    def get_paid_amount(self, obj) -> str | None:
        a = self._alloc(obj)
        return str(a.paid_amount) if a else None

    def get_payment_state(self, obj) -> str | None:
        a = self._alloc(obj)
        return a.state if a else None


class GenerateInvoicesSerializer(serializers.Serializer):
    period = serializers.RegexField(
        r"^\d{4}-(0[1-9]|1[0-2])$", error_messages={"invalid": "Davr YYYY-MM formatida bo'lsin."}
    )
    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all(), required=False, allow_null=True)


class BalanceSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_phone = serializers.CharField(source="student.phone", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)
    group_code = serializers.CharField(source="group.code", read_only=True)
    branch = serializers.IntegerField(source="group.branch_id", read_only=True)
    branch_name = serializers.CharField(source="group.branch.name", read_only=True)
    monthly_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    charged = serializers.SerializerMethodField()
    paid = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    debt = serializers.SerializerMethodField()

    class Meta:
        model = GroupMembership
        fields = (
            "id",
            "student",
            "student_name",
            "student_phone",
            "group",
            "group_name",
            "group_code",
            "branch",
            "branch_name",
            "status",
            "monthly_amount",
            "charged",
            "paid",
            "balance",
            "debt",
        )
        read_only_fields = fields

    def _b(self, obj):
        return balance_of(getattr(obj, "charged", None), getattr(obj, "paid", None))

    def get_charged(self, obj) -> str:
        return str(self._b(obj)["charged"])

    def get_paid(self, obj) -> str:
        return str(self._b(obj)["paid"])

    def get_balance(self, obj) -> str:
        return str(self._b(obj)["balance"])

    def get_debt(self, obj) -> str:
        return str(self._b(obj)["debt"])
