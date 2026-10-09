"""Balance / debt formulas — single source of truth for payments APIs and dashboards.

Per membership ``m``:
    charged(m) = Σ invoice.amount   (status = open)
    paid(m)    = Σ payment.amount   (status = completed)
    balance(m) = paid − charged      (negative → debt)
    debt(m)    = max(0, charged − paid)
Overpayment on one membership never offsets debt on another one.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.db.models import DecimalField, OuterRef, QuerySet, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from groups.models import GroupMembership

from .models import Invoice, InvoiceStatus, Payment, PaymentStatus

ZERO = Decimal("0.00")
_MONEY = DecimalField(max_digits=14, decimal_places=2)


def _sum_subquery(model, filters: dict) -> Subquery:
    # A correlated subquery per sum avoids the row multiplication of joining two reverse FKs.
    return Coalesce(
        Subquery(
            model.objects.filter(membership=OuterRef("pk"), **filters)
            .order_by()
            .values("membership")
            .annotate(total=Sum("amount"))
            .values("total")[:1],
            output_field=_MONEY,
        ),
        Value(ZERO),
        output_field=_MONEY,
    )


def with_balances(memberships: QuerySet[GroupMembership]) -> QuerySet[GroupMembership]:
    """Annotate ``charged``, ``paid`` on a membership queryset."""
    return memberships.annotate(
        charged=_sum_subquery(Invoice, {"status": InvoiceStatus.OPEN}),
        paid=_sum_subquery(Payment, {"status": PaymentStatus.COMPLETED}),
    )


def balance_of(charged: Decimal, paid: Decimal) -> dict:
    balance = (paid or ZERO) - (charged or ZERO)
    return {
        "charged": charged or ZERO,
        "paid": paid or ZERO,
        "balance": balance,
        "debt": -balance if balance < 0 else ZERO,
    }


def totals(memberships: QuerySet[GroupMembership]) -> dict:
    """Aggregate charged/paid/debt over memberships, debt summed per membership."""
    total_charged = total_paid = total_debt = ZERO
    debtors: set[int] = set()
    for row in with_balances(memberships).values("student_id", "charged", "paid"):
        b = balance_of(row["charged"], row["paid"])
        total_charged += b["charged"]
        total_paid += b["paid"]
        if b["debt"] > 0:
            total_debt += b["debt"]
            debtors.add(row["student_id"])
    return {
        "total_charged": total_charged,
        "total_paid": total_paid,
        "total_debt": total_debt,
        "debtors_count": len(debtors),
    }


@dataclass
class InvoiceAllocation:
    invoice: Invoice
    paid_amount: Decimal
    state: str  # "paid" | "partial" | "unpaid" | "cancelled"


def allocate_fifo(invoices: list[Invoice], paid_total: Decimal) -> list[InvoiceAllocation]:
    """Spread ``paid_total`` over open invoices oldest-first to derive per-invoice state."""
    remaining = paid_total or ZERO
    result: list[InvoiceAllocation] = []
    for invoice in sorted(invoices, key=lambda i: (i.period, i.pk or 0)):
        if invoice.status == InvoiceStatus.CANCELLED:
            result.append(InvoiceAllocation(invoice, ZERO, "cancelled"))
            continue
        applied = min(remaining, invoice.amount)
        remaining -= applied
        if invoice.amount == 0 or applied >= invoice.amount:
            state = "paid"
        elif applied > 0:
            state = "partial"
        else:
            state = "unpaid"
        result.append(InvoiceAllocation(invoice, applied, state))
    return result
