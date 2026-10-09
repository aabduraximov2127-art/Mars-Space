import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCheck, Lock, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui/display";
import { Input } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { get, parseApiError, post } from "@/lib/api";
import { date, dateTime, time } from "@/lib/format";
import { ATTENDANCE_STATUS, LESSON_STATUS, label, tone } from "@/lib/labels";
import type { AttendanceStatus, Lesson } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SheetRow {
  student: number;
  student_name: string;
  record_id: number | null;
  status: AttendanceStatus | null;
  comment: string;
}

interface Sheet {
  lesson: Lesson;
  can_mark: boolean;
  reason: string;
  students: SheetRow[];
}

const OPTIONS: { value: AttendanceStatus; short: string; active: string }[] = [
  { value: "present", short: "Keldi", active: "bg-success text-white border-success" },
  { value: "late", short: "Kechikdi", active: "bg-warning text-white border-warning" },
  { value: "excused", short: "Uzrli", active: "bg-info text-white border-info" },
  { value: "absent", short: "Kelmadi", active: "bg-danger text-white border-danger" },
];

function HistoryModal({ recordId, name, onClose }: { recordId: number; name: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["attendance-history", recordId],
    queryFn: () =>
      get<{ id: number; previous_status: string; new_status: string; changed_by_name: string | null; reason: string; changed_at: string }[]>(
        `/attendance/${recordId}/history/`,
      ),
  });
  return (
    <Modal open onClose={onClose} title="O'zgarishlar tarixi" description={name} size="sm">
      {q.isLoading ? (
        <Spinner />
      ) : (
        <ol className="space-y-3">
          {q.data?.map((h) => (
            <li key={h.id} className="rounded-md border border-line p-3 text-[13px]">
              <p className="font-medium text-ink-900">
                {h.previous_status ? `${label(ATTENDANCE_STATUS, h.previous_status)} → ` : ""}
                {label(ATTENDANCE_STATUS, h.new_status)}
              </p>
              <p className="text-ink-500">
                {h.changed_by_name ?? "—"} · {dateTime(h.changed_at)}
              </p>
              {h.reason && <p className="mt-1 text-ink-600">Sabab: {h.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

export default function LessonAttendancePage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["attendance-sheet-lesson", id], queryFn: () => get<Sheet>(`/attendance/lesson/${id}/`) });
  const [draft, setDraft] = useState<Record<number, { status: AttendanceStatus | null; comment: string }>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<SheetRow | null>(null);

  useEffect(() => {
    if (q.data) {
      setDraft(Object.fromEntries(q.data.students.map((s) => [s.student, { status: s.status, comment: s.comment }])));
    }
  }, [q.data]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, excused: 0, absent: 0, none: 0 };
    for (const v of Object.values(draft)) {
      if (v.status) c[v.status] += 1;
      else c.none += 1;
    }
    return c;
  }, [draft]);

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Spinner />;
  const { lesson, can_mark, students } = q.data;
  const alreadyMarked = students.some((s) => s.status);
  const changed = students.some((s) => draft[s.student]?.status !== s.status || (draft[s.student]?.comment ?? "") !== s.comment);

  const setStatus = (sid: number, status: AttendanceStatus) =>
    setDraft((d) => ({ ...d, [sid]: { comment: d[sid]?.comment ?? "", status } }));

  const save = async () => {
    const records = students
      .filter((s) => draft[s.student]?.status)
      .map((s) => ({ student: s.student, status: draft[s.student].status, comment: draft[s.student].comment }));
    if (records.length !== students.length) {
      toast.error("Barcha studentlar uchun holatni belgilang.");
      return;
    }
    setSaving(true);
    try {
      const r = await post<{ created: number; updated: number }>(`/attendance/lesson/${id}/mark/`, { records, reason });
      toast.success(`Davomat saqlandi (${r.created} yangi, ${r.updated} o'zgartirildi).`);
      setReason("");
      await Promise.all([
        q.refetch(),
        qc.invalidateQueries({ queryKey: ["lessons"] }),
        qc.invalidateQueries({ queryKey: ["unmarked"] }),
        qc.invalidateQueries({ queryKey: ["dashboard"] }),
        qc.invalidateQueries({ queryKey: ["attendance-sheet"] }),
      ]);
    } catch (err) {
      toast.error(parseApiError(err).detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        back={
          <Link to="/attendance" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-800">
            <ArrowLeft className="size-3.5" /> Davomat
          </Link>
        }
        title={lesson.group_name}
        description={`${date(lesson.date)} · ${time(lesson.start_time)}–${time(lesson.end_time)}${lesson.topic ? ` · ${lesson.topic}` : ""}`}
        actions={<Badge tone={tone(LESSON_STATUS, lesson.status)}>{label(LESSON_STATUS, lesson.status)}</Badge>}
      />
      {!can_mark && (
        <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-amber-800">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{q.data.reason || "Bu dars uchun davomatni o'zgartirib bo'lmaydi."}</span>
        </div>
      )}
      <Card>
        <CardHeader
          title={`Studentlar (${students.length})`}
          description={`Keldi ${counts.present} · Kechikdi ${counts.late} · Uzrli ${counts.excused} · Kelmadi ${counts.absent}${counts.none ? ` · Belgilanmagan ${counts.none}` : ""}`}
          actions={
            can_mark && (
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCheck className="size-4" />}
                onClick={() =>
                  setDraft((d) =>
                    Object.fromEntries(students.map((s) => [s.student, { comment: d[s.student]?.comment ?? "", status: d[s.student]?.status ?? "present" }])),
                  )
                }
              >
                Qolganlar keldi
              </Button>
            )
          }
        />
        {students.length === 0 ? (
          <EmptyState title="Bu sanada guruhda faol student yo'q" />
        ) : (
          <ul className="divide-y divide-line">
            {students.map((s, i) => {
              const cur = draft[s.student];
              return (
                <li key={s.student} className="flex flex-col gap-3 px-5 py-3 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="tabular w-6 text-right text-[13px] text-ink-400">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-900">{s.student_name}</p>
                      {s.record_id && (
                        <button type="button" className="text-xs text-ink-500 hover:text-brand-700 hover:underline" onClick={() => setHistory(s)}>
                          Tarix
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${s.student_name} davomati`}>
                    {OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={cur?.status === o.value}
                        disabled={!can_mark}
                        onClick={() => setStatus(s.student, o.value)}
                        className={cn(
                          "h-8 rounded-md border px-3 text-[13px] font-medium transition-colors disabled:cursor-not-allowed",
                          cur?.status === o.value ? o.active : "border-line bg-surface text-ink-600 hover:bg-ink-50",
                        )}
                      >
                        {o.short}
                      </button>
                    ))}
                  </div>
                  <Input
                    className="h-8 lg:w-56"
                    placeholder="Izoh"
                    aria-label={`${s.student_name} izohi`}
                    disabled={!can_mark}
                    value={cur?.comment ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [s.student]: { status: d[s.student]?.status ?? null, comment: e.target.value } }))}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {can_mark && students.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
            {alreadyMarked && (
              <Input
                className="sm:w-80"
                placeholder="O'zgartirish sababi (ixtiyoriy)"
                aria-label="O'zgartirish sababi"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <Button icon={<Save className="size-4" />} loading={saving} disabled={!changed} onClick={save}>
              Davomatni saqlash
            </Button>
          </div>
        )}
      </Card>
      {history?.record_id && <HistoryModal recordId={history.record_id} name={history.student_name} onClose={() => setHistory(null)} />}
    </>
  );
}
