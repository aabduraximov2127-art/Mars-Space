from rest_framework import serializers

from accounts.models import User
from core.roles import TE

from .models import DiscountType, Group, GroupMembership


class GroupSerializer(serializers.ModelSerializer):
    code = serializers.CharField(max_length=30)
    course_name = serializers.CharField(source="course.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True, default=None)
    room_name = serializers.CharField(source="room.name", read_only=True, default=None)
    students_count = serializers.IntegerField(read_only=True, default=0)
    teacher = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=TE), required=False, allow_null=True)

    class Meta:
        model = Group
        fields = (
            "id",
            "code",
            "name",
            "course",
            "course_name",
            "branch",
            "branch_name",
            "teacher",
            "teacher_name",
            "room",
            "room_name",
            "status",
            "start_date",
            "end_date",
            "capacity",
            "days_of_week",
            "lesson_start_time",
            "lesson_end_time",
            "students_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "course_name",
            "branch_name",
            "teacher_name",
            "room_name",
            "students_count",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {"branch": {"required": False}}

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Kod majburiy.")
        qs = Group.objects.filter(code=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Bu kodli guruh mavjud.")
        return value

    def validate_days_of_week(self, value):
        if not isinstance(value, list) or any(not isinstance(d, int) or d < 0 or d > 6 for d in value):
            raise serializers.ValidationError(
                "Hafta kunlari 0 (dushanba) dan 6 (yakshanba) gacha sonlar ro'yxati bo'lsin."
            )
        return sorted(set(value))

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": ["Tugash sanasi boshlanish sanasidan oldin bo'lmasin."]})
        t1 = attrs.get("lesson_start_time", getattr(self.instance, "lesson_start_time", None))
        t2 = attrs.get("lesson_end_time", getattr(self.instance, "lesson_end_time", None))
        if t1 and t2 and t2 <= t1:
            raise serializers.ValidationError({"lesson_end_time": ["Tugash vaqti boshlanish vaqtidan keyin bo'lsin."]})
        return attrs


class GroupStudentSerializer(serializers.ModelSerializer):
    """A membership row as shown inside a group (roster)."""

    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_phone = serializers.CharField(source="student.phone", read_only=True)
    monthly_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = GroupMembership
        fields = (
            "id",
            "student",
            "student_name",
            "student_phone",
            "status",
            "joined_at",
            "left_at",
            "monthly_fee",
            "discount_type",
            "discount_value",
            "monthly_amount",
        )
        read_only_fields = fields


class MembershipSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    group_code = serializers.CharField(source="group.code", read_only=True)
    course_name = serializers.CharField(source="group.course.name", read_only=True)
    branch = serializers.IntegerField(source="group.branch_id", read_only=True)
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    student_phone = serializers.CharField(source="student.phone", read_only=True)
    monthly_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = GroupMembership
        fields = (
            "id",
            "group",
            "group_name",
            "group_code",
            "course_name",
            "branch",
            "student",
            "student_name",
            "student_phone",
            "status",
            "joined_at",
            "left_at",
            "transferred_to",
            "monthly_fee",
            "discount_type",
            "discount_value",
            "discount_reason",
            "monthly_amount",
            "note",
            "created_at",
        )
        read_only_fields = fields


class MembershipCreateSerializer(serializers.Serializer):
    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    student = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    joined_at = serializers.DateField()
    discount_type = serializers.ChoiceField(choices=DiscountType.choices, default=DiscountType.NONE)
    discount_value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    discount_reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class MembershipUpdateSerializer(serializers.Serializer):
    discount_type = serializers.ChoiceField(choices=DiscountType.choices, required=False)
    discount_value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False)
    discount_reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)


class LeaveSerializer(serializers.Serializer):
    left_at = serializers.DateField()
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class TransferSerializer(serializers.Serializer):
    to_group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    date = serializers.DateField()


class GenerateLessonsSerializer(serializers.Serializer):
    date_from = serializers.DateField()
    date_to = serializers.DateField()


class GenerateLessonsResultSerializer(serializers.Serializer):
    created = serializers.IntegerField()
    skipped = serializers.ListField(child=serializers.DictField())
