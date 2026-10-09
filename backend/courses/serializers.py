from rest_framework import serializers

from .models import Course, CourseMaterial


class CourseSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source="branch.name", read_only=True, default=None)
    groups_count = serializers.IntegerField(read_only=True, default=0)
    code = serializers.CharField(max_length=20)

    class Meta:
        model = Course
        fields = (
            "id",
            "name",
            "code",
            "description",
            "branch",
            "branch_name",
            "duration_months",
            "lessons_per_week",
            "lesson_duration_minutes",
            "monthly_price",
            "is_active",
            "groups_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "branch_name", "groups_count", "created_at", "updated_at")
        extra_kwargs = {"branch": {"required": False}}

    def validate_code(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Kod majburiy.")
        qs = Course.objects.filter(code=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Bu kodli kurs mavjud.")
        return value

    def validate_monthly_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Narx manfiy bo'lishi mumkin emas.")
        return value


class CourseMaterialSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True, required=False, allow_null=True)
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = CourseMaterial
        fields = (
            "id",
            "course",
            "title",
            "description",
            "file",
            "file_name",
            "has_file",
            "url",
            "order",
            "created_at",
        )
        read_only_fields = ("id", "course", "file_name", "has_file", "created_at")

    def get_has_file(self, obj) -> bool:
        return bool(obj.file)

    def validate(self, attrs):
        file = attrs.get("file", getattr(self.instance, "file", None))
        url = attrs.get("url", getattr(self.instance, "url", ""))
        if not file and not url:
            raise serializers.ValidationError({"url": ["Fayl yoki havoladan kamida bittasi kerak."]})
        return attrs
