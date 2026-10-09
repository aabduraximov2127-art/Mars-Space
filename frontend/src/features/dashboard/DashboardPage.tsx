import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Coins,
  FileText,
  Percent,
  Star,
  UserCog,
  Users,
  UsersRound,
  Wallet,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { AreaSeries, BarSeries, compactMoney } from "@/components/charts";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  ProgressBar,
  rateTone,
  Skeleton,
  StatCard,
} from "@/components/ui/display";
import { Select } from "@/components/ui/form";
import { DataTable } from "@/components/ui/Table";
import { DateInput } from "@/components/ui/dates";
import { get } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { date, daysOfWeek, money, MONTHS, num, percent, relative, time, today } from "@/lib/format";
import { useOptions } from "@/lib/hooks";
import { AUDIT_ACTION, LESSON_STATUS, SUBMISSION_STATUS, label, tone } from "@/lib/labels";
import type { AttendanceSummary, Branch } from "@/lib/types";

interface LessonRow {
  id: number;
  group: number;
  group_name: string;
  date: string;
  start_time: string;
  end_time: string;
  room_name: string | null;
  topic: string;
  status: string;
}

interface StaffData {
  kpis: {
    students: number;
    teachers: number;
    active_groups: number;
    courses: number;
    today_lessons: number;
    today_lessons_marked: number;
    today_attendance_rate: number | null;
    revenue: string;
    payments_count: number;
    total_debt: string;
    debtors: number;
    new_memberships: number;
  };
  charts: {
    revenue_by_day: { date: string; amount: string }[];
    monthly: { month: string; revenue: string; new_students: number }[];
    weekly_attendance: { week: string; rate: number | null }[];
  };
  recent_activity: { id: number; action: string; actor_name: string; entity_repr: string; created_at: string }[];
  branches?: { id: number; name: string; students: number; active_groups: number; revenue: string; debt: string }[];
}

const monthShort = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1]?.slice(0, 3) ?? m;
const dayShort = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7);

function Greeting() {
  const me = useMe();
  const h = new Date().getHours();
  const hello = h < 12 ? "Xayrli tong" : h < 18 ? "Xayrli kun" : "Xayrli kech";
  return (
    <PageHeader
      title={`${hello}, ${me.first_name}!`}
      description={`Bugun ${date(today())}. ${me.branch_name ? me.branch_name + "." : "Barcha filiallar."}`}
    />
  );
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function StaffDashboard() {
  const me = useMe();
  const firstOfMonth = today().slice(0, 8) + "01";
  const [filters, setFilters] = useState({ date_from: firstOfMonth, date_to: today(), branch: "" });
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const q = useQuery({
    queryKey: ["dashboard", filters],
    queryFn: () => get<StaffData>("/reports/dashboard/", filters),
  });
  const d = q.data;
  const k = d?.kpis;

  return (
    <>
      <Greeting />
      <Card className="mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="space-y-1 text-[13px] font-medium text-ink-600">
          <span>Davr boshi</span>
          <DateInput value={filters.date_from} max={filters.date_to} onChange={(v) => setFilters({ ...filters, date_from: v })} />
        </label>
        <label className="space-y-1 text-[13px] font-medium text-ink-600">
          <span>Davr oxiri</span>
          <DateInput value={filters.date_to} min={filters.date_from} onChange={(v) => setFilters({ ...filters, date_to: v })} />
        </label>
        {me.role === "superadmin" && (
          <label className="space-y-1 text-[13px] font-medium text-ink-600">
            <span>Filial</span>
            <Select value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })} className="min-w-48">
              <option value="">Barcha filiallar</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </label>
        )}
        <p className="pb-2.5 text-[13px] text-ink-500">Tushum va yangi a'zoliklar shu davr bo'yicha hisoblanadi.</p>
      </Card>

      {q.error ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          <KpiGrid>
            <StatCard label="Faol studentlar" value={num(k?.students)} icon={Users} loading={q.isLoading} hint={k && `+${k.new_memberships} yangi a'zolik`} />
            <StatCard label="Ustozlar" value={num(k?.teachers)} icon={UserCog} tone="info" loading={q.isLoading} hint={k && `${k.courses} ta faol kurs`} />
            <StatCard label="Faol guruhlar" value={num(k?.active_groups)} icon={UsersRound} tone="success" loading={q.isLoading} />
            <StatCard
              label="Bugungi darslar"
              value={num(k?.today_lessons)}
              icon={CalendarDays}
              tone="warning"
              loading={q.isLoading}
              hint={k && `${k.today_lessons_marked} tasida davomat belgilangan · ${percent(k.today_attendance_rate)}`}
            />
            <StatCard label="Davr tushumi" value={money(k?.revenue, "")} icon={Wallet} tone="success" loading={q.isLoading} hint={k && `${k.payments_count} ta to'lov · so'm`} />
            <StatCard label="Umumiy qarzdorlik" value={money(k?.total_debt, "")} icon={WalletCards} tone="danger" loading={q.isLoading} hint={k && `${k.debtors} ta qarzdor · so'm`} />
            <StatCard label="Bugungi davomat" value={percent(k?.today_attendance_rate)} icon={Percent} tone={rateTone(k?.today_attendance_rate)} loading={q.isLoading} />
            <StatCard label="Kurslar" value={num(k?.courses)} icon={BookOpen} tone="brand" loading={q.isLoading} />
          </KpiGrid>

          <div className="mb-6 grid items-start gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader title="Kunlik tushum" description="Tanlangan davr, so'm" />
              <div className="p-4">
                {q.isLoading ? (
                  <Skeleton className="h-60" />
                ) : (
                  <BarSeries
                    ariaLabel="Kunlik tushum grafigi"
                    data={d?.charts.revenue_by_day ?? []}
                    x="date"
                    y="amount"
                    xFormat={dayShort}
                    labelFormat={(v) => date(v)}
                    tickFormat={compactMoney}
                    valueFormat={(v) => money(v)}
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Haftalik davomat" description="So'nggi 8 hafta, %" />
              <div className="p-4">
                {q.isLoading ? (
                  <Skeleton className="h-60" />
                ) : (
                  <AreaSeries
                    ariaLabel="Haftalik davomat foizi grafigi"
                    data={d?.charts.weekly_attendance ?? []}
                    x="week"
                    y="rate"
                    domain={[0, 100]}
                    xFormat={dayShort}
                    labelFormat={(v) => `${date(v)} haftasi`}
                    tickFormat={(v) => `${v}%`}
                    valueFormat={(v) => `${v}%`}
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Oylik tushum" description="So'nggi 6 oy, so'm" />
              <div className="p-4">
                {q.isLoading ? (
                  <Skeleton className="h-60" />
                ) : (
                  <BarSeries
                    ariaLabel="Oylik tushum grafigi"
                    data={d?.charts.monthly ?? []}
                    x="month"
                    y="revenue"
                    xFormat={monthShort}
                    labelFormat={(m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`}
                    tickFormat={compactMoney}
                    valueFormat={(v) => money(v)}
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="Yangi a'zoliklar" description="So'nggi 6 oy" />
              <div className="p-4">
                {q.isLoading ? (
                  <Skeleton className="h-60" />
                ) : (
                  <BarSeries
                    ariaLabel="Oylik yangi a'zoliklar grafigi"
                    data={d?.charts.monthly ?? []}
                    x="month"
                    y="new_students"
                    xFormat={monthShort}
                    labelFormat={(m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`}
                    valueFormat={(v) => `${v} ta`}
                  />
                )}
              </div>
            </Card>
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[1.4fr_1fr]">
            {d?.branches ? (
              <Card>
                <CardHeader title="Filiallar kesimida" />
                <DataTable
                  rows={d.branches}
                  rowKey={(r) => r.id}
                  columns={[
                    { key: "name", header: "Filial", cell: (r) => <span className="font-medium text-ink-900">{r.name}</span> },
                    { key: "students", header: "Studentlar", cell: (r) => num(r.students), className: "tabular" },
                    { key: "groups", header: "Guruhlar", cell: (r) => num(r.active_groups), className: "tabular" },
                    { key: "revenue", header: "Tushum", cell: (r) => money(r.revenue), className: "tabular" },
                    {
                      key: "debt",
                      header: "Qarz",
                      cell: (r) => <span className={Number(r.debt) > 0 ? "text-danger" : ""}>{money(r.debt)}</span>,
                      className: "tabular",
                    },
                  ]}
                />
              </Card>
            ) : (
              <Card>
                <CardHeader title="Tezkor havolalar" />
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                  {[
                    ["/students", "Studentlar", Users],
                    ["/groups", "Guruhlar", UsersRound],
                    ["/payments", "To'lov qabul qilish", Wallet],
                    ["/debtors", "Qarzdorlar", WalletCards],
                    ["/schedule", "Dars jadvali", CalendarDays],
                    ["/attendance", "Davomat", ClipboardCheck],
                  ].map(([to, text, Icon]) => {
                    const I = Icon as typeof Users;
                    return (
                      <Link
                        key={to as string}
                        to={to as string}
                        className="flex items-center gap-3 rounded-lg border border-line p-3 font-medium text-ink-800 transition-colors hover:border-brand-300 hover:bg-brand-50"
                      >
                        <span className="rounded-md bg-brand-50 p-2 text-brand-700">
                          <I className="size-4" aria-hidden />
                        </span>
                        {text as string}
                      </Link>
                    );
                  })}
                </div>
              </Card>
            )}
            <Card>
              <CardHeader title="So'nggi faoliyat" />
              {q.isLoading ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : d?.recent_activity.length ? (
                <ul className="divide-y divide-line">
                  {d.recent_activity.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <p className="text-ink-800">
                        <span className="font-medium">{a.actor_name}</span> · {AUDIT_ACTION[a.action] ?? a.action}
                      </p>
                      <p className="truncate text-[13px] text-ink-500">
                        {a.entity_repr} · {relative(a.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Faoliyat yo'q" />
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}

interface TeacherData {
  kpis: {
    groups: number;
    students: number;
    today_lessons: number;
    unmarked_lessons: number;
    pending_reviews: number;
    week_lessons: number;
    attendance_rate_30d: number | null;
  };
  today_lessons: LessonRow[];
  unmarked_lessons: LessonRow[];
  pending_reviews: {
    id: number;
    assignment: number;
    assignment_title: string;
    student_name: string;
    submitted_at: string;
    is_late: boolean;
    status: string;
  }[];
  groups: {
    id: number;
    name: string;
    code: string;
    course_name: string;
    students_count: number;
    days_of_week: number[];
    lesson_start_time: string | null;
    lesson_end_time: string | null;
  }[];
}

function LessonList({ lessons, empty, markLink }: { lessons: LessonRow[]; empty: string; markLink?: boolean }) {
  if (!lessons.length) return <EmptyState title={empty} className="py-8" />;
  return (
    <ul className="divide-y divide-line">
      {lessons.map((l) => (
        <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <p className="font-medium text-ink-900">{l.group_name}</p>
            <p className="text-[13px] text-ink-500">
              {date(l.date)} · {time(l.start_time)}–{time(l.end_time)}
              {l.room_name && ` · ${l.room_name}`}
            </p>
          </div>
          {markLink ? (
            <Link to={`/attendance/lesson/${l.id}`} className="shrink-0 text-[13px] font-medium text-brand-700 hover:underline">
              Belgilash →
            </Link>
          ) : (
            <Badge tone={tone(LESSON_STATUS, l.status)}>{label(LESSON_STATUS, l.status)}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

function TeacherDashboard() {
  const q = useQuery({ queryKey: ["dashboard", "teacher"], queryFn: () => get<TeacherData>("/reports/dashboard/") });
  const d = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <Greeting />
      <KpiGrid>
        <StatCard label="Bugungi darslar" value={num(d?.kpis.today_lessons)} icon={CalendarClock} loading={q.isLoading} hint={d && `Shu hafta: ${d.kpis.week_lessons} ta`} />
        <StatCard label="Davomati belgilanmagan" value={num(d?.kpis.unmarked_lessons)} icon={AlertCircle} tone={d?.kpis.unmarked_lessons ? "danger" : "success"} loading={q.isLoading} />
        <StatCard label="Tekshirilmagan ishlar" value={num(d?.kpis.pending_reviews)} icon={FileText} tone="warning" loading={q.isLoading} />
        <StatCard label="Davomat (30 kun)" value={percent(d?.kpis.attendance_rate_30d)} icon={Percent} tone={rateTone(d?.kpis.attendance_rate_30d)} loading={q.isLoading} hint={d && `${d.kpis.groups} guruh · ${d.kpis.students} student`} />
      </KpiGrid>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Bugungi darslar" />
          {q.isLoading ? <Skeleton className="m-5 h-24" /> : <LessonList lessons={d?.today_lessons ?? []} empty="Bugun dars yo'q" markLink />}
        </Card>
        <Card>
          <CardHeader title="Davomati belgilanmagan darslar" description="So'nggi 30 kun" />
          {q.isLoading ? <Skeleton className="m-5 h-24" /> : <LessonList lessons={d?.unmarked_lessons ?? []} empty="Hammasi belgilangan 🎉" markLink />}
        </Card>
        <Card>
          <CardHeader title="Tekshirilishi kerak" actions={<Link to="/assignments" className="text-[13px] font-medium text-brand-700 hover:underline">Barcha vazifalar</Link>} />
          {q.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : d?.pending_reviews.length ? (
            <ul className="divide-y divide-line">
              {d.pending_reviews.map((s) => (
                <li key={s.id}>
                  <Link to={`/assignments/${s.assignment}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                    <span className="min-w-0">
                      <span className="block font-medium text-ink-900">{s.student_name}</span>
                      <span className="block truncate text-[13px] text-ink-500">
                        {s.assignment_title} · {relative(s.submitted_at)}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1.5">
                      {s.is_late && <Badge tone="warning">Kechikkan</Badge>}
                      <Badge tone={tone(SUBMISSION_STATUS, s.status)}>{label(SUBMISSION_STATUS, s.status)}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Tekshiriladigan ish yo'q" className="py-8" />
          )}
        </Card>
        <Card>
          <CardHeader title="Guruhlarim" />
          {q.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : (
            <ul className="divide-y divide-line">
              {d?.groups.map((g) => (
                <li key={g.id}>
                  <Link to={`/groups/${g.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                    <span>
                      <span className="block font-medium text-ink-900">
                        {g.name} <span className="font-normal text-ink-400">· {g.code}</span>
                      </span>
                      <span className="block text-[13px] text-ink-500">
                        {g.course_name} · {daysOfWeek(g.days_of_week)} {time(g.lesson_start_time)}
                      </span>
                    </span>
                    <Badge tone="brand" dot={false}>
                      {g.students_count} student
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

interface StudentData {
  kpis: {
    groups: number;
    attendance_rate: number | null;
    pending_assignments: number;
    average_percent: number | null;
    debt: string;
    coins: number;
  };
  attendance: AttendanceSummary;
  upcoming_lessons: LessonRow[];
  assignments_todo: { id: number; title: string; group_name: string; due_at: string; status: string; overdue: boolean }[];
  recent_grades: { id: number; assignment: number; assignment_title: string; score: string; max_score: string; percent: number | null; created_at: string }[];
  groups: { id: number; name: string; code: string; course_name: string; teacher_name: string | null; status: string; days_of_week: number[]; lesson_start_time: string | null; lesson_end_time: string | null }[];
}

function StudentDashboard() {
  const q = useQuery({ queryKey: ["dashboard", "student"], queryFn: () => get<StudentData>("/reports/dashboard/") });
  const d = q.data;
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const debt = Number(d?.kpis.debt ?? 0);
  return (
    <>
      <Greeting />
      {debt > 0 && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/20 bg-danger-soft px-4 py-3 text-rose-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="size-5" aria-hidden />
            To'lov bo'yicha qarzdorlik: <strong className="tabular">{money(d?.kpis.debt)}</strong>
          </span>
          <Link to="/payments" className="font-medium underline">
            Batafsil
          </Link>
        </div>
      )}
      <KpiGrid>
        <StatCard label="Davomat" value={percent(d?.kpis.attendance_rate)} icon={ClipboardCheck} tone={rateTone(d?.kpis.attendance_rate)} loading={q.isLoading} hint={d && `${d.attendance.present + d.attendance.late} / ${d.attendance.marked} dars`} />
        <StatCard label="Bajarilishi kerak" value={num(d?.kpis.pending_assignments)} icon={FileText} tone="warning" loading={q.isLoading} hint="vazifa" />
        <StatCard label="O'rtacha baho" value={percent(d?.kpis.average_percent)} icon={Star} tone="success" loading={q.isLoading} />
        <StatCard label="Coinlar" value={num(d?.kpis.coins)} icon={Coins} tone="warning" loading={q.isLoading} />
      </KpiGrid>
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Yaqin darslar" actions={<Link to="/schedule" className="text-[13px] font-medium text-brand-700 hover:underline">Jadval</Link>} />
          {q.isLoading ? <Skeleton className="m-5 h-24" /> : <LessonList lessons={d?.upcoming_lessons ?? []} empty="Yaqin darslar yo'q" />}
        </Card>
        <Card>
          <CardHeader title="Vazifalar" actions={<Link to="/assignments" className="text-[13px] font-medium text-brand-700 hover:underline">Barchasi</Link>} />
          {q.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : d?.assignments_todo.length ? (
            <ul className="divide-y divide-line">
              {d.assignments_todo.map((a) => (
                <li key={a.id}>
                  <Link to={`/assignments/${a.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink-900">{a.title}</span>
                      <span className="block text-[13px] text-ink-500">
                        {a.group_name} · muddat {date(a.due_at)} {time(a.due_at)}
                      </span>
                    </span>
                    {a.overdue ? <Badge tone="danger">Muddati o'tgan</Badge> : <Badge tone={tone(SUBMISSION_STATUS, a.status)}>{label(SUBMISSION_STATUS, a.status)}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Barcha vazifalar topshirilgan" className="py-8" />
          )}
        </Card>
        <Card>
          <CardHeader title="So'nggi baholar" actions={<Link to="/grades" className="text-[13px] font-medium text-brand-700 hover:underline">Barchasi</Link>} />
          {q.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : d?.recent_grades.length ? (
            <ul className="divide-y divide-line">
              {d.recent_grades.map((g) => (
                <li key={g.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-medium text-ink-900">{g.assignment_title}</span>
                    <span className="tabular shrink-0 font-semibold text-ink-900">
                      {Number(g.score)} / {Number(g.max_score)}
                    </span>
                  </div>
                  <div className="mt-2">
                    <ProgressBar value={g.percent} tone={rateTone(g.percent)} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Hali baho yo'q" className="py-8" />
          )}
        </Card>
        <Card>
          <CardHeader title="Guruhlarim" />
          {q.isLoading ? (
            <Skeleton className="m-5 h-24" />
          ) : (
            <ul className="divide-y divide-line">
              {d?.groups.map((g) => (
                <li key={g.id}>
                  <Link to={`/groups/${g.id}`} className="block px-5 py-3 hover:bg-ink-50">
                    <span className="block font-medium text-ink-900">{g.name}</span>
                    <span className="block text-[13px] text-ink-500">
                      {g.course_name} · {g.teacher_name ?? "Ustoz biriktirilmagan"} · {daysOfWeek(g.days_of_week)}{" "}
                      {time(g.lesson_start_time)}–{time(g.lesson_end_time)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const me = useMe();
  if (me.role === "teacher") return <TeacherDashboard />;
  if (me.role === "student") return <StudentDashboard />;
  return <StaffDashboard />;
}
