import datetime as dt
from decimal import Decimal

import pytest
from django.utils import timezone

from conftest import enroll, make_group, make_user
from core.roles import Role
from groups.models import GroupMembership
from payments.calculations import allocate_fifo, totals, with_balances
from payments.models import Invoice, Payment

pytestmark = pytest.mark.django_db
D = Decimal


def invoice(m, period, amount, status="open"):
    return Invoice.objects.create(
        membership=m,
        student=m.student,
        group=m.group,
        period=period,
        base_amount=amount,
        discount_amount=D("0"),
        amount=amount,
        due_date=period.replace(day=10),
        status=status,
        cancelled_at=timezone.now() if status == "cancelled" else None,
    )


def pay(m, amount, receiver, status="completed"):
    return Payment.objects.create(
        membership=m,
        student=m.student,
        amount=amount,
        method="cash",
        paid_at=timezone.now(),
        received_by=receiver,
        status=status,
        voided_at=timezone.now() if status == "voided" else None,
    )


def test_balances_do_not_multiply_rows(group, student, admin_user):
    m = enroll(student, group)
    invoice(m, dt.date(2026, 8, 1), D("500000"))
    invoice(m, dt.date(2026, 9, 1), D("500000"))
    invoice(m, dt.date(2026, 10, 1), D("500000"), status="cancelled")
    pay(m, D("300000"), admin_user)
    pay(m, D("200000"), admin_user)
    pay(m, D("100000"), admin_user)
    pay(m, D("999999"), admin_user, status="voided")
    row = with_balances(GroupMembership.objects.filter(pk=m.pk)).get()
    assert row.charged == D("1000000.00")
    assert row.paid == D("600000.00")


def test_overpayment_does_not_offset_other_membership_debt(branch, teacher, admin_user):
    s = make_user(Role.STUDENT, branch=branch)
    g1, g2 = make_group(branch, teacher=teacher), make_group(branch, teacher=teacher)
    m1, m2 = enroll(s, g1), enroll(s, g2)
    invoice(m1, dt.date(2026, 9, 1), D("400000"))
    pay(m1, D("700000"), admin_user)  # overpaid by 300k
    invoice(m2, dt.date(2026, 9, 1), D("500000"))  # unpaid
    result = totals(GroupMembership.objects.filter(student=s))
    assert result["total_debt"] == D("500000.00")
    assert result["total_paid"] == D("700000.00")
    assert result["debtors_count"] == 1


def test_fifo_allocation_states(group, student):
    m = enroll(student, group)
    a = invoice(m, dt.date(2026, 7, 1), D("100"))
    b = invoice(m, dt.date(2026, 8, 1), D("100"))
    c = invoice(m, dt.date(2026, 9, 1), D("100"))
    states = [(x.invoice.pk, x.state, x.paid_amount) for x in allocate_fifo([c, a, b], D("150"))]
    assert states == [(a.pk, "paid", D("100")), (b.pk, "partial", D("50")), (c.pk, "unpaid", D("0"))]


def test_membership_monthly_amount_rounding(group, student):
    m = enroll(student, group, monthly_fee=D("333333.33"), discount_type="percent", discount_value=D("15"))
    assert m.monthly_amount == D("283333.33")  # 333333.33 - 49999.9995 -> 50000.00 discount
    fixed = enroll(
        make_user(Role.STUDENT, branch=group.branch),
        group,
        monthly_fee=D("100"),
        discount_type="fixed",
        discount_value=D("100"),
    )
    assert fixed.monthly_amount == D("0.00")
