import io

import pytest
from django.core.management import call_command
from django.utils import timezone

from audit.models import AuditLog
from audit.services import record
from groups.models import GroupMembership
from payments.models import Payment

pytestmark = pytest.mark.django_db


def test_seed_demo_is_idempotent_and_realistic():
    call_command("seed_demo", force=True, stdout=io.StringIO())
    counts = (GroupMembership.objects.count(), Payment.objects.count())
    assert counts[0] > 20 and counts[1] > 20
    call_command("seed_demo", force=True, stdout=io.StringIO())
    assert (GroupMembership.objects.count(), Payment.objects.count()) == counts
    today = timezone.localdate()
    assert not Payment.objects.filter(paid_at__date__gt=today).exists()
    # Payments are spread over the months of the course, not piled up on one day.
    months = {p.paid_at.date().replace(day=1) for p in Payment.objects.all()}
    assert len(months) >= 2
    # Human-readable names end up in the audit log and admin.
    assert "—" in str(GroupMembership.objects.select_related("student", "group").first())
    assert str(Payment.objects.first()).startswith("Chek №")


def test_audit_can_hide_routine_logins(client_for, superadmin):
    record("login", actor=superadmin, obj=superadmin)
    record("login_failed", actor=superadmin, obj=superadmin)
    record("update", actor=superadmin, obj=superadmin)
    sa = client_for(superadmin)
    actions = {r["action"] for r in sa.get("/api/audit-logs/", {"hide_auth": "true"}).data["results"]}
    assert actions == {"login_failed", "update"}
    assert sa.get("/api/audit-logs/").data["count"] == AuditLog.objects.count()
