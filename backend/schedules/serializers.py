from rest_framework import serializers

from accounts.models import User
from core.roles import TE
from groups.models import Group
from organizations.models import Room

from .models import Lesson


class LessonSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    group_code = serializers.CharField(source="group.code", read_only=True)
    course_name = serializers.CharField(source="group.course.name", read_only=True)
    branch = serializers.IntegerField(source="group.branch_id", read_only=True)
    branch_name = serializers.CharField(source="group.branch.name", read_only=True)
    teacher_name = serializers.CharField(source="teacher.full_name", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True, default=None)
    attendance_marked = serializers.BooleanField(read_only=True, default=False)

    class Meta:
        model = Lesson
        fields = (
            "id",
            "group",
            "group_name",
            "group_code",
            "course_name",
            "branch",
            "branch_name",
            "teacher",
            "teacher_name",
            "room",
            "room_name",
            "date",
            "start_time",
            "end_time",
            "topic",
            "status",
            "cancel_reason",
            "notes",
            "attendance_marked",
            "created_at",
        )
        read_only_fields = fields


class LessonCreateSerializer(serializers.Serializer):
    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    date = serializers.DateField()
    start_time = serializers.TimeField()
    end_time = serializers.TimeField()
    teacher = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=TE), required=False, allow_null=True)
    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all(), required=False, allow_null=True)
    topic = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")


class LessonUpdateSerializer(serializers.Serializer):
    date = serializers.DateField(required=False)
    start_time = serializers.TimeField(required=False)
    end_time = serializers.TimeField(required=False)
    teacher = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=TE), required=False)
    room = serializers.PrimaryKeyRelatedField(queryset=Room.objects.all(), required=False, allow_null=True)
    topic = serializers.CharField(max_length=255, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255)
