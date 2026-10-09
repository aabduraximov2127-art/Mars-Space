import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { Button } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/form";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { useMe } from "@/lib/auth";
import { date, time } from "@/lib/format";
import { useOptions, usePagedList } from "@/lib/hooks";
import { ASSIGNMENT_STATUS, SUBMISSION_STATUS, label, tone } from "@/lib/labels";
import type { Assignment, Group } from "@/lib/types";

import { AssignmentForm } from "./AssignmentForm";

export default function AssignmentsPage() {
  const me = useMe();
  const student = me.role === "student";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const list = usePagedList<Assignment>("assignments", "/assignments/", { group: params.get("group") ?? undefined });
  const groups = useOptions<Group>(["groups", "assignment-filter"], "/groups/", {});
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => Date.now());

  return (
    <>
      <PageHeader
        title="Vazifalar"
        description={student ? "Guruhlaringizdagi uy vazifalari va topshiriqlar." : "Guruhlarga berilgan vazifalar va topshiriqlarni tekshirish."}
        actions={
          !student && (
            <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Vazifa berish
            </Button>
          )
        }
      />
      <Card>
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder="Vazifa nomi" />
          <Select className="sm:w-52" aria-label="Guruh" value={String(list.filters.group ?? "")} onChange={(e) => list.setFilter("group", e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select className="sm:w-44" aria-label="Holat" value={String(list.filters.status ?? "")} onChange={(e) => list.setFilter("status", e.target.value)}>
            <option value="">Barcha holat</option>
            {Object.entries(ASSIGNMENT_STATUS)
              .filter(([k]) => !student || k !== "draft")
              .map(([k, [l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </Select>
        </FilterBar>
        <DataTable
          rows={list.rows}
          loading={list.isLoading}
          error={list.error}
          onRetry={() => list.refetch()}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/assignments/${r.id}`)}
          empty={<EmptyState icon={FileText} title="Vazifalar topilmadi" />}
          columns={[
            {
              key: "title",
              header: "Vazifa",
              cell: (r) => (
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{r.title}</p>
                  <p className="text-[13px] text-ink-500">{r.group_name}</p>
                </div>
              ),
            },
            {
              key: "due",
              header: "Muddat",
              cell: (r) => (
                <span className={new Date(r.due_at).getTime() < now && r.status === "published" ? "text-danger" : ""}>
                  {date(r.due_at)} {time(r.due_at)}
                </span>
              ),
            },
            { key: "max", header: "Ball", cell: (r) => r.max_score, className: "tabular" },
            ...(student
              ? [
                  {
                    key: "mine",
                    header: "Mening holatim",
                    cell: (r: Assignment) => {
                      const s = r.my_submission;
                      if (!s) return "—";
                      return (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={tone(SUBMISSION_STATUS, s.status)}>{label(SUBMISSION_STATUS, s.status)}</Badge>
                          {s.score && <span className="tabular font-semibold text-ink-900">{Number(s.score)}</span>}
                        </div>
                      );
                    },
                  },
                ]
              : [
                  {
                    key: "subs",
                    header: "Topshirilgan",
                    cell: (r: Assignment) => (
                      <div className="flex items-center gap-2">
                        <span className="tabular">{r.submissions_count ?? 0}</span>
                        {Boolean(r.pending_review_count) && <Badge tone="warning">{r.pending_review_count} tekshirish</Badge>}
                      </div>
                    ),
                  },
                ]),
            { key: "status", header: "Holat", cell: (r) => <Badge tone={tone(ASSIGNMENT_STATUS, r.status)}>{label(ASSIGNMENT_STATUS, r.status)}</Badge> },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      {creating && (
        <AssignmentForm
          defaultGroup={list.filters.group ? Number(list.filters.group) : undefined}
          onClose={() => setCreating(false)}
          onSaved={(a) => navigate(`/assignments/${a.id}`)}
        />
      )}
    </>
  );
}
