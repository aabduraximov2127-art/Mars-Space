import { useQuery } from "@tanstack/react-query";
import { BellRing, Users, Wallet, WalletCards } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/Button";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui/display";
import { SearchInput, Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/Modal";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { get, post } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { money, num, phone } from "@/lib/format";
import { useAction, useOptions, usePagedList } from "@/lib/hooks";
import type { Balance, Branch, Group } from "@/lib/types";

interface Summary {
  total_charged: string;
  total_paid: string;
  total_debt: string;
  debtors_count: number;
}

export default function DebtorsPage() {
  const me = useMe();
  const navigate = useNavigate();
  const list = usePagedList<Balance>("balances", "/balances/", { has_debt: true });
  const groups = useOptions<Group>(["groups", "debtors-filter"], "/groups/", {});
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const summary = useQuery({
    queryKey: ["balances", "summary", list.filters.group, list.filters.branch],
    queryFn: () => get<Summary>("/balances/summary/", { group: list.filters.group, branch: list.filters.branch }),
  });
  const [confirm, setConfirm] = useState(false);
  const remind = useAction(() => post<{ notified: number }>("/payments/send-reminders/", { group: list.filters.group || undefined }), {
    success: (r) => `${r.notified} ta studentga eslatma yuborildi.`,
    onSuccess: () => setConfirm(false),
  });
  const s = summary.data;
  return (
    <>
      <PageHeader
        title="Qarzdorlar"
        description="Hisoblangan summa to'langandan ko'p bo'lgan a'zoliklar."
        actions={
          <Button variant="secondary" icon={<BellRing className="size-4" />} onClick={() => setConfirm(true)}>
            Eslatma yuborish
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Umumiy qarz" value={money(s?.total_debt)} icon={WalletCards} tone="danger" loading={summary.isLoading} />
        <StatCard label="Qarzdorlar" value={num(s?.debtors_count)} icon={Users} tone="warning" loading={summary.isLoading} />
        <StatCard label="Hisoblangan" value={money(s?.total_charged)} icon={Wallet} tone="brand" loading={summary.isLoading} />
        <StatCard label="To'langan" value={money(s?.total_paid)} icon={Wallet} tone="success" loading={summary.isLoading} />
      </div>
      <Card>
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder="Student" />
          <Select className="sm:w-52" aria-label="Guruh" value={String(list.filters.group ?? "")} onChange={(e) => list.setFilter("group", e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
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
          onRowClick={(r) => navigate(`/users/${r.student}`)}
          empty={<EmptyState icon={Wallet} title="Qarzdorlar yo'q 🎉" />}
          columns={[
            {
              key: "student",
              header: "Student",
              cell: (r) => (
                <div>
                  <p className="font-medium text-ink-900">{r.student_name}</p>
                  <p className="text-[13px] text-ink-500">{phone(r.student_phone)}</p>
                </div>
              ),
            },
            { key: "group", header: "Guruh", cell: (r) => `${r.group_name}` },
            ...(me.role === "superadmin" ? [{ key: "branch", header: "Filial", cell: (r: Balance) => r.branch_name }] : []),
            { key: "charged", header: "Hisoblangan", cell: (r) => money(r.charged), className: "tabular" },
            { key: "paid", header: "To'langan", cell: (r) => money(r.paid), className: "tabular" },
            { key: "debt", header: "Qarz", cell: (r) => <span className="tabular font-semibold text-danger">{money(r.debt)}</span> },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="To'lov eslatmasi"
        description={`${list.filters.group ? "Tanlangan guruhdagi" : "Barcha"} qarzdor studentlarga ilova ichida bildirishnoma yuboriladi.`}
        confirmLabel="Yuborish"
        tone="primary"
        loading={remind.isPending}
        onConfirm={() => remind.mutate(undefined)}
      />
    </>
  );
}
