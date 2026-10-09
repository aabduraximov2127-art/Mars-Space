"""Attendance-rate formula — the only implementation used by APIs, reports and dashboards.

``attended`` = present (+ late if ``late_counts_present``) (+ excused if policy ``present``)
``total``    = present + late + absent (+ excused if policy ``present`` or ``absent``)
``rate``     = round(attended / total * 100, 1); ``None`` when ``total == 0``.
Records of cancelled lessons are never counted.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

from django.db.models import Count, Q, QuerySet

from organizations.models import AttendanceExcusedPolicy, SystemSettings


@dataclass
class AttendanceCounts:
    present: int = 0
    absent: int = 0
    late: int = 0
    excused: int = 0

    @property
    def marked(self) -> int:
        return self.present + self.absent + self.late + self.excused

    def as_dict(self) -> dict:
        return asdict(self)


def rate(counts: AttendanceCounts, *, excused_policy: str, late_counts_present: bool) -> float | None:
    attended = counts.present + (counts.late if late_counts_present else 0)
    total = counts.present + counts.late + counts.absent
    if excused_policy == AttendanceExcusedPolicy.PRESENT:
        attended += counts.excused
        total += counts.excused
    elif excused_policy == AttendanceExcusedPolicy.ABSENT:
        total += counts.excused
    if total == 0:
        return None
    return round(attended / total * 100, 1)


def counts_from(records: QuerySet) -> AttendanceCounts:
    """Aggregate an ``AttendanceRecord`` queryset (cancelled lessons excluded)."""
    agg = records.exclude(lesson__status="cancelled").aggregate(
        present=Count("id", filter=Q(status="present")),
        absent=Count("id", filter=Q(status="absent")),
        late=Count("id", filter=Q(status="late")),
        excused=Count("id", filter=Q(status="excused")),
    )
    return AttendanceCounts(**{k: v or 0 for k, v in agg.items()})


def summarize(records: QuerySet, conf: SystemSettings | None = None) -> dict:
    conf = conf or SystemSettings.load()
    counts = counts_from(records)
    return {
        **counts.as_dict(),
        "marked": counts.marked,
        "rate": rate(
            counts,
            excused_policy=conf.attendance_excused_policy,
            late_counts_present=conf.attendance_late_counts_present,
        ),
    }
