import { ScrollText } from "lucide-react";
import { useState } from "react";

import { Badge, Card, DescriptionList, EmptyState, PageHeader } from "@/components/ui/display";
import { Input, SearchInput, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { DataTable, FilterBar, Pagination } from "@/components/ui/Table";
import { dateTime } from "@/lib/format";
import { useOptions, usePagedList } from "@/lib/hooks";
import { AUDIT_ACTION, ROLE, label, tone } from "@/lib/labels";
import type { AuditEntry, Branch } from "@/lib/types";

export default function AuditPage() {
  const list = usePagedList<AuditEntry>("audit", "/audit-logs/", {}, 30);
  const branches = useOptions<Branch>(["branches"], "/branches/", {});
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  return (
    <>
      <PageHeader title="Audit log" description="Tizimdagi barcha muhim amallar. Yozuvlar o'zgartirilmaydi va o'chirilmaydi." />
      <Card>
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder="Foydalanuvchi yoki obyekt" />
          <Select className="sm:w-52" aria-label="Amal" value={String(list.filters.action ?? "")} onChange={(e) => list.setFilter("action", e.target.value)}>
            <option value="">Barcha amallar</option>
            {Object.entries(AUDIT_ACTION).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Select className="sm:w-48" aria-label="Filial" value={String(list.filters.branch ?? "")} onChange={(e) => list.setFilter("branch", e.target.value)}>
            <option value="">Barcha filiallar</option>
            {branches.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
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
          onRowClick={setSelected}
          empty={<EmptyState icon={ScrollText} title="Yozuvlar topilmadi" />}
          columns={[
            { key: "t", header: "Vaqt", cell: (r) => <span className="whitespace-nowrap">{dateTime(r.created_at)}</span> },
            {
              key: "a",
              header: "Foydalanuvchi",
              cell: (r) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">{r.actor_name ?? "Tizim"}</span>
                  {r.actor_role && <Badge tone={tone(ROLE, r.actor_role)}>{label(ROLE, r.actor_role)}</Badge>}
                </div>
              ),
            },
            {
              key: "ac",
              header: "Amal",
              cell: (r) => (
                <Badge tone={r.action.includes("fail") || r.action.includes("void") || r.action === "delete" || r.action === "block" ? "danger" : "neutral"} dot={false}>
                  {AUDIT_ACTION[r.action] ?? r.action}
                </Badge>
              ),
            },
            {
              key: "o",
              header: "Obyekt",
              cell: (r) => (
                <div className="max-w-xs">
                  <p className="truncate text-ink-800">{r.entity_repr || "—"}</p>
                  <p className="text-xs text-ink-400">{r.entity_type}</p>
                </div>
              ),
            },
            { key: "b", header: "Filial", cell: (r) => r.branch_name ?? "—" },
            { key: "ip", header: "IP", cell: (r) => <span className="font-mono text-xs">{r.ip_address ?? "—"}</span> },
          ]}
        />
        <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      </Card>
      {selected && (
        <Modal open onClose={() => setSelected(null)} title={AUDIT_ACTION[selected.action] ?? selected.action} description={dateTime(selected.created_at)} size="lg">
          <DescriptionList
            items={[
              ["Foydalanuvchi", `${selected.actor_name ?? "Tizim"} (${label(ROLE, selected.actor_role)})`],
              ["Obyekt", `${selected.entity_type} #${selected.entity_id}`],
              ["Tavsif", selected.entity_repr || "—"],
              ["Filial", selected.branch_name ?? "—"],
              ["IP manzil", selected.ip_address ?? "—"],
            ]}
          />
          <p className="mt-5 mb-1.5 text-[13px] font-medium text-ink-700">O'zgarishlar</p>
          <pre className="max-h-80 overflow-auto rounded-md bg-ink-900 p-4 text-xs text-ink-100">{JSON.stringify(selected.changes, null, 2)}</pre>
        </Modal>
      )}
    </>
  );
}
