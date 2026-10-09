"""Dashboard KPIs and reports — the single implementation of ARCHITECTURE.md §9 formulas."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth
from django.utils import timezone

from accounts.models import User
from assignments.models import Assignment, AssignmentStatus, AssignmentSubmission, SubmissionStatus
from attendance.calculations import summarize
from attendance.models import AttendanceRecord
from audit.models import AuditLog
from core.roles import AD, SA, ST, TE
from courses.models import Course
from grades.models import Grade
from groups.models import OPEN_MEMBERSHIP_STATUSES, Group, GroupMembership, GroupStatus
from organizations.models import Branch, SystemSettings
from payments.calculations import totals
from payments.models import Payment, PaymentStatus
from rewards.models import RewardTransaction
from schedules.models import Lesson, LessonStatus

ZERO = Decimal("0.00")


def month_start(d: dt.date) -> dt.date:
    return d.replace(day=1)


def add_months(d: dt.date, n: int) -> dt.date:
    y, m = divmod(d.month - 1 + n, 12)
    return dt.date(d.year + y, m + 1, 1)


class Scope:
    """Filters shared by SA/AD dashboards and reports."""

    def __init__(self, user, params):
        today = timezone.localdate()
        self.user = user
        self.date_from = _date(params.get("date_from")) or month_start(today)
        self.date_to = _date(params.get("date_to")) or today
        self.branch_id = user.branch_id if user.role == AD else _int(params.get("branch"))
        self.course_id = _int(params.get("course"))
        self.group_id = _int(params.get("group"))

    def groups(self):
        qs = Group.objects.all()
        if self.user.role == TE:
            qs = qs.filter(teacher=self.user)
        if self.branch_id:
            qs = qs.filter(branch_id=self.branch_id)
        if self.course_id:
            qs = qs.filter(course_id=self.course_id)
        if self.group_id:
            qs = qs.filter(pk=self.group_id)
        return qs

    def memberships(self):
        return GroupMembership.objects.filter(group__in=self.groups())

    def payments(self):
        return Payment.objects.filter(
            status=PaymentStatus.COMPLETED,
            membership__group__in=self.groups(),
        )

    def lessons(self):
        return Lesson.objects.filter(group__in=self.groups())

    @property
    def filtered(self) -> bool:
        return bool(self.course_id or self.group_id)


def _date(value):
    try:
        return dt.date.fromisoformat(value) if value else None
    except ValueError:
        return None


def _int(value):
    return int(value) if value and str(value).isdigit() else None


def _money(v) -> str:
    return str((v or ZERO).quantize(Decimal("0.01")))


# --- staff dashboard -------------------------------------------------------------------------


def staff_dashboard(user, params) -> dict:
    s = Scope(user, params)
    today = timezone.localdate()
    conf = SystemSettings.load()

    students = User.objects.filter(role=ST, is_active=True)
    if s.branch_id:
        students = students.filter(branch_id=s.branch_id)
    if s.filtered:
        students = students.filter(memberships__group__in=s.groups(), memberships__status__in=OPEN_MEMBERSHIP_STATUSES)
    teachers = User.objects.filter(role=TE, is_active=True)
    if s.branch_id:
        teachers = teachers.filter(branch_id=s.branch_id)
    courses = Course.objects.filter(is_active=True)
    if s.branch_id:
        courses = courses.filter(Q(branch__isnull=True) | Q(branch_id=s.branch_id))

    today_lessons = s.lessons().filter(date=today).exclude(status=LessonStatus.CANCELLED)
    today_att = summarize(AttendanceRecord.objects.filter(lesson__in=today_lessons), conf)
    marked_today = today_lessons.filter(attendance_records__isnull=False).distinct().count()

    period_payments = s.payments().filter(paid_at__date__gte=s.date_from, paid_at__date__lte=s.date_to)
    revenue = period_payments.aggregate(t=Sum("amount"))["t"] or ZERO
    debt = totals(s.memberships())

    new_memberships = s.memberships().filter(joined_at__gte=s.date_from, joined_at__lte=s.date_to).count()

    revenue_by_day = [
        {"date": r["d"], "amount": _money(r["t"])}
        for r in period_payments.annotate(d=TruncDate("paid_at")).values("d").annotate(t=Sum("amount")).order_by("d")
    ]
    six_months_ago = add_months(month_start(today), -5)
    revenue_by_month = {
        r["m"].date() if hasattr(r["m"], "date") else r["m"]: r["t"]
        for r in s.payments()
        .filter(paid_at__date__gte=six_months_ago)
        .annotate(m=TruncMonth("paid_at"))
        .values("m")
        .annotate(t=Sum("amount"))
    }
    joins_by_month = {
        r["m"]: r["c"]
        for r in s.memberships()
        .filter(joined_at__gte=six_months_ago)
        .annotate(m=TruncMonth("joined_at"))
        .values("m")
        .annotate(c=Count("id"))
    }
    months = [add_months(six_months_ago, i) for i in range(6)]
    monthly = [
        {
            "month": m.strftime("%Y-%m"),
            "revenue": _money(revenue_by_month.get(m)),
            "new_students": joins_by_month.get(m, 0),
        }
        for m in months
    ]

    week_start = today - dt.timedelta(days=today.weekday())
    weekly_attendance = []
    for i in range(7, -1, -1):
        start = week_start - dt.timedelta(weeks=i)
        end = start + dt.timedelta(days=6)
        recs = AttendanceRecord.objects.filter(lesson__in=s.lessons(), lesson__date__gte=start, lesson__date__lte=end)
        weekly_attendance.append({"week": start, "rate": summarize(recs, conf)["rate"]})

    activity = AuditLog.objects.select_related("actor").exclude(action__in=("login", "logout", "login_failed"))
    if s.branch_id:
        activity = activity.filter(branch_id=s.branch_id)
    recent = [
        {
            "id": a.pk,
            "action": a.action,
            "actor_name": a.actor.full_name if a.actor else "Tizim",
            "entity_type": a.entity_type,
            "entity_repr": a.entity_repr,
            "created_at": a.created_at,
        }
        for a in activity[:10]
    ]

    data = {
        "role": user.role,
        "filters": {
            "date_from": s.date_from,
            "date_to": s.date_to,
            "branch": s.branch_id,
            "course": s.course_id,
            "group": s.group_id,
        },
        "kpis": {
            "students": students.distinct().count(),
            "teachers": teachers.count(),
            "active_groups": s.groups().filter(status=GroupStatus.ACTIVE).count(),
            "courses": courses.count(),
            "today_lessons": today_lessons.count(),
            "today_lessons_marked": marked_today,
            "today_attendance_rate": today_att["rate"],
            "revenue": _money(revenue),
            "payments_count": period_payments.count(),
            "total_debt": _money(debt["total_debt"]),
            "debtors": debt["debtors_count"],
            "new_memberships": new_memberships,
        },
        "charts": {
            "revenue_by_day": revenue_by_day,
            "monthly": monthly,
            "weekly_attendance": weekly_attendance,
        },
        "recent_activity": recent,
    }
    if user.role == SA and not s.branch_id:
        data["branches"] = branch_breakdown(s)
    return data


def branch_breakdown(s: Scope) -> list[dict]:
    rows = []
    for b in Branch.objects.filter(is_active=True).order_by("name"):
        ms = GroupMembership.objects.filter(group__branch=b)
        revenue = (
            Payment.objects.filter(
                status=PaymentStatus.COMPLETED,
                membership__group__branch=b,
                paid_at__date__gte=s.date_from,
                paid_at__date__lte=s.date_to,
            ).aggregate(t=Sum("amount"))["t"]
            or ZERO
        )
        rows.append(
            {
                "id": b.pk,
                "name": b.name,
                "students": User.objects.filter(role=ST, is_active=True, branch=b).count(),
                "active_groups": Group.objects.filter(branch=b, status=GroupStatus.ACTIVE).count(),
                "revenue": _money(revenue),
                "debt": _money(totals(ms)["total_debt"]),
            }
        )
    return rows


# --- teacher dashboard -----------------------------------------------------------------------


def _lesson_row(lesson: Lesson) -> dict:
    return {
        "id": lesson.pk,
        "group": lesson.group_id,
        "group_name": lesson.group.name,
        "date": lesson.date,
        "start_time": lesson.start_time,
        "end_time": lesson.end_time,
        "room_name": lesson.room.name if lesson.room else None,
        "topic": lesson.topic,
        "status": lesson.status,
    }


def teacher_dashboard(user) -> dict:
    today = timezone.localdate()
    now = timezone.localtime()
    conf = SystemSettings.load()
    my_lessons = Lesson.objects.filter(Q(teacher=user) | Q(group__teacher=user)).select_related("group", "room")
    today_lessons = my_lessons.filter(date=today).exclude(status=LessonStatus.CANCELLED).order_by("start_time")
    unmarked = (
        my_lessons.exclude(status=LessonStatus.CANCELLED)
        .filter(Q(date__lt=today) | Q(date=today, start_time__lte=now.time()))
        .filter(date__gte=today - dt.timedelta(days=30))
        .filter(attendance_records__isnull=True)
        .order_by("-date", "-start_time")
    )
    pending = (
        AssignmentSubmission.objects.filter(
            assignment__group__teacher=user,
            status__in=(SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW),
        )
        .select_related("assignment", "student")
        .order_by("last_submitted_at")
    )
    groups = (
        Group.objects.filter(teacher=user)
        .exclude(status__in=(GroupStatus.COMPLETED, GroupStatus.CANCELLED))
        .select_related("course")
        .annotate(students_count=Count("memberships", filter=Q(memberships__status="active"), distinct=True))
    )
    att = summarize(
        AttendanceRecord.objects.filter(lesson__group__teacher=user, lesson__date__gte=today - dt.timedelta(days=30)),
        conf,
    )
    week_end = today + dt.timedelta(days=7)
    return {
        "role": TE,
        "kpis": {
            "groups": groups.count(),
            "students": GroupMembership.objects.filter(group__teacher=user, status="active")
            .values("student")
            .distinct()
            .count(),
            "today_lessons": today_lessons.count(),
            "unmarked_lessons": unmarked.count(),
            "pending_reviews": pending.count(),
            "week_lessons": my_lessons.filter(date__gte=today, date__lte=week_end)
            .exclude(status=LessonStatus.CANCELLED)
            .count(),
            "attendance_rate_30d": att["rate"],
        },
        "today_lessons": [_lesson_row(lesson) for lesson in today_lessons],
        "unmarked_lessons": [_lesson_row(lesson) for lesson in unmarked.distinct()[:8]],
        "pending_reviews": [
            {
                "id": s.pk,
                "assignment": s.assignment_id,
                "assignment_title": s.assignment.title,
                "student_name": s.student.full_name,
                "submitted_at": s.last_submitted_at,
                "is_late": s.is_late,
                "status": s.status,
            }
            for s in pending[:8]
        ],
        "groups": [
            {
                "id": g.pk,
                "name": g.name,
                "code": g.code,
                "course_name": g.course.name,
                "students_count": g.students_count,
                "days_of_week": g.days_of_week,
                "lesson_start_time": g.lesson_start_time,
                "lesson_end_time": g.lesson_end_time,
            }
            for g in groups
        ],
    }


# --- student dashboard -----------------------------------------------------------------------


def student_dashboard(user) -> dict:
    from payments.calculations import balance_of, with_balances

    today = timezone.localdate()
    conf = SystemSettings.load()
    open_ms = user.memberships.filter(status__in=OPEN_MEMBERSHIP_STATUSES).select_related(
        "group", "group__course", "group__teacher"
    )
    group_ids = [m.group_id for m in open_ms]
    upcoming = (
        Lesson.objects.filter(group_id__in=group_ids, date__gte=today)
        .exclude(status=LessonStatus.CANCELLED)
        .select_related("group", "room")
        .order_by("date", "start_time")[:6]
    )
    att = summarize(AttendanceRecord.objects.filter(student=user), conf)
    subs = {s.assignment_id: s for s in AssignmentSubmission.objects.filter(student=user)}
    open_assignments = Assignment.objects.filter(group_id__in=group_ids, status=AssignmentStatus.PUBLISHED).order_by(
        "due_at"
    )
    todo = []
    for a in open_assignments:
        s = subs.get(a.pk)
        if s is None or s.status == SubmissionStatus.NEEDS_REVISION:
            todo.append(
                {
                    "id": a.pk,
                    "title": a.title,
                    "group_name": a.group.name,
                    "due_at": a.due_at,
                    "status": s.status if s else "not_submitted",
                    "overdue": a.due_at < timezone.now(),
                }
            )
    grades = Grade.objects.filter(student=user).select_related("assignment").order_by("-created_at")
    agg = grades.aggregate(s=Sum("score"), m=Sum("max_score"))
    avg = round(float(agg["s"]) / float(agg["m"]) * 100, 1) if agg["m"] else None
    debt = ZERO
    for m in with_balances(user.memberships.all()):
        debt += balance_of(m.charged, m.paid)["debt"]
    coins = RewardTransaction.objects.filter(student=user).aggregate(s=Sum("amount"))["s"] or 0
    return {
        "role": ST,
        "kpis": {
            "groups": len(group_ids),
            "attendance_rate": att["rate"],
            "pending_assignments": len(todo),
            "average_percent": avg,
            "debt": _money(debt),
            "coins": coins,
        },
        "attendance": att,
        "upcoming_lessons": [_lesson_row(lesson) for lesson in upcoming],
        "assignments_todo": todo[:8],
        "recent_grades": [
            {
                "id": g.pk,
                "assignment": g.assignment_id,
                "assignment_title": g.assignment.title,
                "score": str(g.score),
                "max_score": str(g.max_score),
                "percent": g.percent,
                "created_at": g.created_at,
            }
            for g in grades[:6]
        ],
        "groups": [
            {
                "id": m.group_id,
                "name": m.group.name,
                "code": m.group.code,
                "course_name": m.group.course.name,
                "teacher_name": m.group.teacher.full_name if m.group.teacher else None,
                "status": m.status,
                "days_of_week": m.group.days_of_week,
                "lesson_start_time": m.group.lesson_start_time,
                "lesson_end_time": m.group.lesson_end_time,
            }
            for m in open_ms
        ],
    }


def dashboard(user, params) -> dict:
    if user.role in (SA, AD):
        return staff_dashboard(user, params)
    if user.role == TE:
        return teacher_dashboard(user)
    return student_dashboard(user)


# --- reports ---------------------------------------------------------------------------------


def finance_report(user, params) -> dict:
    s = Scope(user, params)
    payments = s.payments().filter(paid_at__date__gte=s.date_from, paid_at__date__lte=s.date_to)
    by_method = [
        {"method": r["method"], "amount": _money(r["t"]), "count": r["c"]}
        for r in payments.values("method").annotate(t=Sum("amount"), c=Count("id")).order_by("-t")
    ]
    by_course = [
        {"course": r["membership__group__course__name"], "amount": _money(r["t"])}
        for r in payments.values("membership__group__course__name").annotate(t=Sum("amount")).order_by("-t")
    ]
    by_branch = [
        {"branch": r["membership__group__branch__name"], "amount": _money(r["t"])}
        for r in payments.values("membership__group__branch__name").annotate(t=Sum("amount")).order_by("-t")
    ]
    by_month = [
        {"month": r["m"].strftime("%Y-%m"), "amount": _money(r["t"])}
        for r in payments.annotate(m=TruncMonth("paid_at")).values("m").annotate(t=Sum("amount")).order_by("m")
    ]
    from payments.calculations import balance_of, with_balances

    debtors = []
    for m in with_balances(s.memberships().select_related("student", "group")):
        b = balance_of(m.charged, m.paid)
        if b["debt"] > 0:
            debtors.append(
                {
                    "membership": m.pk,
                    "student": m.student_id,
                    "student_name": m.student.full_name,
                    "phone": m.student.phone,
                    "group_name": m.group.name,
                    "debt": _money(b["debt"]),
                }
            )
    debtors.sort(key=lambda r: Decimal(r["debt"]), reverse=True)
    total = payments.aggregate(t=Sum("amount"))["t"] or ZERO
    return {
        "date_from": s.date_from,
        "date_to": s.date_to,
        "total": _money(total),
        "count": payments.count(),
        "by_method": by_method,
        "by_course": by_course,
        "by_branch": by_branch,
        "by_month": by_month,
        "debt": {k: (_money(v) if isinstance(v, Decimal) else v) for k, v in totals(s.memberships()).items()},
        "debtors": debtors[:100],
    }


def finance_csv_rows(user, params):
    s = Scope(user, params)
    payments = (
        s.payments()
        .filter(paid_at__date__gte=s.date_from, paid_at__date__lte=s.date_to)
        .select_related("student", "membership__group", "membership__group__branch", "received_by")
        .order_by("paid_at")
    )
    yield ["Chek", "Sana", "Student", "Telefon", "Guruh", "Filial", "Summa", "Usul", "Qabul qildi"]
    for p in payments:
        yield [
            p.receipt_number,
            timezone.localtime(p.paid_at).strftime("%d.%m.%Y %H:%M"),
            p.student.full_name,
            p.student.phone,
            p.membership.group.name,
            p.membership.group.branch.name,
            str(p.amount),
            p.get_method_display(),
            p.received_by.full_name,
        ]


def attendance_report(user, params) -> list[dict]:
    s = Scope(user, params)
    conf = SystemSettings.load()
    rows = []
    for g in s.groups().exclude(status=GroupStatus.CANCELLED).select_related("course", "teacher").order_by("name"):
        recs = AttendanceRecord.objects.filter(
            lesson__group=g, lesson__date__gte=s.date_from, lesson__date__lte=s.date_to
        )
        summ = summarize(recs, conf)
        rows.append(
            {
                "group": g.pk,
                "group_name": g.name,
                "course_name": g.course.name,
                "teacher_name": g.teacher.full_name if g.teacher else None,
                "lessons": g.lessons.filter(date__gte=s.date_from, date__lte=s.date_to)
                .exclude(status=LessonStatus.CANCELLED)
                .count(),
                **summ,
            }
        )
    return rows


def academic_report(user, params) -> list[dict]:
    s = Scope(user, params)
    rows = []
    for g in s.groups().exclude(status=GroupStatus.CANCELLED).select_related("course", "teacher").order_by("name"):
        assignments = Assignment.objects.filter(group=g).exclude(status=AssignmentStatus.DRAFT)
        n_assign = assignments.count()
        n_students = g.memberships.filter(status="active").count()
        n_subs = AssignmentSubmission.objects.filter(assignment__in=assignments).count()
        agg = Grade.objects.filter(group=g).aggregate(s=Sum("score"), m=Sum("max_score"), c=Count("id"))
        expected = n_assign * n_students
        rows.append(
            {
                "group": g.pk,
                "group_name": g.name,
                "course_name": g.course.name,
                "teacher_name": g.teacher.full_name if g.teacher else None,
                "students": n_students,
                "assignments": n_assign,
                "submissions": n_subs,
                "graded": agg["c"] or 0,
                "submission_rate": round(n_subs / expected * 100, 1) if expected else None,
                "average_percent": round(float(agg["s"]) / float(agg["m"]) * 100, 1) if agg["m"] else None,
            }
        )
    return rows
