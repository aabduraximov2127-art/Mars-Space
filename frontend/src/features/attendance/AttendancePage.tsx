import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Clock, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { Badge, Card, EmptyState, PageHeader, rateTone, StatCard } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { DataTable, FilterBar, Pagination, Tabs } from "@/components/ui/Table";
import { get } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { addDays, date, percent, time, today } from "@/lib/format";
import { useOptions, usePagedList } from "@/lib/hooks";
import { ATTENDANCE_STATUS, LESSON_STATUS, label, tone } from "@/lib/labels";
import type { AttendanceRecord, AttendanceSummary, Group, Lesson } from "@/lib/types";

function RecordsTable({ showStudent }: { showStudent: boolean }) {
  const groups = useOptions<Group>(["groups", "attendance-filter"], "/groups/", {});
  const list = usePagedList<AttendanceRecord>("attendance", "/attendance/", { date_from: addDays(today(), -30), date_to: today() });
  const summary = useQuery({
    queryKey: ["attendance-summary", list.filters],
    queryFn: () => get<AttendanceSummary>("/attendance/summary/", list.filters),
  });
  const s = summary.data;
  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Davomat foizi" value={percent(s?.rate)} tone={rateTone(s?.rate)} icon={ClipboardCheck} loading={summary.isLoading} />
        <StatCard label="Keldi" value={s?.present ?? "—"} tone="success" icon={CheckCircle2} loading={summary.isLoading} />
        <StatCard label="Kechikdi" value={s?.late ?? "—"} tone="warning" icon={Clock} loading={summary.isLoading} />
        <StatCard label="Uzrli" value={s?.excused ?? "—"} tone="info" icon={ShieldAlert} loading={summary.isLoading} />
        <StatCard label="Kelmadi" value={s?.absent ?? "—"} tone="danger" icon={XCircle} loading={summary.isLoading} />
      </div>
      <Card>
        <FilterBar>
          <Select className="sm:w-52" aria-label="Guruh" value={String(list.filters.group ?? "")} onChange={(e) => list.setFilter("group", e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select className="sm:w-40" aria-label="Holat" value={String(list.filters.status ?? "")} onChange={(e) => list.setFilter("status", e.target.value)}>
            <option value="">Barcha holat</option>
            {Object.entries(ATTENDANCE_STATUS).map(([k, [l]]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Input type="date" className="sm:w-40" aria-label="Dan" value={String(list.filters.date_from ?? "")} onChange={(e) => list.setFilter("date_from", e.target.value)} />
          <Input type="date" className="sm:w-40" aria-label="Gacha" value={String(list.filters.date_to ?? "")} onChange={(e) => list.setFilter("date_to", e.target.value)} />
        </FilterBar>
        <DataTable
          rows={list.rows}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          rowKey={(r) => r.id}
          empty={<EmptyState title="Davomat yozuvlari topilmadi" />}
          columns={[
            { key: "date", header: "Sana", cell: (r) => <span className="whitespace-nowrap">{date(r.date)} {time(r.start_time)}</span> },
            ...(showStudent ? [{ key: "student", header: "Student", cell: (r: AttendanceRecord) => <span className="font-medium text-ink-900">{r.student_name}</span> }] : []),
            { key: "group", header: "Guruh", cell: (r) => r.group_name },
            { key: "topic", header: "Mavzu", cell: (r) => r.topic || "—" },
            { key: "status", header: "Holat", cell: (r) => <Badge tone={tone(ATTENDANCE_STATUS, r.status)}>{label(ATTENDANCE_STATUS, r.status)}</Badge> },
            { key: "comment", header: "Izoh", cell: (r) => r.comment || "—" },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
    </>
  );
}

function LessonsToMark() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"unmarked" | "today">("unmarked");
  const unmarked = usePagedList<Lesson>("unmarked", "/attendance/unmarked-lessons/");
  const todayLessons = useQuery({
    queryKey: ["lessons", "today"],
    queryFn: () => get<{ results: Lesson[] }>("/lessons/", { date: today(), page_size: 100 }),
    enabled: mode === "today",
  });
  const rows = mode === "unmarked" ? unmarked.rows : todayLessons.data?.results;
  return (
    <Card>
      <Tabs
        className="px-4"
        value={mode}
        onChange={setMode}
        tabs={[
          { value: "unmarked", label: "Belgilanmagan darslar", count: unmarked.count },
          { value: "today", label: "Bugungi darslar" },
        ]}
      />
      <DataTable
        rows={rows}
        loading={mode === "unmarked" ? unmarked.isLoading : todayLessons.isLoading}
        error={mode === "unmarked" ? unmarked.error : todayLessons.error}
        rowKey={(r) => r.id}
        onRowClick={(r) => r.status !== "cancelled" && navigate(`/attendance/lesson/${r.id}`)}
        empty={<EmptyState icon={CheckCircle2} title={mode === "unmarked" ? "Barcha darslar belgilangan" : "Bugun dars yo'q"} />}
        columns={[
          { key: "date", header: "Sana", cell: (r) => <span className="whitespace-nowrap">{date(r.date)} · {time(r.start_time)}–{time(r.end_time)}</span> },
          {
            key: "group",
            header: "Guruh",
            cell: (r) => (
              <div>
                <p className="font-medium text-ink-900">{r.group_name}</p>
                <p className="text-[13px] text-ink-500">{r.teacher_name}</p>
              </div>
            ),
          },
          { key: "room", header: "Xona", cell: (r) => r.room_name ?? "—" },
          {
            key: "status",
            header: "Holat",
            cell: (r) =>
              r.attendance_marked ? <Badge tone="success">Belgilangan</Badge> : <Badge tone={tone(LESSON_STATUS, r.status)}>{label(LESSON_STATUS, r.status)}</Badge>,
          },
          {
            key: "go",
            header: "",
            className: "text-right",
            cell: (r) =>
              r.status !== "cancelled" && (
                <Link to={`/attendance/lesson/${r.id}`} className="text-[13px] font-medium whitespace-nowrap text-brand-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {r.attendance_marked ? "Ko'rish" : "Belgilash"} →
                </Link>
              ),
          },
        ]}
      />
      {mode === "unmarked" && <Pagination page={unmarked.page} pageSize={unmarked.pageSize} count={unmarked.count} onPage={unmarked.setPage} />}
    </Card>
  );
}

export default function AttendancePage() {
  const me = useMe();
  const [tab, setTab] = useState<"mark" | "records">("mark");
  if (me.role === "student") {
    return (
      <>
        <PageHeader title="Davomatim" description="So'nggi 30 kun (filtr orqali o'zgartiring)." />
        <RecordsTable showStudent={false} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Davomat" description="Darslar bo'yicha davomatni belgilang va tarixni ko'ring." />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "mark", label: "Belgilash" },
          { value: "records", label: "Yozuvlar va statistika" },
        ]}
      />
      {tab === "mark" ? <LessonsToMark /> : <RecordsTable showStudent />}
    </>
  );
}
