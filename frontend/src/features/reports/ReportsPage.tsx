import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BarSeries, compactMoney } from "@/components/charts";
import { Button } from "@/components/ui/Button";
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, ProgressBar, rateTone, Skeleton, StatCard } from "@/components/ui/display";
import { Input, Select } from "@/components/ui/form";
import { DataTable, Tabs } from "@/components/ui/Table";
import { downloadFile, get, parseApiError } from "@/lib/api";
import { isStaff, useMe } from "@/lib/auth";
import { addDays, money, MONTHS, num, percent, phone, today } from "@/lib/format";
import { useOptions } from "@/lib/hooks";
import { PAYMENT_METHOD, label } from "@/lib/labels";
import type { Branch } from "@/lib/types";

interface Finance {
  total: string;
  count: number;
  by_method: { method: string; amount: string; count: number }[];
  by_course: { course: string; amount: string }[];
  by_branch: { branch: string; amount: string }[];
  by_month: { month: string; amount: string }[];
  debt: { total_debt: string; debtors_count: number; total_charged: string; total_paid: string };
  debtors: { membership: number; student_name: string; phone: string; group_name: string; debt: string }[];
}

interface AttendanceRow {
  group: number;
  group_name: string;
  course_name: string;
  teacher_name: string | null;
  lessons: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  rate: number | null;
}

interface AcademicRow {
  group: number;
  group_name: string;
  course_name: string;
  teacher_name: string | null;
  students: number;
  assignments: number;
  submissions: number;
  graded: number;
  submission_rate: number | null;
  average_percent: number | null;
}

type Filters = { date_from: string; date_to: string; branch: string };

function FinanceReport({ filters }: { filters: Filters }) {
  const q = useQuery({ queryKey: ["report", "finance", filters], queryFn: () => get<Finance>("/reports/finance/", filters) });
  const [exporting, setExporting] = useState(false);
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Davr tushumi" value={money(d?.total)} tone="success" loading={q.isLoading} hint={d && `${d.count} ta to'lov`} />
        <StatCard label="Umumiy qarz" value={money(d?.debt.total_debt)} tone="danger" loading={q.isLoading} hint={d && `${d.debt.debtors_count} ta qarzdor`} />
        <StatCard label="Jami hisoblangan" value={money(d?.debt.total_charged)} loading={q.isLoading} />
        <StatCard label="Jami to'langan" value={money(d?.debt.total_paid)} loading={q.isLoading} />
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader
            title="Tushum oylar bo'yicha"
            actions={
              <Button
                size="sm"
                variant="secondary"
                icon={<Download className="size-4" />}
                loading={exporting}
                onClick={async () => {
                  setExporting(true);
                  const qs = new URLSearchParams({ ...filters, export: "csv" });
                  try {
                    await downloadFile(`/reports/finance/?${qs}`, "tolovlar.csv");
                  } catch (e) {
                    toast.error(parseApiError(e).detail);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                CSV yuklab olish
              </Button>
            }
          />
          <div className="p-4">
            {q.isLoading ? (
              <Skeleton className="h-60" />
            ) : (
              <BarSeries
                ariaLabel="Oylik tushum"
                data={d?.by_month ?? []}
                x="month"
                y="amount"
                xFormat={(m) => MONTHS[Number(m.slice(5, 7)) - 1]?.slice(0, 3) ?? m}
                labelFormat={(m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`}
                tickFormat={compactMoney}
                valueFormat={(v) => money(v)}
              />
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="To'lov usullari" />
          <DataTable
            rows={d?.by_method}
            loading={q.isLoading}
            rowKey={(r) => r.method}
            empty={<EmptyState title="To'lov yo'q" />}
            columns={[
              { key: "m", header: "Usul", cell: (r) => label(PAYMENT_METHOD, r.method) },
              { key: "c", header: "Soni", cell: (r) => r.count, className: "tabular" },
              { key: "a", header: "Summa", cell: (r) => money(r.amount), className: "tabular text-right", headerClassName: "text-right" },
            ]}
          />
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Kurslar kesimida" />
          <DataTable
            rows={d?.by_course}
            loading={q.isLoading}
            rowKey={(r) => r.course}
            empty={<EmptyState title="Ma'lumot yo'q" />}
            columns={[
              { key: "c", header: "Kurs", cell: (r) => r.course },
              { key: "a", header: "Tushum", cell: (r) => money(r.amount), className: "tabular text-right", headerClassName: "text-right" },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Eng katta qarzlar" />
          <DataTable
            rows={d?.debtors.slice(0, 15)}
            loading={q.isLoading}
            rowKey={(r) => r.membership}
            empty={<EmptyState title="Qarzdorlar yo'q" />}
            columns={[
              {
                key: "s",
                header: "Student",
                cell: (r) => (
                  <div>
                    <p className="font-medium text-ink-900">{r.student_name}</p>
                    <p className="text-[13px] text-ink-500">{phone(r.phone)}</p>
                  </div>
                ),
              },
              { key: "g", header: "Guruh", cell: (r) => r.group_name },
              { key: "d", header: "Qarz", cell: (r) => <span className="tabular font-semibold text-danger">{money(r.debt)}</span> },
            ]}
          />
        </Card>
      </div>
    </>
  );
}

function AttendanceReport({ filters }: { filters: Filters }) {
  const q = useQuery({ queryKey: ["report", "attendance", filters], queryFn: () => get<AttendanceRow[]>("/reports/attendance/", filters) });
  return (
    <Card>
      <CardHeader title="Guruhlar bo'yicha davomat" />
      <DataTable
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(r) => r.group}
        empty={<EmptyState title="Ma'lumot yo'q" />}
        columns={[
          {
            key: "g",
            header: "Guruh",
            cell: (r) => (
              <div>
                <p className="font-medium text-ink-900">{r.group_name}</p>
                <p className="text-[13px] text-ink-500">
                  {r.course_name} · {r.teacher_name ?? "—"}
                </p>
              </div>
            ),
          },
          { key: "l", header: "Darslar", cell: (r) => r.lessons, className: "tabular" },
          { key: "p", header: "Keldi", cell: (r) => r.present, className: "tabular" },
          { key: "lt", header: "Kechikdi", cell: (r) => r.late, className: "tabular" },
          { key: "e", header: "Uzrli", cell: (r) => r.excused, className: "tabular" },
          { key: "a", header: "Kelmadi", cell: (r) => r.absent, className: "tabular" },
          {
            key: "r",
            header: "Foiz",
            cell: (r) => (
              <div className="w-32">
                <div className="mb-1 flex justify-between text-[13px]">
                  <Badge tone={rateTone(r.rate)} dot={false}>
                    {percent(r.rate)}
                  </Badge>
                </div>
                <ProgressBar value={r.rate} tone={rateTone(r.rate)} />
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}

function AcademicReport({ filters }: { filters: Filters }) {
  const q = useQuery({ queryKey: ["report", "academic", filters], queryFn: () => get<AcademicRow[]>("/reports/academic/", filters) });
  return (
    <Card>
      <CardHeader title="O'zlashtirish" description="O'rtacha ball va topshirish darajasi (barcha vaqt)" />
      <DataTable
        rows={q.data}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => q.refetch()}
        rowKey={(r) => r.group}
        empty={<EmptyState title="Ma'lumot yo'q" />}
        columns={[
          {
            key: "g",
            header: "Guruh",
            cell: (r) => (
              <div>
                <p className="font-medium text-ink-900">{r.group_name}</p>
                <p className="text-[13px] text-ink-500">
                  {r.course_name} · {r.teacher_name ?? "—"}
                </p>
              </div>
            ),
          },
          { key: "s", header: "Studentlar", cell: (r) => r.students, className: "tabular" },
          { key: "a", header: "Vazifalar", cell: (r) => r.assignments, className: "tabular" },
          { key: "sub", header: "Topshirish", cell: (r) => percent(r.submission_rate), className: "tabular" },
          { key: "gr", header: "Baholangan", cell: (r) => num(r.graded), className: "tabular" },
          {
            key: "avg",
            header: "O'rtacha ball",
            cell: (r) => (
              <Badge tone={rateTone(r.average_percent)} dot={false}>
                {percent(r.average_percent)}
              </Badge>
            ),
          },
        ]}
      />
    </Card>
  );
}

export default function ReportsPage() {
  const me = useMe();
  const staff = isStaff(me.role);
  const [tab, setTab] = useState<"finance" | "attendance" | "academic">(staff ? "finance" : "attendance");
  const [filters, setFilters] = useState<Filters>({ date_from: addDays(today(), -90), date_to: today(), branch: "" });
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  return (
    <>
      <PageHeader title="Hisobotlar" />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="space-y-1 text-[13px] font-medium text-ink-600">
          <span>Dan</span>
          <Input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
        </label>
        <label className="space-y-1 text-[13px] font-medium text-ink-600">
          <span>Gacha</span>
          <Input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
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
      </Card>
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          ...(staff ? [{ value: "finance" as const, label: "Moliya" }] : []),
          { value: "attendance" as const, label: "Davomat" },
          { value: "academic" as const, label: "O'zlashtirish" },
        ]}
      />
      {tab === "finance" && staff && <FinanceReport filters={filters} />}
      {tab === "attendance" && <AttendanceReport filters={filters} />}
      {tab === "academic" && <AcademicReport filters={filters} />}
    </>
  );
}
