import { useQuery } from "@tanstack/react-query";
import { History, Pencil, Star } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, rateTone, Spinner, StatCard } from "@/components/ui/display";
import { Field, Input, SearchInput, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { get, patch } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { date, dateTime, percent } from "@/lib/format";
import { useAction, useOptions, usePagedList } from "@/lib/hooks";
import type { Grade, Group } from "@/lib/types";

function GradeEditModal({ g, onClose }: { g: Grade; onClose: () => void }) {
  const [score, setScore] = useState(String(Number(g.score)));
  const [comment, setComment] = useState(g.comment);
  const save = useAction(() => patch(`/grades/${g.id}/`, { score, comment }), {
    success: "Baho yangilandi.",
    invalidate: ["grades", "grades-summary"],
    onSuccess: onClose,
  });
  const history = useQuery({
    queryKey: ["grade-history", g.id],
    queryFn: () =>
      get<{ id: number; previous_score: string | null; new_score: string; changed_by_name: string | null; changed_at: string }[]>(`/grades/${g.id}/history/`),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Bahoni o'zgartirish"
      description={`${g.student_name} · ${g.assignment_title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
        <Field label={`Ball (0–${Number(g.max_score)})`}>
          {(p) => <Input {...p} type="number" min={0} max={Number(g.max_score)} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} />}
        </Field>
        <Field label="Izoh">{(p) => <Textarea {...p} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
      </div>
      <p className="mt-5 mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-700">
        <History className="size-4" aria-hidden /> O'zgarishlar tarixi
      </p>
      {history.isLoading ? (
        <Spinner className="p-4" />
      ) : (
        <ul className="space-y-1 text-[13px] text-ink-600">
          {history.data?.map((h) => (
            <li key={h.id}>
              {h.previous_score ? `${Number(h.previous_score)} → ` : ""}
              <strong>{Number(h.new_score)}</strong> · {h.changed_by_name} · {dateTime(h.changed_at)}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function GradesPage() {
  const me = useMe();
  const student = me.role === "student";
  const list = usePagedList<Grade>("grades", "/grades/");
  const groups = useOptions<Group>(["groups", "grades-filter"], "/groups/", {});
  const summary = useQuery({
    queryKey: ["grades-summary", list.filters.group],
    queryFn: () =>
      get<{ graded_count: number; average_percent: number | null; by_group: { group: number; group_name: string; graded_count: number; average_percent: number | null }[] }>(
        "/grades/summary/",
        { group: list.filters.group },
      ),
  });
  const [editing, setEditing] = useState<Grade | null>(null);

  return (
    <>
      <PageHeader title={student ? "Baholarim" : "Baholar"} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="O'rtacha natija" value={percent(summary.data?.average_percent)} icon={Star} tone={rateTone(summary.data?.average_percent)} loading={summary.isLoading} />
        <StatCard label="Baholangan ishlar" value={summary.data?.graded_count ?? "—"} loading={summary.isLoading} />
        {summary.data?.by_group.slice(0, 2).map((g) => (
          <Card key={g.group} className="p-5">
            <p className="text-[13px] font-medium text-ink-500">{g.group_name}</p>
            <p className="tabular mt-1 text-[28px] leading-tight font-[650] text-ink-900">{percent(g.average_percent)}</p>
            <div className="mt-2">
              <ProgressBar value={g.average_percent} tone={rateTone(g.average_percent)} />
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder={student ? "Vazifa nomi" : "Student yoki vazifa"} />
          <Select className="sm:w-52" aria-label="Guruh" value={String(list.filters.group ?? "")} onChange={(e) => list.setFilter("group", e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
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
          empty={<EmptyState icon={Star} title="Baholar hali yo'q" />}
          columns={[
            {
              key: "assignment",
              header: "Vazifa",
              cell: (r) => (
                <Link to={`/assignments/${r.assignment}`} className="font-medium text-ink-900 hover:text-brand-700">
                  {r.assignment_title}
                </Link>
              ),
            },
            ...(!student ? [{ key: "student", header: "Student", cell: (r: Grade) => r.student_name }] : []),
            { key: "group", header: "Guruh", cell: (r) => r.group_name },
            {
              key: "score",
              header: "Ball",
              cell: (r) => (
                <div className="flex items-center gap-2">
                  <span className="tabular font-semibold text-ink-900">
                    {Number(r.score)}/{Number(r.max_score)}
                  </span>
                  <Badge tone={rateTone(r.percent)} dot={false}>
                    {percent(r.percent)}
                  </Badge>
                </div>
              ),
            },
            { key: "comment", header: "Izoh", cell: (r) => <span className="line-clamp-1 max-w-xs">{r.comment || "—"}</span> },
            { key: "date", header: "Sana", cell: (r) => date(r.updated_at) },
            ...(me.role === "teacher"
              ? [
                  {
                    key: "edit",
                    header: "",
                    className: "text-right",
                    cell: (r: Grade) => (
                      <IconButton label="O'zgartirish" onClick={() => setEditing(r)}>
                        <Pencil className="size-4" />
                      </IconButton>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      {editing && <GradeEditModal g={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
