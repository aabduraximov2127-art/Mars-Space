"""Assignment lifecycle, student submissions (with revisions) and teacher review/grading."""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from audit.services import record as audit
from core.exceptions import BusinessRuleError
from core.files import validate_upload
from core.permissions import require
from core.roles import TE
from groups.models import MembershipStatus
from groups.selectors import is_active_member
from notifications.services import NotificationType, notify

from .models import Assignment, AssignmentStatus, AssignmentSubmission, SubmissionRevision, SubmissionStatus
from .selectors import can_manage_assignment

EDITABLE = ("title", "description", "grading_criteria", "max_score", "due_at", "allow_late", "link", "lesson")


def _active_students(group):
    return [m.student for m in group.memberships.select_related("student").filter(status=MembershipStatus.ACTIVE)]


def _notify_published(assignment: Assignment) -> None:
    notify(
        _active_students(assignment.group),
        NotificationType.ASSIGNMENT_NEW,
        f"Yangi vazifa: {assignment.title}",
        f"Muddat: {timezone.localtime(assignment.due_at):%d.%m.%Y %H:%M}",
        link=f"/assignments/{assignment.pk}",
        data={"assignment_id": assignment.pk},
    )


@transaction.atomic
def create_assignment(actor, *, group, data: dict, attachment=None, request=None) -> Assignment:
    probe = Assignment(group=group)
    require(can_manage_assignment(actor, probe), "Bu guruhga vazifa berishga ruxsat yo'q.")
    if group.status in ("completed", "cancelled"):
        raise BusinessRuleError("Yakunlangan guruhga vazifa berib bo'lmaydi.", code="group_closed")
    lesson = data.get("lesson")
    if lesson is not None and lesson.group_id != group.pk:
        raise BusinessRuleError("Dars boshqa guruhga tegishli.", code="invalid_lesson")
    validate_upload(attachment, field="attachment")
    status = data.pop("status", AssignmentStatus.DRAFT)
    assignment = Assignment.objects.create(
        group=group,
        created_by=actor,
        attachment=attachment or "",
        attachment_name=(attachment.name if attachment else "")[:255],
        status=status,
        published_at=timezone.now() if status == AssignmentStatus.PUBLISHED else None,
        **{k: v for k, v in data.items() if k in EDITABLE},
    )
    audit("create", actor=actor, obj=assignment, branch=group.branch_id, request=request)
    if status == AssignmentStatus.PUBLISHED:
        _notify_published(assignment)
    return assignment


@transaction.atomic
def update_assignment(actor, assignment: Assignment, data: dict, attachment=None, request=None) -> Assignment:
    a = Assignment.objects.select_for_update().select_related("group").get(pk=assignment.pk)
    require(can_manage_assignment(actor, a), "Bu vazifani o'zgartirishga ruxsat yo'q.")
    if "max_score" in data and data["max_score"] != a.max_score and a.grades.exists():
        raise BusinessRuleError(
            "Baholangan topshiriqlar bor — maksimal ballni o'zgartirib bo'lmaydi.", code="has_grades"
        )
    lesson = data.get("lesson")
    if lesson is not None and lesson.group_id != a.group_id:
        raise BusinessRuleError("Dars boshqa guruhga tegishli.", code="invalid_lesson")
    before = {f: getattr(a, f) for f in EDITABLE}
    for k, v in data.items():
        if k in EDITABLE:
            setattr(a, k, v)
    if attachment:
        validate_upload(attachment, field="attachment")
        a.attachment = attachment
        a.attachment_name = attachment.name[:255]
    a.save()
    changes = {k: [before[k], getattr(a, k)] for k in EDITABLE if before[k] != getattr(a, k)}
    if changes or attachment:
        audit("update", actor=actor, obj=a, changes=changes, branch=a.group.branch_id, request=request)
    return a


@transaction.atomic
def publish(actor, assignment: Assignment, request=None) -> Assignment:
    a = Assignment.objects.select_for_update().select_related("group").get(pk=assignment.pk)
    require(can_manage_assignment(actor, a))
    if a.status != AssignmentStatus.DRAFT:
        raise BusinessRuleError("Faqat qoralamani e'lon qilish mumkin.", code="invalid_status")
    a.status = AssignmentStatus.PUBLISHED
    a.published_at = timezone.now()
    a.save(update_fields=["status", "published_at", "updated_at"])
    audit("assignment_publish", actor=actor, obj=a, branch=a.group.branch_id, request=request)
    _notify_published(a)
    return a


@transaction.atomic
def close(actor, assignment: Assignment, request=None) -> Assignment:
    a = Assignment.objects.select_for_update().select_related("group").get(pk=assignment.pk)
    require(can_manage_assignment(actor, a))
    if a.status != AssignmentStatus.PUBLISHED:
        raise BusinessRuleError("Faqat e'lon qilingan vazifani yopish mumkin.", code="invalid_status")
    a.status = AssignmentStatus.CLOSED
    a.save(update_fields=["status", "updated_at"])
    audit("assignment_close", actor=actor, obj=a, branch=a.group.branch_id, request=request)
    return a


@transaction.atomic
def delete(actor, assignment: Assignment, request=None) -> None:
    require(can_manage_assignment(actor, assignment))
    if assignment.submissions.exists():
        raise BusinessRuleError("Topshiriqlari bor vazifani o'chirib bo'lmaydi — uni yoping.", code="has_submissions")
    audit("delete", actor=actor, obj=assignment, branch=assignment.group.branch_id, request=request)
    if assignment.attachment:
        assignment.attachment.delete(save=False)
    assignment.delete()


# --- submissions ---------------------------------------------------------------------------------


@transaction.atomic
def submit(student, assignment: Assignment, *, text: str = "", file=None, link: str = "", request=None):
    assignment = Assignment.objects.select_related("group").get(pk=assignment.pk)
    if assignment.status != AssignmentStatus.PUBLISHED:
        raise BusinessRuleError("Bu vazifa topshirish uchun ochiq emas.", code="assignment_closed")
    if not is_active_member(student, assignment.group):
        raise BusinessRuleError("Siz bu guruhning faol a'zosi emassiz.", code="not_member")
    if not (text or file or link):
        raise BusinessRuleError("Matn, fayl yoki havoladan kamida bittasini yuboring.", code="empty_submission")
    validate_upload(file, field="file")
    now = timezone.now()
    is_late = now > assignment.due_at
    if is_late and not assignment.allow_late:
        raise BusinessRuleError("Topshirish muddati tugagan.", code="deadline_passed")

    submission = AssignmentSubmission.objects.select_for_update().filter(assignment=assignment, student=student).first()
    if submission is None:
        submission = AssignmentSubmission.objects.create(
            assignment=assignment, student=student, last_submitted_at=now, is_late=is_late, revision_count=0
        )
    elif submission.status in (SubmissionStatus.GRADED, SubmissionStatus.UNDER_REVIEW):
        raise BusinessRuleError(
            "Ish tekshirilmoqda yoki baholangan — qayta yuborib bo'lmaydi.", code="submission_locked"
        )
    number = submission.revision_count + 1
    SubmissionRevision.objects.create(
        submission=submission,
        number=number,
        text=text or "",
        file=file or "",
        file_name=(file.name if file else "")[:255],
        file_size=file.size if file else None,
        link=link or "",
        is_late=is_late,
    )
    submission.revision_count = number
    submission.last_submitted_at = now
    submission.is_late = is_late
    submission.status = SubmissionStatus.SUBMITTED
    submission.save()
    audit(
        "submission",
        actor=student,
        obj=submission,
        changes={"revision": number, "is_late": is_late},
        branch=assignment.group.branch_id,
        request=request,
    )
    if assignment.group.teacher_id:
        notify(
            [assignment.group.teacher],
            NotificationType.SUBMISSION_NEW,
            f"Yangi topshiriq: {assignment.title}",
            f"{student.full_name} ish yubordi (v{number}).",
            link=f"/assignments/{assignment.pk}",
            data={"submission_id": submission.pk},
        )
    return submission


def _lock_submission(user, submission) -> AssignmentSubmission:
    s = (
        AssignmentSubmission.objects.select_for_update()
        .select_related("assignment", "assignment__group", "student")
        .get(pk=submission.pk)
    )
    require(
        user.role == TE and s.assignment.group.teacher_id == user.pk,
        "Faqat guruh ustozi topshiriqni tekshira oladi.",
    )
    return s


@transaction.atomic
def start_review(user, submission, request=None):
    s = _lock_submission(user, submission)
    if s.status != SubmissionStatus.SUBMITTED:
        raise BusinessRuleError("Faqat yangi topshirilgan ishni tekshirishni boshlash mumkin.", code="invalid_status")
    s.status = SubmissionStatus.UNDER_REVIEW
    s.reviewed_by = user
    s.save(update_fields=["status", "reviewed_by", "updated_at"])
    return s


@transaction.atomic
def request_revision(user, submission, feedback: str, request=None):
    s = _lock_submission(user, submission)
    if s.status not in (SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW):
        raise BusinessRuleError("Bu holatdagi ishni qayta ishlashga yuborib bo'lmaydi.", code="invalid_status")
    s.status = SubmissionStatus.NEEDS_REVISION
    s.feedback = feedback
    s.reviewed_by = user
    s.reviewed_at = timezone.now()
    s.save(update_fields=["status", "feedback", "reviewed_by", "reviewed_at", "updated_at"])
    audit(
        "request_revision",
        actor=user,
        obj=s,
        changes={"feedback": feedback},
        branch=s.assignment.group.branch_id,
        request=request,
    )
    notify(
        [s.student],
        NotificationType.REVISION_REQUESTED,
        f"Qayta ishlash kerak: {s.assignment.title}",
        feedback[:300],
        link=f"/assignments/{s.assignment_id}",
        data={"submission_id": s.pk},
    )
    return s


@transaction.atomic
def grade(user, submission, score: Decimal, comment: str = "", request=None):
    from grades.models import Grade, GradeChange

    s = _lock_submission(user, submission)
    max_score = Decimal(s.assignment.max_score)
    if score < 0 or score > max_score:
        raise BusinessRuleError(f"Ball 0 dan {s.assignment.max_score} gacha bo'lishi kerak.", code="invalid_score")
    g = Grade.objects.select_for_update().filter(submission=s).first()
    if g is None:
        g = Grade.objects.create(
            submission=s,
            assignment=s.assignment,
            student=s.student,
            group=s.assignment.group,
            score=score,
            max_score=max_score,
            comment=comment,
            graded_by=user,
        )
        GradeChange.objects.create(grade=g, previous_score=None, new_score=score, new_comment=comment, changed_by=user)
    else:
        GradeChange.objects.create(
            grade=g,
            previous_score=g.score,
            new_score=score,
            previous_comment=g.comment,
            new_comment=comment,
            changed_by=user,
        )
        g.score, g.comment, g.graded_by, g.max_score = score, comment, user, max_score
        g.save()
    s.status = SubmissionStatus.GRADED
    s.feedback = comment
    s.reviewed_by = user
    s.reviewed_at = timezone.now()
    s.save(update_fields=["status", "feedback", "reviewed_by", "reviewed_at", "updated_at"])
    audit("grade", actor=user, obj=g, changes={"score": score}, branch=s.assignment.group.branch_id, request=request)
    notify(
        [s.student],
        NotificationType.ASSIGNMENT_GRADED,
        f"Vazifa baholandi: {s.assignment.title}",
        f"Ball: {score}/{s.assignment.max_score}",
        link=f"/assignments/{s.assignment_id}",
        data={"submission_id": s.pk, "grade_id": g.pk},
    )
    return g
