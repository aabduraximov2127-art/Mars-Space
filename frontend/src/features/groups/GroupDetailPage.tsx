import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarPlus, MessagesSquare, Pencil, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import {
  Badge,
  Card,
  CardHeader,
  DescriptionList,
  EmptyState,
  ErrorState,
  PageHeader,
  rateTone,
  Skeleton,
  Spinner,
} from "@/components/ui/display";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { DataTable, Tabs } from "@/components/ui/Table";
import { DateInput } from "@/components/ui/dates";
import { get, parseApiError, post } from "@/lib/api";
import { isStaff, useMe } from "@/lib/auth";
import { addDays, date, daysOfWeek, money, percent, phone, time, today } from "@/lib/format";
import { useAction, useInvalidate, useOptions } from "@/lib/hooks";
import {
  ASSIGNMENT_STATUS,
  ATTENDANCE_STATUS,
  GROUP_STATUS,
  LESSON_STATUS,
  MEMBERSHIP_STATUS,
  label,
  tone,
} from "@/lib/labels";
import type { Assignment, Group, Lesson, Membership } from "@/lib/types";
import { cn } from "@/lib/utils";

import { EnrollModal } from "./EnrollModal";
import { GroupForm } from "./GroupForm";

type Tab = "students" | "lessons" | "attendance" | "gradebook" | "assignments";

function MembershipActions({ m, group }: { m: Membership; group: Group }) {
  const [open, setOpen] = useState<null | "menu" | "leave" | "transfer" | "freeze" | "activate">(null);
  const invalidate = useInvalidate();
  const [leftAt, setLeftAt] = useState(today());
  const [toGroup, setToGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const groups = useOptions<Group>(["groups", "transfer", group.branch], "/groups/", { branch: group.branch }, open === "transfer");

  const run = async (url: string, body: unknown, msg: string) => {
    setBusy(true);
    try {
      await post(url, body);
      toast.success(msg);
      await invalidate("group-students", "group", "groups", "memberships");
      setOpen(null);
    } catch (err) {
      toast.error(parseApiError(err).detail);
    } finally {
      setBusy(false);
    }
  };
  if (!["active", "frozen"].includes(m.status)) return null;
  return (
    <div className="relative flex justify-end">
      <Select
        aria-label="Amallar"
        className="h-8 w-36 text-[13px]"
        value=""
        onChange={(e) => setOpen(e.target.value as typeof open)}
      >
        <option value="">Amallar…</option>
        {m.status === "active" && <option value="freeze">Muzlatish</option>}
        {m.status === "frozen" && <option value="activate">Faollashtirish</option>}
        <option value="transfer">Boshqa guruhga</option>
        <option value="leave">Guruhdan chiqarish</option>
      </Select>
      <ConfirmDialog
        open={open === "freeze" || open === "activate"}
        onClose={() => setOpen(null)}
        title={open === "freeze" ? "A'zolikni muzlatish" : "A'zolikni faollashtirish"}
        description={`${m.student_name} — ${open === "freeze" ? "muzlatilgan davrda hisob yozilmaydi va davomatda ko'rinmaydi." : "yana faol a'zo bo'ladi."}`}
        tone="primary"
        loading={busy}
        onConfirm={() => run(`/memberships/${m.id}/${open === "freeze" ? "freeze" : "activate"}/`, {}, "Saqlandi.")}
      />
      <Modal
        open={open === "leave"}
        onClose={() => setOpen(null)}
        title="Guruhdan chiqarish"
        description={m.student_name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Bekor qilish
            </Button>
            <Button variant="danger" loading={busy} onClick={() => run(`/memberships/${m.id}/leave/`, { left_at: leftAt }, "Student guruhdan chiqarildi.")}>
              Chiqarish
            </Button>
          </>
        }
      >
        <Field label="Chiqish sanasi" required>
          {(p) => <DateInput {...p} value={leftAt} onChange={(v) => setLeftAt(v)} />}
        </Field>
      </Modal>
      <Modal
        open={open === "transfer"}
        onClose={() => setOpen(null)}
        title="Boshqa guruhga ko'chirish"
        description={m.student_name}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Bekor qilish
            </Button>
            <Button
              loading={busy}
              disabled={!toGroup}
              onClick={() => run(`/memberships/${m.id}/transfer/`, { to_group: Number(toGroup), date: leftAt }, "Student ko'chirildi.")}
            >
              Ko'chirish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Yangi guruh" required>
            {(p) => (
              <Select {...p} value={toGroup} onChange={(e) => setToGroup(e.target.value)}>
                <option value="">Tanlang</option>
                {groups.data
                  ?.filter((g) => g.id !== group.id && ["active", "forming"].includes(g.status))
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code}) — {g.students_count}/{g.capacity}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Ko'chirish sanasi" required>
            {(p) => <DateInput {...p} value={leftAt} onChange={(v) => setLeftAt(v)} />}
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function StudentsTab({ group }: { group: Group }) {
  const me = useMe();
  const staff = isStaff(me.role);
  const navigate = useNavigate();
  const [history, setHistory] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const q = useQuery({
    queryKey: ["group-students", group.id, history],
    queryFn: () => get<Membership[]>(`/groups/${group.id}/students/`, { include_history: history ? 1 : undefined }),
  });
  return (
    <Card>
      <CardHeader
        title="Studentlar"
        description={`${group.students_count} / ${group.capacity} o'rin band`}
        actions={
          <>
            <Checkbox label="Tarix bilan" checked={history} onChange={(e) => setHistory(e.target.checked)} />
            {staff && (
              <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setEnrolling(true)}>
                Student qo'shish
              </Button>
            )}
          </>
        }
      />
      <DataTable
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(r) => r.id}
        empty={<EmptyState title="Guruhda hali student yo'q" />}
        columns={[
          {
            key: "name",
            header: "Student",
            cell: (r) => (
              <button type="button" className="text-left" onClick={() => navigate(`/users/${r.student}`)}>
                <span className="block font-medium text-ink-900 hover:text-brand-700">{r.student_name}</span>
                <span className="block text-[13px] text-ink-500">{phone(r.student_phone)}</span>
              </button>
            ),
          },
          { key: "joined", header: "Qo'shilgan", cell: (r) => date(r.joined_at) },
          ...(staff
            ? [
                {
                  key: "fee",
                  header: "Oylik to'lov",
                  cell: (r: Membership) => (
                    <div className="tabular">
                      {money(r.monthly_amount)}
                      {r.discount_type !== "none" && (
                        <p className="text-xs text-success">
                          chegirma {r.discount_type === "percent" ? `${Number(r.discount_value)}%` : money(r.discount_value)}
                        </p>
                      )}
                    </div>
                  ),
                },
              ]
            : []),
          { key: "status", header: "Holat", cell: (r) => <Badge tone={tone(MEMBERSHIP_STATUS, r.status)}>{label(MEMBERSHIP_STATUS, r.status)}</Badge> },
          ...(staff ? [{ key: "actions", header: "", cell: (r: Membership) => <MembershipActions m={r} group={group} /> }] : []),
        ]}
      />
      {enrolling && <EnrollModal group={group} onClose={() => setEnrolling(false)} />}
    </Card>
  );
}

function LessonsTab({ group }: { group: Group }) {
  const me = useMe();
  const staff = isStaff(me.role);
  const [range, setRange] = useState({ from: addDays(today(), -14), to: addDays(today(), 14) });
  const [cancelling, setCancelling] = useState<Lesson | null>(null);
  const q = useQuery({
    queryKey: ["lessons", "group", group.id, range],
    queryFn: () => get<{ results: Lesson[] }>("/lessons/", { group: group.id, date_from: range.from, date_to: range.to, page_size: 100 }),
  });
  const cancel = useAction((v: { id: number; reason: string }) => post(`/lessons/${v.id}/cancel/`, { reason: v.reason }), {
    success: "Dars bekor qilindi.",
    invalidate: ["lessons"],
    onSuccess: () => setCancelling(null),
  });
  const canMark = me.role !== "student";
  return (
    <Card>
      <CardHeader
        title="Darslar"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateInput aria-label="Boshlanish" className="h-8 w-40" value={range.from} onChange={(v) => setRange({ ...range, from: v })} />
            <span className="text-ink-400">—</span>
            <DateInput aria-label="Tugash" className="h-8 w-40" value={range.to} onChange={(v) => setRange({ ...range, to: v })} />
          </div>
        }
      />
      <DataTable
        rows={q.data?.results}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(r) => r.id}
        empty={<EmptyState title="Bu davrda dars yo'q" description={staff ? "«Darslar yaratish» tugmasi bilan jadvaldan darslar yarating." : undefined} />}
        columns={[
          {
            key: "date",
            header: "Sana",
            cell: (r) => (
              <span className={cn("whitespace-nowrap", r.date === today() && "font-semibold text-brand-700")}>
                {date(r.date)} · {time(r.start_time)}–{time(r.end_time)}
              </span>
            ),
          },
          { key: "topic", header: "Mavzu", cell: (r) => r.topic || <span className="text-ink-400">—</span> },
          { key: "room", header: "Xona", cell: (r) => r.room_name ?? "—" },
          {
            key: "status",
            header: "Holat",
            cell: (r) => (
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={tone(LESSON_STATUS, r.status)}>{label(LESSON_STATUS, r.status)}</Badge>
                {r.attendance_marked && <Badge tone="success" dot={false}>Davomat ✓</Badge>}
              </div>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "text-right whitespace-nowrap",
            cell: (r) =>
              r.status !== "cancelled" && (
                <div className="flex justify-end gap-2">
                  {canMark && r.date <= today() && (
                    <Link to={`/attendance/lesson/${r.id}`} className="text-[13px] font-medium text-brand-700 hover:underline">
                      Davomat
                    </Link>
                  )}
                  {staff && r.status === "scheduled" && (
                    <button type="button" className="text-[13px] font-medium text-danger hover:underline" onClick={() => setCancelling(r)}>
                      Bekor qilish
                    </button>
                  )}
                </div>
              ),
          },
        ]}
      />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Darsni bekor qilish"
        description={cancelling && `${date(cancelling.date)} ${time(cancelling.start_time)} dagi dars bekor qilinadi. Studentlar va ustozga xabar boradi.`}
        confirmLabel="Bekor qilish"
        loading={cancel.isPending}
        reason={{ label: "Sabab", placeholder: "Masalan: bayram kuni" }}
        onConfirm={(reason) => cancelling && cancel.mutate({ id: cancelling.id, reason })}
      />
    </Card>
  );
}

interface Sheet {
  lessons: { id: number; date: string; start_time: string; topic: string }[];
  students: { id: number; name: string; rate: number | null; records: Record<string, string> }[];
}

const CELL: Record<string, string> = {
  present: "bg-success-soft text-emerald-700",
  late: "bg-warning-soft text-amber-700",
  excused: "bg-info-soft text-sky-700",
  absent: "bg-danger-soft text-rose-700",
};
const SHORT: Record<string, string> = { present: "+", late: "K", excused: "U", absent: "−" };

function AttendanceTab({ group }: { group: Group }) {
  const [range, setRange] = useState({ from: addDays(today(), -30), to: today() });
  const q = useQuery({
    queryKey: ["attendance-sheet", group.id, range],
    queryFn: () => get<Sheet>(`/groups/${group.id}/attendance-sheet/`, { date_from: range.from, date_to: range.to }),
  });
  return (
    <Card>
      <CardHeader
        title="Davomat jadvali"
        description="+ keldi · K kechikdi · U uzrli · − kelmadi"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateInput aria-label="Boshlanish" className="h-8 w-40" value={range.from} onChange={(v) => setRange({ ...range, from: v })} />
            <span className="text-ink-400">—</span>
            <DateInput aria-label="Tugash" className="h-8 w-40" value={range.to} onChange={(v) => setRange({ ...range, to: v })} />
          </div>
        }
      />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="m-5 h-40" />
      ) : !q.data?.lessons.length ? (
        <EmptyState title="Bu davrda dars yo'q" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-ink-50">
                <th scope="col" className="sticky left-0 z-10 bg-ink-50 px-4 py-2 text-left font-semibold text-ink-600">
                  Student
                </th>
                {q.data.lessons.map((l) => (
                  <th key={l.id} scope="col" className="px-1 py-2 text-center font-medium whitespace-nowrap text-ink-500" title={l.topic}>
                    <Link to={`/attendance/lesson/${l.id}`} className="hover:text-brand-700">
                      {l.date.slice(8, 10)}.{l.date.slice(5, 7)}
                    </Link>
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-semibold text-ink-600">
                  Foiz
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.students.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-medium whitespace-nowrap text-ink-800">
                    {s.name}
                  </th>
                  {q.data!.lessons.map((l) => {
                    const st = s.records[String(l.id)];
                    return (
                      <td key={l.id} className="px-1 py-1.5 text-center">
                        <span
                          className={cn("inline-flex size-7 items-center justify-center rounded font-semibold", st ? CELL[st] : "text-ink-300")}
                          title={st ? label(ATTENDANCE_STATUS, st) : "Belgilanmagan"}
                        >
                          {st ? SHORT[st] : "·"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right">
                    <Badge tone={rateTone(s.rate)} dot={false}>
                      {percent(s.rate)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

interface Gradebook {
  assignments: { id: number; title: string; max_score: number }[];
  students: { id: number; name: string; scores: Record<string, { score: string; max_score: string }>; average_percent: number | null }[];
}

function GradebookTab({ group }: { group: Group }) {
  const q = useQuery({ queryKey: ["gradebook", group.id], queryFn: () => get<Gradebook>(`/groups/${group.id}/gradebook/`) });
  return (
    <Card>
      <CardHeader title="Baholar jurnali" />
      {q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <Skeleton className="m-5 h-40" />
      ) : !q.data?.assignments.length ? (
        <EmptyState title="Hali e'lon qilingan vazifa yo'q" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line bg-ink-50">
                <th scope="col" className="sticky left-0 bg-ink-50 px-4 py-2 text-left font-semibold text-ink-600">
                  Student
                </th>
                {q.data.assignments.map((a) => (
                  <th key={a.id} scope="col" className="max-w-[140px] px-2 py-2 text-center font-medium text-ink-500">
                    <Link to={`/assignments/${a.id}`} className="line-clamp-2 hover:text-brand-700" title={a.title}>
                      {a.title}
                    </Link>
                    <span className="text-[11px] text-ink-400">/{a.max_score}</span>
                  </th>
                ))}
                <th scope="col" className="px-4 py-2 text-right font-semibold text-ink-600">
                  O'rtacha
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data.students.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <th scope="row" className="sticky left-0 bg-surface px-4 py-2 text-left font-medium whitespace-nowrap text-ink-800">
                    {s.name}
                  </th>
                  {q.data!.assignments.map((a) => {
                    const g = s.scores[String(a.id)];
                    return (
                      <td key={a.id} className="tabular px-2 py-2 text-center">
                        {g ? Number(g.score) : <span className="text-ink-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right">
                    <Badge tone={rateTone(s.average_percent)} dot={false}>
                      {percent(s.average_percent)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AssignmentsTab({ group }: { group: Group }) {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["assignments", "group", group.id],
    queryFn: () => get<{ results: Assignment[] }>("/assignments/", { group: group.id, page_size: 100 }),
  });
  return (
    <Card>
      <CardHeader title="Vazifalar" actions={<Link to={`/assignments?group=${group.id}`} className="text-[13px] font-medium text-brand-700 hover:underline">Vazifalar bo'limi</Link>} />
      <DataTable
        rows={q.data?.results}
        loading={q.isLoading}
        error={q.error}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/assignments/${r.id}`)}
        empty={<EmptyState title="Vazifa yo'q" />}
        columns={[
          { key: "title", header: "Vazifa", cell: (r) => <span className="font-medium text-ink-900">{r.title}</span> },
          { key: "due", header: "Muddat", cell: (r) => `${date(r.due_at)} ${time(r.due_at)}` },
          { key: "max", header: "Maks. ball", cell: (r) => r.max_score, className: "tabular" },
          { key: "status", header: "Holat", cell: (r) => <Badge tone={tone(ASSIGNMENT_STATUS, r.status)}>{label(ASSIGNMENT_STATUS, r.status)}</Badge> },
        ]}
      />
    </Card>
  );
}

function GenerateLessonsModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const [from, setFrom] = useState(group.start_date > today() ? group.start_date : today());
  const [to, setTo] = useState(addDays(from, 30));
  const [result, setResult] = useState<{ created: number; skipped: { date: string; reason: string }[] } | null>(null);
  const gen = useAction(() => post<NonNullable<typeof result>>(`/groups/${group.id}/generate-lessons/`, { date_from: from, date_to: to }), {
    invalidate: ["lessons"],
    onSuccess: (r) => {
      setResult(r);
      toast.success(`${r.created} ta dars yaratildi.`);
    },
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Jadvaldan darslar yaratish"
      description={`${daysOfWeek(group.days_of_week)} · ${time(group.lesson_start_time)}–${time(group.lesson_end_time)}`}
      footer={
        result ? (
          <Button onClick={onClose}>Yopish</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button loading={gen.isPending} onClick={() => gen.mutate(undefined)}>
              Yaratish
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-ink-800">
            <strong>{result.created}</strong> ta dars yaratildi, <strong>{result.skipped.length}</strong> ta o'tkazib yuborildi.
          </p>
          {result.skipped.length > 0 && (
            <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md bg-ink-50 p-3 text-[13px]">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{date(s.date)}:</span> {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Boshlanish" required>
            {(p) => <DateInput {...p} value={from} onChange={(v) => setFrom(v)} />}
          </Field>
          <Field label="Tugash" required>
            {(p) => <DateInput {...p} value={to} onChange={(v) => setTo(v)} />}
          </Field>
          <p className="text-[13px] text-ink-500 sm:col-span-2">
            Mavjud darslar va ustoz/xona to'qnashuvi bo'lgan kunlar avtomatik o'tkazib yuboriladi.
          </p>
        </div>
      )}
    </Modal>
  );
}

export default function GroupDetailPage() {
  const { id } = useParams();
  const me = useMe();
  const staff = isStaff(me.role);
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["group", id], queryFn: () => get<Group>(`/groups/${id}/`) });
  const [tab, setTab] = useState<Tab>(me.role === "student" ? "lessons" : "students");
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const openChat = useAction(() => get<{ id: number }>(`/chat/rooms/group/${id}/`), {
    onSuccess: (room) => navigate(`/chat?room=${room.id}`),
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const g = q.data;
  if (!g) return <Spinner />;

  const tabs: { value: Tab; label: string }[] =
    me.role === "student"
      ? [
          { value: "lessons", label: "Darslar" },
          { value: "assignments", label: "Vazifalar" },
        ]
      : [
          { value: "students", label: "Studentlar" },
          { value: "lessons", label: "Darslar" },
          { value: "attendance", label: "Davomat" },
          { value: "gradebook", label: "Baholar" },
          { value: "assignments", label: "Vazifalar" },
        ];

  return (
    <>
      <PageHeader
        back={
          <Link to="/groups" className="mb-2 inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-ink-800">
            <ArrowLeft className="size-3.5" /> Guruhlar
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {g.name}
            <Badge tone={tone(GROUP_STATUS, g.status)}>{label(GROUP_STATUS, g.status)}</Badge>
          </span>
        }
        description={`${g.code} · ${g.course_name}`}
        actions={
          <>
            <Button variant="secondary" icon={<MessagesSquare className="size-4" />} onClick={() => openChat.mutate(undefined)} loading={openChat.isPending}>
              Guruh chati
            </Button>
            {staff && (
              <>
                <Button variant="secondary" icon={<CalendarPlus className="size-4" />} onClick={() => setGenerating(true)}>
                  Darslar yaratish
                </Button>
                <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                  Tahrirlash
                </Button>
              </>
            )}
          </>
        }
      />
      <Card className="mb-6 p-5">
        <DescriptionList
          className="lg:grid-cols-4"
          items={[
            ["Ustoz", g.teacher_name ?? "Biriktirilmagan"],
            ["Dars vaqti", `${daysOfWeek(g.days_of_week)} · ${time(g.lesson_start_time)}–${time(g.lesson_end_time)}`],
            ["Xona", g.room_name ?? "—"],
            ["Filial", g.branch_name],
            ["Boshlangan", date(g.start_date)],
            ["Tugaydi", date(g.end_date)],
            ["Studentlar", `${g.students_count} / ${g.capacity}`],
            ["Kurs", g.course_name],
          ]}
        />
      </Card>
      <Tabs className="mb-4" tabs={tabs} value={tab} onChange={setTab} />
      {tab === "students" && <StudentsTab group={g} />}
      {tab === "lessons" && <LessonsTab group={g} />}
      {tab === "attendance" && <AttendanceTab group={g} />}
      {tab === "gradebook" && <GradebookTab group={g} />}
      {tab === "assignments" && <AssignmentsTab group={g} />}
      {editing && <GroupForm group={g} onClose={() => setEditing(false)} />}
      {generating && <GenerateLessonsModal group={g} onClose={() => setGenerating(false)} />}
    </>
  );
}
