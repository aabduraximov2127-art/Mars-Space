import { useQuery } from "@tanstack/react-query";
import { Coins, Crown, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Skeleton, StatCard } from "@/components/ui/display";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { get, post } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useAction, useOptions, usePagedList } from "@/lib/hooks";
import { REWARD_CATEGORY, label, tone } from "@/lib/labels";
import type { Group, Membership, RewardTx } from "@/lib/types";
import { cn } from "@/lib/utils";

function GiveModal({ onClose }: { onClose: () => void }) {
  const me = useMe();
  const groups = useOptions<Group>(["groups", "reward-options"], "/groups/", {});
  const [group, setGroup] = useState("");
  const students = useQuery({
    queryKey: ["group-students", Number(group), false],
    queryFn: () => get<Membership[]>(`/groups/${group}/students/`),
    enabled: Boolean(group),
  });
  const [student, setStudent] = useState("");
  const [amount, setAmount] = useState("10");
  const [category, setCategory] = useState("activity");
  const [reason, setReason] = useState("");
  const give = useAction(
    () => post("/rewards/", { student: Number(student), group: Number(group), amount: Number(amount), category, reason }),
    { success: "Coin berildi.", invalidate: ["rewards", "leaderboard", "reward-balance"], onSuccess: onClose },
  );
  const categories = Object.entries(REWARD_CATEGORY).filter(([k]) => me.role !== "teacher" || k !== "redeem");
  return (
    <Modal
      open
      onClose={onClose}
      title="Coin berish"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={give.isPending} disabled={!student || !reason || !Number(amount)} onClick={() => give.mutate(undefined)}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Guruh" required>
          {(p) => (
            <Select
              {...p}
              value={group}
              onChange={(e) => {
                setGroup(e.target.value);
                setStudent("");
              }}
            >
              <option value="">Tanlang</option>
              {groups.data
                ?.filter((g) => g.status === "active")
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        <Field label="Student" required>
          {(p) => (
            <Select {...p} value={student} onChange={(e) => setStudent(e.target.value)} disabled={!group}>
              <option value="">Tanlang</option>
              {students.data?.map((m) => (
                <option key={m.student} value={m.student}>
                  {m.student_name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Miqdor" hint="Manfiy son — jarima yoki sarflash" required>
          {(p) => <Input {...p} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="Turkum">
          {(p) => (
            <Select {...p} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map(([k, [l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Sabab" required className="sm:col-span-2">
          {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: darsda faol qatnashdi" />}
        </Field>
      </div>
    </Modal>
  );
}

function Leaderboard() {
  const groups = useOptions<Group>(["groups", "leaderboard-filter"], "/groups/", {});
  const [group, setGroup] = useState("");
  const q = useQuery({
    queryKey: ["leaderboard", group],
    queryFn: () => get<{ rank: number; student: number; name: string; coins: number; is_me: boolean }[]>("/rewards/leaderboard/", { group }),
  });
  return (
    <Card className="h-fit">
      <CardHeader
        title="Reyting"
        actions={
          <Select className="h-8 w-44 text-[13px]" aria-label="Guruh" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Hammasi</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        }
      />
      {q.isLoading ? (
        <Skeleton className="m-5 h-40" />
      ) : !q.data?.length ? (
        <EmptyState icon={Crown} title="Reyting bo'sh" />
      ) : (
        <ol className="divide-y divide-line">
          {q.data.map((r) => (
            <li key={r.student} className={cn("flex items-center gap-3 px-5 py-2.5", r.is_me && "bg-brand-50")}>
              <span
                className={cn(
                  "tabular flex size-7 items-center justify-center rounded-full text-[13px] font-semibold",
                  r.rank === 1 ? "bg-amber-100 text-amber-700" : r.rank === 2 ? "bg-ink-200 text-ink-700" : r.rank === 3 ? "bg-orange-100 text-orange-700" : "text-ink-500",
                )}
              >
                {r.rank}
              </span>
              <span className="flex-1 truncate font-medium text-ink-900">
                {r.name} {r.is_me && <span className="text-[13px] font-normal text-brand-700">(siz)</span>}
              </span>
              <span className="tabular flex items-center gap-1 font-semibold text-amber-600">
                <Coins className="size-4" aria-hidden /> {r.coins}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export default function RewardsPage() {
  const me = useMe();
  const student = me.role === "student";
  const list = usePagedList<RewardTx>("rewards", "/rewards/");
  const balance = useQuery({
    queryKey: ["reward-balance", "me"],
    queryFn: () => get<{ balance: number; earned: number; spent: number }>("/rewards/balance/"),
    enabled: student,
  });
  const [giving, setGiving] = useState(false);
  return (
    <>
      <PageHeader
        title={student ? "Coinlarim" : "Coinlar"}
        description="Faollik, davomat va uy vazifalari uchun beriladigan rag'bat ballari."
        actions={
          !student && (
            <Button icon={<Plus className="size-4" />} onClick={() => setGiving(true)}>
              Coin berish
            </Button>
          )
        }
      />
      {student && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatCard label="Balans" value={balance.data?.balance ?? "—"} icon={Coins} tone="warning" loading={balance.isLoading} />
          <StatCard label="Jami yig'ilgan" value={balance.data?.earned ?? "—"} icon={TrendingUp} tone="success" loading={balance.isLoading} />
          <StatCard label="Sarflangan" value={balance.data?.spent ?? "—"} icon={TrendingDown} tone="danger" loading={balance.isLoading} />
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Tranzaksiyalar" />
          <FilterBar>
            <Select className="sm:w-44" aria-label="Turkum" value={String(list.filters.category ?? "")} onChange={(e) => list.setFilter("category", e.target.value)}>
              <option value="">Barcha turkum</option>
              {Object.entries(REWARD_CATEGORY).map(([k, [l]]) => (
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
            empty={<EmptyState icon={Coins} title="Tranzaksiyalar yo'q" />}
            columns={[
              ...(!student ? [{ key: "s", header: "Student", cell: (r: RewardTx) => <span className="font-medium text-ink-900">{r.student_name}</span> }] : []),
              {
                key: "a",
                header: "Coin",
                cell: (r) => (
                  <span className={cn("tabular font-semibold", r.amount > 0 ? "text-success" : "text-danger")}>
                    {r.amount > 0 ? "+" : ""}
                    {r.amount}
                  </span>
                ),
              },
              { key: "c", header: "Turkum", cell: (r) => <Badge tone={tone(REWARD_CATEGORY, r.category)}>{label(REWARD_CATEGORY, r.category)}</Badge> },
              { key: "r", header: "Sabab", cell: (r) => r.reason },
              { key: "by", header: "Kim berdi", cell: (r) => r.created_by_name },
              { key: "d", header: "Sana", cell: (r) => <span className="whitespace-nowrap">{dateTime(r.created_at)}</span> },
            ]}
          />
          <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
        </Card>
        <Leaderboard />
      </div>
      {giving && <GiveModal onClose={() => setGiving(false)} />}
    </>
  );
}
