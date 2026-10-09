import re

from rest_framework import serializers

from accounts.serializers import PhoneField

from .models import Branch, Room, SystemSettings


class BranchSerializer(serializers.ModelSerializer):
    phone = PhoneField(required=False, allow_blank=True)
    code = serializers.CharField(max_length=20)
    students_count = serializers.IntegerField(read_only=True, default=None)
    teachers_count = serializers.IntegerField(read_only=True, default=None)
    active_groups_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = Branch
        fields = (
            "id",
            "name",
            "code",
            "address",
            "phone",
            "is_active",
            "students_count",
            "teachers_count",
            "active_groups_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not re.fullmatch(r"[A-Z0-9-]{2,20}", value):
            raise serializers.ValidationError("Kod 2-20 ta lotin harfi, raqam yoki '-' dan iborat bo'lsin.")
        qs = Branch.objects.filter(code=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Bu kodli filial mavjud.")
        return value


class RoomSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True)

    class Meta:
        model = Room
        fields = ("id", "branch", "branch_name", "name", "capacity", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "branch_name", "created_at", "updated_at")
        extra_kwargs = {"branch": {"required": False}}
        # (branch, name) uniqueness is validated in the view after the branch is resolved.
        validators: list = []


class SystemSettingsSerializer(serializers.ModelSerializer):
    updated_by_name = serializers.CharField(source="updated_by.full_name", read_only=True, default=None)

    class Meta:
        model = SystemSettings
        fields = (
            "center_name",
            "currency",
            "attendance_excused_policy",
            "attendance_late_counts_present",
            "attendance_edit_window_hours",
            "max_upload_mb",
            "allowed_upload_extensions",
            "invoice_due_day",
            "payment_void_window_hours",
            "teacher_reward_limit",
            "updated_by_name",
            "updated_at",
        )
        read_only_fields = ("updated_by_name", "updated_at")

    def validate_allowed_upload_extensions(self, value):
        exts = [e.strip().lower().lstrip(".") for e in (value or "").split(",") if e.strip()]
        if not exts:
            raise serializers.ValidationError("Kamida bitta fayl turi ko'rsatilishi kerak.")
        bad = [e for e in exts if not e.isalnum() or len(e) > 10]
        if bad:
            raise serializers.ValidationError(f"Noto'g'ri kengaytma: {', '.join(bad)}")
        # Files are only ever downloaded as attachments (never rendered inline), so markup types are
        # acceptable; Windows executables/scripts are refused to protect staff who open downloads.
        dangerous = {"exe", "bat", "cmd", "com", "msi", "ps1", "vbs", "scr", "dll", "lnk", "jar"}
        blocked = sorted(set(exts) & dangerous)
        if blocked:
            raise serializers.ValidationError(f"Xavfli fayl turlariga ruxsat berib bo'lmaydi: {', '.join(blocked)}")
        return ",".join(sorted(set(exts)))

    def validate_currency(self, value):
        value = (value or "").strip().upper()
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError("Valyuta 3 harfli kod bo'lishi kerak (masalan UZS).")
        return value


class PublicSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings
        fields = (
            "center_name",
            "currency",
            "attendance_excused_policy",
            "attendance_late_counts_present",
            "max_upload_mb",
            "allowed_upload_extensions",
        )
        read_only_fields = fields
