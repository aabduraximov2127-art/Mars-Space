"""Payments (idempotent, void-only), monthly invoices and debt reminders."""

from __future__ import annotations

import calendar
import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.db.models import F, Q, QuerySet
from django.utils import timezone

from audit.services import record as audit
from core.exceptions import BusinessRuleError, ConflictError
from core.permissions import require
from core.roles import AD, SA, ST
from groups.models import GroupMembership, MembershipStatus
from groups.selectors import can_manage_group
from notifications.services import NotificationType, notify
from organizations.models import SystemSettings

from .calculations import balance_of, with_balances
from .models import Invoice, InvoiceStatus, Payment, PaymentStatus

DUPLICATE_WINDOW = dt.timedelta(minutes=2)


def payments_for(user) -> QuerySet[Payment]:
    qs = Payment.objects.select_related(
        "membership", "membership__group", "membership__group__course", "student", "received_by", "voided_by"
    )
    role = getattr(user, "role", None) if getattr(user, "is_authenticated", False) else None
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(membership__group__branch_id=user.branch_id)
    if role == ST:
        return qs.filter(student=user)
    return qs.none()


def invoices_for(user) -> QuerySet[Invoice]:
    qs = Invoice.objects.select_related("membership", "group", "student")
    role = getattr(user, "role", None) if getattr(user, "is_authenticated", False) else None
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(group__branch_id=user.branch_id)
    if role == ST:
        return qs.filter(student=user)
    return qs.none()


def balance_memberships_for(user) -> QuerySet[GroupMembership]:
    qs = GroupMembership.objects.select_related("group", "group__course", "group__branch", "student")
    role = getattr(user, "role", None) if getattr(user, "is_authenticated", False) else None
    if role == SA:
        return qs
    if role == AD:
        return qs.filter(group__branch_id=user.branch_id)
    if role == ST:
        return qs.filter(student=user)
    return qs.none()


def debtors(memberships: QuerySet[GroupMembership]) -> QuerySet[GroupMembership]:
    return with_balances(memberships).filter(charged__gt=F("paid"))


@transaction.atomic
def create_payment(
    actor,
    *,
    membership: GroupMembership,
    amount: Decimal,
    method: str,
    idempotency_key,
    paid_at: dt.datetime | None = None,
    note: str = "",
    confirm_duplicate: bool = False,
    request=None,
) -> tuple[Payment, bool]:
    existing = Payment.objects.filter(idempotency_key=idempotency_key).first()
    if existing is not None:
        if existing.membership_id != membership.pk:
            raise ConflictError("Bu idempotency kaliti boshqa to'lov uchun ishlatilgan.", code="idempotency_mismatch")
        return existing, False
    membership = GroupMembership.objects.select_for_update().select_related("group", "student").get(pk=membership.pk)
    require(can_manage_group(actor, membership.group), "Bu guruh to'lovini qabul qilishga ruxsat yo'q.")
    if amount <= 0:
        raise BusinessRuleError("To'lov summasi musbat bo'lishi kerak.", code="invalid_amount")
    now = timezone.now()
    paid_at = paid_at or now
    if paid_at > now + dt.timedelta(minutes=5):
        raise BusinessRuleError("To'lov vaqti kelajakda bo'lishi mumkin emas.", code="invalid_date")
    if not confirm_duplicate:
        similar = Payment.objects.filter(
            membership=membership,
            amount=amount,
            status=PaymentStatus.COMPLETED,
            created_at__gte=now - DUPLICATE_WINDOW,
        ).first()
        if similar is not None:
            raise ConflictError(
                "Shu student uchun xuddi shu summadagi to'lov hozirgina qayd etilgan. Takroriy emasligini tasdiqlang.",
                code="duplicate_suspected",
                extra={"existing_payment": similar.pk},
            )
    payment = Payment.objects.create(
        membership=membership,
        student=membership.student,
        amount=amount,
        method=method,
        paid_at=paid_at,
        idempotency_key=idempotency_key,
        note=note,
        received_by=actor,
    )
    audit(
        "payment_create",
        actor=actor,
        obj=payment,
        changes={"membership": membership.pk, "amount": amount, "method": method},
        branch=membership.group.branch_id,
        request=request,
    )
    notify(
        [membership.student],
        NotificationType.PAYMENT_RECEIVED,
        "To'lov qabul qilindi",
        f"{amount:,.0f} so'm — {membership.group.name}. Chek №{payment.receipt_number}".replace(",", " "),
        link="/payments",
        data={"payment_id": payment.pk},
    )
    return payment, True


@transaction.atomic
def void_payment(actor, payment: Payment, reason: str, request=None) -> Payment:
    p = Payment.objects.select_for_update().select_related("membership__group").get(pk=payment.pk)
    require(can_manage_group(actor, p.membership.group))
    if p.status != PaymentStatus.COMPLETED:
        raise BusinessRuleError("To'lov allaqachon bekor qilingan.", code="already_voided")
    if actor.role == AD:
        window = SystemSettings.load().payment_void_window_hours
        if timezone.now() - p.created_at > dt.timedelta(hours=window):
            raise BusinessRuleError(
                f"To'lovni faqat {window} soat ichida bekor qilish mumkin. Superadminga murojaat qiling.",
                code="void_window_closed",
            )
    p.status = PaymentStatus.VOIDED
    p.voided_at = timezone.now()
    p.voided_by = actor
    p.void_reason = reason[:255]
    p.save(update_fields=["status", "voided_at", "voided_by", "void_reason", "updated_at"])
    audit(
        "payment_void",
        actor=actor,
        obj=p,
        changes={"reason": reason, "amount": p.amount},
        branch=p.membership.group.branch_id,
        request=request,
    )
    return p


def _month_bounds(period: dt.date) -> tuple[dt.date, dt.date]:
    first = period.replace(day=1)
    last = first.replace(day=calendar.monthrange(first.year, first.month)[1])
    return first, last


@transaction.atomic
def generate_invoices(actor, period: dt.date, group=None, request=None) -> dict:
    first, last = _month_bounds(period)
    conf = SystemSettings.load()
    qs = (
        balance_memberships_for(actor)
        .filter(
            joined_at__lte=last,
        )
        .filter(Q(left_at__isnull=True) | Q(left_at__gte=first))
        .exclude(status=MembershipStatus.FROZEN)
    )
    if group is not None:
        qs = qs.filter(group=group)
    created = skipped = 0
    existing = set(Invoice.objects.filter(period=first, membership__in=qs).values_list("membership_id", flat=True))
    rows = []
    for m in qs.select_related("group"):
        if m.pk in existing:
            skipped += 1
            continue
        base = m.monthly_fee
        discount = m.discount_for(base)
        rows.append(
            Invoice(
                membership=m,
                student_id=m.student_id,
                group_id=m.group_id,
                period=first,
                base_amount=base,
                discount_amount=discount,
                amount=base - discount,
                due_date=first.replace(day=min(conf.invoice_due_day, 28)),
                created_by=actor,
            )
        )
    Invoice.objects.bulk_create(rows, ignore_conflicts=True)
    created = len(rows)
    audit(
        "invoices_generate",
        actor=actor,
        entity_type="payments.Invoice",
        changes={"period": first, "group": getattr(group, "pk", None), "created": created, "skipped": skipped},
        request=request,
    )
    return {"created": created, "skipped": skipped}


@transaction.atomic
def cancel_invoice(actor, invoice: Invoice, reason: str, request=None) -> Invoice:
    inv = Invoice.objects.select_for_update().select_related("group").get(pk=invoice.pk)
    require(can_manage_group(actor, inv.group))
    if inv.status == InvoiceStatus.CANCELLED:
        raise BusinessRuleError("Hisob allaqachon bekor qilingan.", code="already_cancelled")
    inv.status = InvoiceStatus.CANCELLED
    inv.cancel_reason = reason[:255]
    inv.cancelled_by = actor
    inv.cancelled_at = timezone.now()
    inv.save()
    audit(
        "invoice_cancel", actor=actor, obj=inv, changes={"reason": reason}, branch=inv.group.branch_id, request=request
    )
    return inv


def send_reminders(actor, memberships: QuerySet[GroupMembership], request=None) -> int:
    sent = 0
    for m in debtors(memberships).select_related("student", "group"):
        debt = balance_of(m.charged, m.paid)["debt"]
        sent += notify(
            [m.student],
            NotificationType.PAYMENT_REMINDER,
            "To'lov eslatmasi",
            f"{m.group.name} bo'yicha qarzdorlik: {debt:,.0f} so'm.".replace(",", " "),
            link="/payments",
            data={"membership_id": m.pk, "debt": str(debt)},
        )
    audit("payment_reminders", actor=actor, entity_type="payments.Payment", changes={"notified": sent}, request=request)
    return sent
