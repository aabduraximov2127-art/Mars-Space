from rest_framework import serializers

from .models import AttendanceChange, AttendanceRecord, AttendanceStatus


class AttendanceRecordSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    group = serializers.IntegerField(source="lesson.group_id", read_only=True)
    group_name = serializers.CharField(source="lesson.group.name", read_only=True)
    date = serializers.DateField(source="lesson.date", read_only=True)
    start_time = serializers.TimeField(source="lesson.start_time", read_only=True)
    topic = serializers.CharField(source="lesson.topic", read_only=True)
    marked_by_name = serializers.CharField(source="marked_by.full_name", read_only=True, default=None)

    class Meta:
        model = AttendanceRecord
        fields = (
            "id",
            "lesson",
            "group",
            "group_name",
            "date",
            "start_time",
            "topic",
            "student",
            "student_name",
            "status",
            "comment",
            "marked_by",
            "marked_by_name",
            "updated_at",
        )
        read_only_fields = fields


class AttendanceChangeSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source="changed_by.full_name", read_only=True, default=None)

    class Meta:
        model = AttendanceChange
        fields = ("id", "previous_status", "new_status", "changed_by", "changed_by_name", "reason", "changed_at")
        read_only_fields = fields


class MarkRowSerializer(serializers.Serializer):
    student = serializers.IntegerField()
    status = serializers.ChoiceField(choices=AttendanceStatus.choices)
    comment = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class MarkSerializer(serializers.Serializer):
    records = MarkRowSerializer(many=True, allow_empty=False)
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class SummarySerializer(serializers.Serializer):
    present = serializers.IntegerField()
    absent = serializers.IntegerField()
    late = serializers.IntegerField()
    excused = serializers.IntegerField()
    marked = serializers.IntegerField()
    total_lessons = serializers.IntegerField()
    rate = serializers.FloatField(allow_null=True)
