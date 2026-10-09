from django.conf import settings
from rest_framework import serializers

from core.files import validate_avatar
from core.roles import SA, Role
from core.validators import normalize_email, normalize_phone, validate_phone
from organizations.models import Branch

from .models import User, UserProfile


class PhoneField(serializers.CharField):
    def __init__(self, **kwargs):
        kwargs.setdefault("max_length", 32)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = normalize_phone(super().to_internal_value(data))
        try:
            validate_phone(value)
        except Exception as exc:  # django ValidationError -> DRF message
            raise serializers.ValidationError(getattr(exc, "messages", [str(exc)])) from exc
        return value


class ProfileSerializer(serializers.ModelSerializer):
    """Full profile (staff view) including internal notes."""

    parent_phone = PhoneField(required=False, allow_blank=True)

    class Meta:
        model = UserProfile
        fields = ("birth_date", "parent_name", "parent_phone", "specialization", "bio", "notes")


class PublicProfileSerializer(serializers.ModelSerializer):
    """Profile without internal admin notes."""

    class Meta:
        model = UserProfile
        fields = ("birth_date", "parent_name", "parent_phone", "specialization", "bio")
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    """Read representation for staff (superadmin/admin) user management."""

    full_name = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    profile = ProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "phone",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "branch",
            "branch_name",
            "avatar",
            "is_active",
            "must_change_password",
            "deactivated_at",
            "last_login",
            "created_at",
            "profile",
        )
        read_only_fields = fields


class StudentForTeacherSerializer(serializers.ModelSerializer):
    """What a teacher may see about students of their own groups."""

    full_name = serializers.CharField(read_only=True)
    profile = PublicProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "phone",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "avatar",
            "is_active",
            "profile",
        )
        read_only_fields = fields


class MeSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    profile = PublicProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "phone",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "role",
            "branch",
            "branch_name",
            "avatar",
            "is_active",
            "must_change_password",
            "last_login",
            "created_at",
            "profile",
        )
        read_only_fields = fields


class MeUpdateSerializer(serializers.Serializer):
    """Self-service profile edits. Role, branch, phone and status are never writable here.

    Names are writable only for staff (students/teachers have official names managed by admins).
    Teachers may edit their public ``specialization``/``bio``.
    """

    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    email = serializers.EmailField(required=False, allow_blank=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    specialization = serializers.CharField(max_length=150, required=False, allow_blank=True)
    bio = serializers.CharField(max_length=1000, required=False, allow_blank=True)

    def validate(self, attrs):
        user = self.context["request"].user
        if user.role not in (Role.SUPERADMIN, Role.ADMIN):
            for name_field in ("first_name", "last_name"):
                if name_field in attrs:
                    raise serializers.ValidationError(
                        {name_field: ["Ism-familiyani faqat administrator o'zgartira oladi."]}
                    )
        if user.role != Role.TEACHER:
            for teacher_field in ("specialization", "bio"):
                attrs.pop(teacher_field, None)
        if "email" in attrs:
            email = normalize_email(attrs["email"])
            if email and User.objects.filter(email=email).exclude(pk=user.pk).exists():
                raise serializers.ValidationError({"email": ["Bu email bilan foydalanuvchi mavjud."]})
            attrs["email"] = email
        if attrs.get("avatar"):
            validate_avatar(attrs["avatar"], max_bytes=settings.AVATAR_MAX_BYTES)
        return attrs


class UserWriteSerializer(serializers.Serializer):
    """Create/update payload for user management. ``role``/``branch`` only on create."""

    phone = PhoneField()
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    role = serializers.ChoiceField(choices=Role.choices)
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.all(), required=False, allow_null=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    avatar = serializers.ImageField(required=False, allow_null=True)
    profile = ProfileSerializer(required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:  # update: identity/role fields are not editable here
            for name in ("role", "branch", "password"):
                self.fields.pop(name, None)

    def validate_email(self, value):
        email = normalize_email(value)
        if email:
            qs = User.objects.filter(email=email)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError("Bu email bilan foydalanuvchi mavjud.")
        return email

    def validate_phone(self, value):
        qs = User.objects.filter(phone=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Bu telefon raqam bilan foydalanuvchi mavjud.")
        return value

    def validate_avatar(self, value):
        if value:
            validate_avatar(value, max_bytes=settings.AVATAR_MAX_BYTES)
        return value

    def validate(self, attrs):
        request = self.context["request"]
        profile = attrs.get("profile") or {}
        if request.user.role != SA and self.instance is None and attrs.get("role") == SA:
            raise serializers.ValidationError({"role": ["Bu rolni tanlashga ruxsat yo'q."]})
        if "notes" in profile and request.user.role not in (Role.SUPERADMIN, Role.ADMIN):
            profile.pop("notes")
        return attrs


class BlockSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class SetPasswordSerializer(serializers.Serializer):
    new_password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False, write_only=True)


class TemporaryPasswordSerializer(serializers.Serializer):
    temporary_password = serializers.CharField(allow_null=True)


class ChangeRoleSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices)
    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True), required=False, allow_null=True
    )


class UserCreatedSerializer(UserSerializer):
    temporary_password = serializers.CharField(read_only=True, allow_null=True)

    class Meta(UserSerializer.Meta):
        fields = (*UserSerializer.Meta.fields, "temporary_password")
        read_only_fields = fields


# --- auth payloads ----------------------------------------------------------------------------


class LoginSerializer(serializers.Serializer):
    login = serializers.CharField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class AccessTokenSerializer(serializers.Serializer):
    access = serializers.CharField()


class LoginResponseSerializer(AccessTokenSerializer):
    user = MeSerializer()


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(trim_whitespace=False, write_only=True)
    new_password = serializers.CharField(trim_whitespace=False, write_only=True)


class PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False, write_only=True)


class DetailSerializer(serializers.Serializer):
    detail = serializers.CharField()
