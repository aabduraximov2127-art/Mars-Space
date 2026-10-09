from rest_framework import serializers

from groups.models import Group
from schedules.models import Lesson

from .models import Assignment, AssignmentStatus, AssignmentSubmission, SubmissionRevision


class RevisionSerializer(serializers.ModelSerializer):
    has_file = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionRevision
        fields = ("id", "number", "text", "file_name", "file_size", "has_file", "link", "is_late", "submitted_at")
        read_only_fields = fields

    def get_has_file(self, obj) -> bool:
        return bool(obj.file)


class SubmissionSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    assignment_title = serializers.CharField(source="assignment.title", read_only=True)
    max_score = serializers.IntegerField(source="assignment.max_score", read_only=True)
    group = serializers.IntegerField(source="assignment.group_id", read_only=True)
    group_name = serializers.CharField(source="assignment.group.name", read_only=True)
    revisions = RevisionSerializer(many=True, read_only=True)
    grade = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentSubmission
        fields = (
            "id",
            "assignment",
            "assignment_title",
            "max_score",
            "group",
            "group_name",
            "student",
            "student_name",
            "status",
            "revision_count",
            "last_submitted_at",
            "is_late",
            "feedback",
            "reviewed_at",
            "grade",
            "revisions",
        )
        read_only_fields = fields

    def get_grade(self, obj) -> dict | None:
        g = getattr(obj, "grade", None)
        if g is None:
            return None
        return {"id": g.pk, "score": str(g.score), "max_score": str(g.max_score), "comment": g.comment}


class AssignmentSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True)
    group_code = serializers.CharField(source="group.code", read_only=True)
    course_name = serializers.CharField(source="group.course.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)
    has_attachment = serializers.SerializerMethodField()
    submissions_count = serializers.IntegerField(read_only=True, default=None)
    pending_review_count = serializers.IntegerField(read_only=True, default=None)
    my_submission = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = (
            "id",
            "group",
            "group_name",
            "group_code",
            "course_name",
            "lesson",
            "title",
            "description",
            "grading_criteria",
            "max_score",
            "due_at",
            "allow_late",
            "has_attachment",
            "attachment_name",
            "link",
            "status",
            "published_at",
            "created_by",
            "created_by_name",
            "submissions_count",
            "pending_review_count",
            "my_submission",
            "created_at",
        )
        read_only_fields = fields

    def get_has_attachment(self, obj) -> bool:
        return bool(obj.attachment)

    def get_my_submission(self, obj) -> dict | None:
        mine = self.context.get("my_submissions")
        if mine is None:
            return None
        s = mine.get(obj.pk)
        if s is None:
            return {"status": "not_submitted"}
        grade = getattr(s, "grade", None)
        return {
            "id": s.pk,
            "status": s.status,
            "is_late": s.is_late,
            "last_submitted_at": s.last_submitted_at,
            "score": str(grade.score) if grade else None,
        }


class AssignmentWriteSerializer(serializers.Serializer):
    group = serializers.PrimaryKeyRelatedField(queryset=Group.objects.all())
    lesson = serializers.PrimaryKeyRelatedField(queryset=Lesson.objects.all(), required=False, allow_null=True)
    title = serializers.CharField(max_length=200)
    description = serializers.CharField()
    grading_criteria = serializers.CharField(required=False, allow_blank=True, default="")
    max_score = serializers.IntegerField(min_value=1, max_value=1000, default=100)
    due_at = serializers.DateTimeField()
    allow_late = serializers.BooleanField(default=True)
    attachment = serializers.FileField(required=False, allow_null=True)
    link = serializers.URLField(required=False, allow_blank=True, default="")
    status = serializers.ChoiceField(
        choices=[(AssignmentStatus.DRAFT, "draft"), (AssignmentStatus.PUBLISHED, "published")],
        default=AssignmentStatus.DRAFT,
    )


class AssignmentUpdateSerializer(serializers.Serializer):
    lesson = serializers.PrimaryKeyRelatedField(queryset=Lesson.objects.all(), required=False, allow_null=True)
    title = serializers.CharField(max_length=200, required=False)
    description = serializers.CharField(required=False)
    grading_criteria = serializers.CharField(required=False, allow_blank=True)
    max_score = serializers.IntegerField(min_value=1, max_value=1000, required=False)
    due_at = serializers.DateTimeField(required=False)
    allow_late = serializers.BooleanField(required=False)
    attachment = serializers.FileField(required=False, allow_null=True)
    link = serializers.URLField(required=False, allow_blank=True)


class SubmitSerializer(serializers.Serializer):
    assignment = serializers.PrimaryKeyRelatedField(queryset=Assignment.objects.all())
    text = serializers.CharField(required=False, allow_blank=True, max_length=10000, default="")
    file = serializers.FileField(required=False, allow_null=True)
    link = serializers.URLField(required=False, allow_blank=True, default="")


class FeedbackSerializer(serializers.Serializer):
    feedback = serializers.CharField(max_length=5000)


class GradeSubmissionSerializer(serializers.Serializer):
    score = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)
    comment = serializers.CharField(required=False, allow_blank=True, default="", max_length=5000)
