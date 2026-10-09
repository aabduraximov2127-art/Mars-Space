import { Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader, ProgressBar } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/form";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { isStaff, useMe } from "@/lib/auth";
import { date, daysOfWeek, time } from "@/lib/format";
import { useOptions, usePagedList } from "@/lib/hooks";
import { GROUP_STATUS, label, tone } from "@/lib/labels";
import type { Branch, Course, Group } from "@/lib/types";

import { GroupForm } from "./GroupForm";

export default function GroupsPage() {
  const me = useMe();
  const staff = isStaff(me.role);
  const navigate = useNavigate();
  const list = usePagedList<Group>("groups", "/groups/");
  const courses = useOptions<Course>(["courses", "options"], "/courses/", {}, staff);
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title={staff ? "Guruhlar" : "Guruhlarim"}
        description={staff ? "Guruhlar, ularning ustozlari va dars vaqtlari." : undefined}
        actions={
          staff && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Guruh yaratish
            </Button>
          )
        }
      />
      <Card>
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder="Guruh nomi yoki kodi" />
          <Select className="sm:w-44" aria-label="Holat" value={String(list.filters.status ?? "")} onChange={(e) => list.setFilter("status", e.target.value)}>
            <option value="">Barcha holat</option>
            {Object.entries(GROUP_STATUS).map(([k, [l]]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          {staff && (
            <Select className="sm:w-52" aria-label="Kurs" value={String(list.filters.course ?? "")} onChange={(e) => list.setFilter("course", e.target.value)}>
              <option value="">Barcha kurslar</option>
              {courses.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
          {me.role === "superadmin" && (
            <Select className="sm:w-52" aria-label="Filial" value={String(list.filters.branch ?? "")} onChange={(e) => list.setFilter("branch", e.target.value)}>
              <option value="">Barcha filiallar</option>
              {branches.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </FilterBar>
        <DataTable
          rows={list.rows}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/groups/${r.id}`)}
          empty={
            <EmptyState
              title="Guruhlar topilmadi"
              action={
                staff && (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    Guruh yaratish
                  </Button>
                )
              }
            />
          }
          columns={[
            {
              key: "name",
              header: "Guruh",
              cell: (r) => (
                <div>
                  <p className="font-medium text-ink-900">{r.name}</p>
                  <p className="text-[13px] text-ink-500">
                    {r.code} · {r.course_name}
                  </p>
                </div>
              ),
            },
            ...(me.role !== "teacher" ? [{ key: "teacher", header: "Ustoz", cell: (r: Group) => r.teacher_name ?? "—" }] : []),
            ...(me.role === "superadmin" ? [{ key: "branch", header: "Filial", cell: (r: Group) => r.branch_name }] : []),
            {
              key: "time",
              header: "Dars vaqti",
              cell: (r) => (
                <div className="whitespace-nowrap">
                  <p>{daysOfWeek(r.days_of_week)}</p>
                  <p className="text-[13px] text-ink-500">
                    {time(r.lesson_start_time)}–{time(r.lesson_end_time)} {r.room_name ? `· ${r.room_name}` : ""}
                  </p>
                </div>
              ),
            },
            {
              key: "students",
              header: "Studentlar",
              cell: (r) => (
                <div className="w-28">
                  <p className="tabular text-[13px]">
                    {r.students_count} / {r.capacity}
                  </p>
                  <ProgressBar value={(r.students_count / r.capacity) * 100} tone={r.students_count >= r.capacity ? "danger" : "brand"} />
                </div>
              ),
            },
            { key: "start", header: "Boshlangan", cell: (r) => date(r.start_date) },
            { key: "status", header: "Holat", cell: (r) => <Badge tone={tone(GROUP_STATUS, r.status)}>{label(GROUP_STATUS, r.status)}</Badge> },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      {creating && <GroupForm onClose={() => setCreating(false)} onSaved={(g) => navigate(`/groups/${g.id}`)} />}
    </>
  );
}
