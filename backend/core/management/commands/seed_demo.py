"""Realistic demo data for local development: ``python manage.py seed_demo``.

Idempotent: users, branches, courses and groups are matched by their unique phone/code and
the heavy data (lessons, attendance, assignments, payments) is only generated once per group.
Refuses to run when ``DEBUG=False`` unless ``--force`` is given.
"""

from __future__ import annotations

import datetime as dt
import random
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from accounts.models import User, UserProfile
from announcements.models import Announcement, AnnouncementStatus
from assignments.models import Assignment, AssignmentStatus, AssignmentSubmission, SubmissionRevision, SubmissionStatus
from attendance.models import AttendanceChange, AttendanceRecord
from chat.models import ChatMessage
from chat.services import direct_room, group_room
from core.roles import Role
from courses.models import Course
from grades.models import Grade, GradeChange
from groups.models import Group, GroupMembership, GroupStatus
from notifications.services import NotificationType, notify
from organizations.models import Branch, Room, SystemSettings
from payments.models import Invoice, Payment, PaymentMethod
from rewards.models import RewardCategory, RewardTransaction
from schedules.models import Lesson, LessonStatus

PASSWORD = "Demo12345!"

FIRST_NAMES = [
    "Aziz", "Bekzod", "Dilnoza", "Farrux", "Gulnora", "Hasan", "Iroda", "Jasur", "Kamola", "Laylo",
    "Madina", "Nodir", "Otabek", "Parizoda", "Rustam", "Sardor", "Shahzoda", "Temur", "Umida", "Vohid",
    "Xurshid", "Yulduz", "Zarina", "Sevara", "Shohruh", "Malika", "Doniyor", "Nilufar",
]  # fmt: skip
LAST_NAMES = [
    "Karimov", "Toshmatova", "Rahimov", "Yusupova", "Aliyev", "Sobirova", "Nazarov", "Qodirova",
    "Ergashev", "Murodova", "Usmonov", "Hamidova", "Saidov", "Abdullayeva", "Jo'rayev", "Islomova",
]  # fmt: skip

ASSIGNMENT_TOPICS = {
    "FE": ["HTML sahifa tuzilmasi", "CSS Flexbox maket", "JavaScript massivlar", "React komponentlar"],
    "PY": ["Python o'zgaruvchilar", "Funksiyalar va modullar", "OOP: klasslar", "Django modellar"],
    "ENG": ["Present Simple essay", "Vocabulary: Travel", "Listening practice", "Past tense story"],
    "MATH": ["Kvadrat tenglamalar", "Funksiya grafigi", "Trigonometriya", "Ehtimollar nazariyasi"],
}


class Command(BaseCommand):
    help = "Demo ma'lumotlarni yaratadi (faqat DEBUG=True yoki --force)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="DEBUG=False bo'lsa ham ishga tushirish")

    def handle(self, *args, **opts):
        if not settings.DEBUG and not opts["force"]:
            raise CommandError("seed_demo faqat DEBUG=True da ishlaydi (yoki --force bering).")
        self.rng = random.Random(2026)
        self.today = timezone.localdate()
        with transaction.atomic():
            self.seed()
        self.stdout.write(self.style.SUCCESS("Demo ma'lumotlar tayyor."))
        self.stdout.write(
            "\nKirish ma'lumotlari (parol hammasi uchun: Demo12345!):\n"
            "  Superadmin : +998900000001\n"
            "  Admin      : +998900000002 (Chilonzor), +998900000003 (Yunusobod)\n"
            "  Ustoz      : +998901000001 .. +998901000004\n"
            "  Student    : +998902000001 .. +998902000024\n"
        )

    # --- helpers ---------------------------------------------------------------------------

    def user(self, phone, role, branch, first, last, **profile) -> User:
        user = User.objects.filter(phone=phone).first()
        if user is None:
            if role == Role.SUPERADMIN:
                user = User.objects.create_superuser(phone=phone, password=PASSWORD, first_name=first, last_name=last)
            else:
                user = User.objects.create_user(
                    phone=phone, password=PASSWORD, role=role, branch=branch, first_name=first, last_name=last
                )
            user.email = f"{phone[-7:]}@demo.educentr.uz"
            user.save(update_fields=["email"])
        UserProfile.objects.update_or_create(user=user, defaults=profile)
        return user

    def aware(self, day: dt.date, hour: int = 12, minute: int = 0) -> dt.datetime:
        return timezone.make_aware(dt.datetime.combine(day, dt.time(hour, minute)))

    # --- main ------------------------------------------------------------------------------

    def seed(self):
        conf = SystemSettings.load()
        conf.center_name = "EduCentr"
        conf.save()

        chl, _ = Branch.objects.get_or_create(
            code="CHL",
            defaults={
                "name": "Chilonzor filiali",
                "address": "Toshkent, Chilonzor 9-kvartal",
                "phone": "+998712000001",
            },
        )
        yns, _ = Branch.objects.get_or_create(
            code="YNS",
            defaults={"name": "Yunusobod filiali", "address": "Toshkent, Yunusobod 4-mavze", "phone": "+998712000002"},
        )
        rooms = {}
        for branch in (chl, yns):
            for name, cap in (("101-xona", 16), ("102-xona", 20), ("Lab-1", 14)):
                rooms[(branch.code, name)], _ = Room.objects.get_or_create(
                    branch=branch, name=name, defaults={"capacity": cap}
                )

        sa = self.user("+998900000001", Role.SUPERADMIN, None, "Sherzod", "Aminov")
        admins = {
            "CHL": self.user("+998900000002", Role.ADMIN, chl, "Aziza", "Rahimova"),
            "YNS": self.user("+998900000003", Role.ADMIN, yns, "Bobur", "Qosimov"),
        }
        teachers = [
            self.user("+998901000001", Role.TEACHER, chl, "Jamshid", "Tursunov", specialization="Frontend (React)"),
            self.user("+998901000002", Role.TEACHER, chl, "Nigora", "Saidova", specialization="Python, Django"),
            self.user("+998901000003", Role.TEACHER, yns, "Akmal", "Xolmatov", specialization="Frontend, JavaScript"),
            self.user("+998901000004", Role.TEACHER, yns, "Dilfuza", "Ismoilova", specialization="Matematika"),
        ]
        students = []
        for i in range(24):
            branch = chl if i < 14 else yns
            first = FIRST_NAMES[i % len(FIRST_NAMES)]
            last = LAST_NAMES[(i * 5) % len(LAST_NAMES)]
            if first.endswith("a") and not last.endswith("a"):
                last += "a"
            if not first.endswith("a") and last.endswith("ova"):
                last = last[:-1]
            students.append(
                self.user(
                    f"+998902{i + 1:06d}",
                    Role.STUDENT,
                    branch,
                    first,
                    last,
                    birth_date=dt.date(2004 + i % 8, 1 + i % 12, 1 + i % 27),
                    parent_name=f"{LAST_NAMES[i % len(LAST_NAMES)]} ota-onasi",
                    parent_phone=f"+998933{i + 1:06d}",
                )
            )

        fe, _ = Course.objects.get_or_create(
            code="FE",
            defaults={
                "name": "Frontend dasturlash",
                "description": "HTML, CSS, JavaScript va React asosida zamonaviy veb-ilovalar.",
                "duration_months": 8,
                "monthly_price": Decimal("650000"),
            },
        )
        py, _ = Course.objects.get_or_create(
            code="PY",
            defaults={
                "name": "Python va Django",
                "description": "Python asoslari, OOP va Django bilan backend dasturlash.",
                "duration_months": 9,
                "monthly_price": Decimal("700000"),
            },
        )
        eng, _ = Course.objects.get_or_create(
            code="ENG",
            defaults={
                "name": "Ingliz tili (IELTS)",
                "description": "Umumiy ingliz tili va IELTS tayyorlov.",
                "branch": chl,
                "duration_months": 6,
                "monthly_price": Decimal("450000"),
                "lesson_duration_minutes": 90,
            },
        )
        math, _ = Course.objects.get_or_create(
            code="MATH",
            defaults={
                "name": "Matematika (abituriyent)",
                "description": "Oliy ta'limga kirish imtihonlariga tayyorlov.",
                "branch": yns,
                "duration_months": 10,
                "monthly_price": Decimal("400000"),
            },
        )

        start = self.today - dt.timedelta(days=63)
        specs = [
            ("FE-01", "Frontend 01", fe, chl, teachers[0], rooms[("CHL", "Lab-1")], [0, 2, 4], (14, 0), (15, 30), students[0:7]),
            ("PY-01", "Python 01", py, chl, teachers[1], rooms[("CHL", "102-xona")], [1, 3, 5], (16, 0), (17, 30), students[5:12]),
            ("ENG-01", "IELTS Morning", eng, chl, teachers[0], rooms[("CHL", "101-xona")], [1, 3], (10, 0), (11, 30), students[8:14]),
            ("FE-02", "Frontend 02", fe, yns, teachers[2], rooms[("YNS", "Lab-1")], [0, 2, 4], (15, 0), (16, 30), students[14:20]),
            ("MATH-01", "Abituriyent 01", math, yns, teachers[3], rooms[("YNS", "101-xona")], [1, 3, 5], (9, 0), (10, 30), students[17:24]),
        ]  # fmt: skip
        for code, name, course, branch, teacher, room, days, t1, t2, members in specs:
            group, created = Group.objects.get_or_create(
                code=code,
                defaults={
                    "name": name,
                    "course": course,
                    "branch": branch,
                    "teacher": teacher,
                    "room": room,
                    "status": GroupStatus.ACTIVE,
                    "start_date": start,
                    "capacity": 16,
                    "days_of_week": days,
                    "lesson_start_time": dt.time(*t1),
                    "lesson_end_time": dt.time(*t2),
                },
            )
            if created:
                self.fill_group(group, members, admins[branch.code], sa)

        # A forming group for the admin to play with.
        Group.objects.get_or_create(
            code="PY-02",
            defaults={
                "name": "Python 02 (yangi)",
                "course": py,
                "branch": chl,
                "teacher": teachers[1],
                "room": rooms[("CHL", "101-xona")],
                "status": GroupStatus.FORMING,
                "start_date": self.today + dt.timedelta(days=14),
                "capacity": 14,
                "days_of_week": [0, 2, 4],
                "lesson_start_time": dt.time(18, 0),
                "lesson_end_time": dt.time(19, 30),
            },
        )

        if not Announcement.objects.exists():
            now = timezone.now()
            Announcement.objects.create(
                title="Yangi o'quv oyi boshlandi!",
                body="Hurmatli o'quvchilar, oylik to'lovlarni 10-sanagacha amalga oshirishingizni so'raymiz. "
                "Savollar bo'yicha filial administratoriga murojaat qiling.",
                author=sa,
                is_pinned=True,
                status=AnnouncementStatus.PUBLISHED,
                published_at=now,
            )
            Announcement.objects.create(
                title="Chilonzor: Hackathon 2026",
                body="Shu shanba soat 10:00 da Frontend va Python guruhlari uchun mini-hackathon bo'lib o'tadi. "
                "G'oliblarga 200 coin!",
                author=admins["CHL"],
                branch=chl,
                status=AnnouncementStatus.PUBLISHED,
                published_at=now - dt.timedelta(days=2),
            )
            Announcement.objects.create(
                title="Ustozlar yig'ilishi",
                body="Juma kuni soat 18:30 da barcha ustozlar uchun metodik yig'ilish.",
                author=admins["CHL"],
                branch=chl,
                audience_roles=[Role.TEACHER],
                status=AnnouncementStatus.PUBLISHED,
                published_at=now - dt.timedelta(days=1),
            )

        if not ChatMessage.objects.filter(room__direct_key__isnull=False).exists():
            room = direct_room(students[0], teachers[0])
            ChatMessage.objects.create(
                room=room, sender=students[0], body="Assalomu alaykum ustoz, uy vazifasi bo'yicha savolim bor edi."
            )
            msg = ChatMessage.objects.create(room=room, sender=teachers[0], body="Va alaykum assalom! Bemalol, yozing.")
            room.last_message_at = msg.created_at
            room.save(update_fields=["last_message_at"])
            notify(
                students,
                NotificationType.SYSTEM,
                "EduCentr'ga xush kelibsiz!",
                "Shaxsiy kabinetingiz tayyor.",
                link="/",
            )

    def fill_group(self, group: Group, members: list[User], admin: User, sa: User):
        rng = self.rng
        memberships = []
        for i, student in enumerate(members):
            discount = ("percent", Decimal("10")) if i == 2 else ("none", Decimal("0"))
            memberships.append(
                GroupMembership.objects.create(
                    group=group,
                    student=student,
                    joined_at=group.start_date + dt.timedelta(days=0 if i < len(members) - 1 else 21),
                    monthly_fee=group.course.monthly_price,
                    discount_type=discount[0],
                    discount_value=discount[1],
                    discount_reason="Aka-uka chegirmasi" if discount[0] != "none" else "",
                    created_by=admin,
                )
            )

        # Lessons: from group start until three weeks ahead.
        lessons = []
        day = group.start_date
        end = self.today + dt.timedelta(days=21)
        topics = ASSIGNMENT_TOPICS[group.code.split("-")[0]]
        n = 0
        while day <= end:
            if day.weekday() in group.days_of_week:
                n += 1
                lessons.append(
                    Lesson(
                        group=group,
                        teacher=group.teacher,
                        room=group.room,
                        date=day,
                        start_time=group.lesson_start_time,
                        end_time=group.lesson_end_time,
                        topic=f"{n}-dars: {topics[(n // 6) % len(topics)]}" if day <= self.today else "",
                        created_by=admin,
                    )
                )
            day += dt.timedelta(days=1)
        Lesson.objects.bulk_create(lessons)
        lessons = list(group.lessons.order_by("date"))

        # Cancel one future lesson to show the state.
        future = [lesson for lesson in lessons if lesson.date > self.today]
        if len(future) > 3:
            future[3].status = LessonStatus.CANCELLED
            future[3].cancel_reason = "Bayram kuni"
            future[3].save()

        # Attendance for past lessons, leaving the latest past lesson unmarked (teacher to-do).
        now = timezone.localtime()
        past = [
            lesson
            for lesson in lessons
            if lesson.date < self.today or (lesson.date == self.today and lesson.end_time <= now.time())
        ]
        weights = [("present", 76), ("late", 9), ("absent", 10), ("excused", 5)]
        statuses, w = zip(*weights, strict=True)
        for lesson in past[:-1]:
            for m in memberships:
                if m.joined_at > lesson.date:
                    continue
                status = rng.choices(statuses, w)[0]
                rec = AttendanceRecord.objects.create(
                    lesson=lesson, student=m.student, status=status, marked_by=group.teacher
                )
                AttendanceChange.objects.create(record=rec, new_status=status, changed_by=group.teacher)
            lesson.status = LessonStatus.COMPLETED
            lesson.save(update_fields=["status"])

        # Assignments: two graded, one waiting for review, one open.
        now_dt = timezone.now()
        plan = [(-35, "closed"), (-20, "graded"), (-4, "review"), (6, "open")]
        for idx, (offset, kind) in enumerate(plan):
            title = topics[idx % len(topics)]
            a = Assignment.objects.create(
                group=group,
                title=f"{title} — amaliy ish",
                description=f"{title} mavzusi bo'yicha amaliy topshiriq. Kodni GitHub'ga joylab, havolasini yuboring "
                "yoki faylni biriktiring.",
                grading_criteria="To'g'rilik — 60%, kod sifati — 25%, muddatga rioya — 15%.",
                max_score=100,
                due_at=self.aware(self.today + dt.timedelta(days=offset), 23, 59),
                status=AssignmentStatus.CLOSED if kind == "closed" else AssignmentStatus.PUBLISHED,
                published_at=now_dt + dt.timedelta(days=offset - 7),
                created_by=group.teacher,
            )
            if kind == "open":
                continue
            for m in memberships:
                if rng.random() < 0.15:
                    continue  # did not submit
                submitted = self.aware(self.today + dt.timedelta(days=offset - rng.randint(0, 3)), rng.randint(9, 22))
                s = AssignmentSubmission.objects.create(
                    assignment=a,
                    student=m.student,
                    status=SubmissionStatus.SUBMITTED,
                    revision_count=1,
                    last_submitted_at=submitted,
                )
                SubmissionRevision.objects.create(
                    submission=s,
                    number=1,
                    text="Topshiriq bajarildi. Kod havolada.",
                    link=f"https://github.com/demo/{group.code.lower()}-{a.pk}-{m.student_id}",
                )
                if kind in ("closed", "graded"):
                    score = Decimal(rng.randint(55, 100))
                    g = Grade.objects.create(
                        submission=s,
                        assignment=a,
                        student=m.student,
                        group=group,
                        score=score,
                        max_score=Decimal(100),
                        comment=rng.choice(
                            ["Yaxshi ish!", "Kod tozaroq bo'lishi mumkin.", "A'lo!", "Muddatga e'tibor bering."]
                        ),
                        graded_by=group.teacher,
                    )
                    GradeChange.objects.create(
                        grade=g, new_score=score, new_comment=g.comment, changed_by=group.teacher
                    )
                    s.status = SubmissionStatus.GRADED
                    s.reviewed_by = group.teacher
                    s.reviewed_at = submitted + dt.timedelta(days=1)
                    s.feedback = g.comment
                    s.save()

        # Invoices for each month since start and payments (most pay, some are in debt).
        month = group.start_date.replace(day=1)
        conf = SystemSettings.load()
        while month <= self.today.replace(day=1):
            for m in memberships:
                if m.joined_at > month.replace(day=28):
                    continue
                base = m.monthly_fee
                discount = m.discount_for(base)
                Invoice.objects.create(
                    membership=m,
                    student=m.student,
                    group=group,
                    period=month,
                    base_amount=base,
                    discount_amount=discount,
                    amount=base - discount,
                    due_date=month.replace(day=conf.invoice_due_day),
                    created_by=admin,
                )
            month = (month + dt.timedelta(days=32)).replace(day=1)
        for i, m in enumerate(memberships):
            charged = sum(inv.amount for inv in m.invoices.all())
            ratio = [1, 1, 1, 1, Decimal("0.5"), 0, 1][i % 7]
            to_pay = (charged * Decimal(ratio)).quantize(Decimal("1"))
            installments = max(1, m.invoices.count())
            for k in range(installments):
                amount = (to_pay / installments).quantize(Decimal("1"))
                if amount <= 0:
                    continue
                paid_day = min(self.today, m.joined_at + dt.timedelta(days=30 * k + rng.randint(1, 9)))
                Payment.objects.create(
                    membership=m,
                    student=m.student,
                    amount=amount,
                    method=rng.choice(
                        [PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.CLICK, PaymentMethod.PAYME]
                    ),
                    paid_at=self.aware(paid_day, rng.randint(9, 18), rng.randint(0, 59)),
                    received_by=admin,
                )

        # Coins.
        for m in memberships:
            for _ in range(rng.randint(1, 4)):
                RewardTransaction.objects.create(
                    student=m.student,
                    amount=rng.choice([5, 10, 15, 20, 25]),
                    category=rng.choice([RewardCategory.ATTENDANCE, RewardCategory.HOMEWORK, RewardCategory.ACTIVITY]),
                    reason=rng.choice(["Darsda faollik", "Uy vazifasi a'lo bajarildi", "Bir oy kechikmasdan keldi"]),
                    group=group,
                    created_by=group.teacher,
                )

        # Group chat.
        room = group_room(group)
        last = None
        for sender, body in (
            (group.teacher, f"Assalomu alaykum! {group.name} guruhining chatiga xush kelibsiz."),
            (memberships[0].student, "Rahmat ustoz! Ertangi dars soat nechida?"),
            (group.teacher, f"Odatdagidek, {group.lesson_start_time:%H:%M} da."),
        ):
            last = ChatMessage.objects.create(room=room, sender=sender, body=body)
        room.last_message_at = last.created_at
        room.save(update_fields=["last_message_at"])
