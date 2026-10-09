import { useQuery } from "@tanstack/react-query";
import { Ban, FilePlus2, Plus, Receipt as ReceiptIcon, Wallet } from "lucide-react";
import { useState } from "react";

import { Button, IconButton } from "@/components/ui/Button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/display";
import { Field, Input, SearchInput, Select } from "@/components/ui/form";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { DataTable, FilterBar, Pagination, Tabs } from "@/components/ui/Table";
import { get, post } from "@/lib/api";
import { isStaff, useMe } from "@/lib/auth";
import { date, dateTime, money, monthLabel, today } from "@/lib/format";
import { useAction, useOptions, usePagedList } from "@/lib/hooks";
import { INVOICE_STATE, PAYMENT_METHOD, PAYMENT_STATUS, label, tone } from "@/lib/labels";
import type { Balance, Group, Invoice, Payment } from "@/lib/types";

import { PaymentModal, Receipt } from "./PaymentModal";

function PaymentsTable() {
  const me = useMe();
  const staff = isStaff(me.role);
  const list = usePagedList<Payment>("payments", "/payments/");
  const groups = useOptions<Group>(["groups", "payments-filter"], "/groups/", {}, staff);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const voidPayment = useAction((v: { id: number; reason: string }) => post(`/payments/${v.id}/void/`, { reason: v.reason }), {
    success: "To'lov bekor qilindi.",
    invalidate: ["payments", "balances", "dashboard"],
    onSuccess: () => setVoiding(null),
  });
  return (
    <Card>
      {staff && (
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder="Student ismi yoki telefoni" />
          <Select className="sm:w-48" aria-label="Guruh" value={String(list.filters.group ?? "")} onChange={(e) => list.setFilter("group", e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
          <Select className="sm:w-40" aria-label="Usul" value={String(list.filters.method ?? "")} onChange={(e) => list.setFilter("method", e.target.value)}>
            <option value="">Barcha usullar</option>
            {Object.entries(PAYMENT_METHOD).map(([k, [l]]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          <Input type="date" className="sm:w-40" aria-label="Dan" value={String(list.filters.date_from ?? "")} onChange={(e) => list.setFilter("date_from", e.target.value)} />
          <Input type="date" className="sm:w-40" aria-label="Gacha" value={String(list.filters.date_to ?? "")} onChange={(e) => list.setFilter("date_to", e.target.value)} />
        </FilterBar>
      )}
      <DataTable
        rows={list.rows}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={Wallet} title="To'lovlar topilmadi" />}
        columns={[
          { key: "no", header: "Chek", cell: (r) => <span className="tabular font-mono text-[13px]">№{r.receipt_number}</span> },
          { key: "date", header: "Sana", cell: (r) => <span className="whitespace-nowrap">{dateTime(r.paid_at)}</span> },
          ...(staff ? [{ key: "student", header: "Student", cell: (r: Payment) => <span className="font-medium text-ink-900">{r.student_name}</span> }] : []),
          { key: "group", header: "Guruh", cell: (r) => r.group_name },
          {
            key: "amount",
            header: "Summa",
            cell: (r) => <span className={`tabular font-semibold ${r.status === "voided" ? "text-ink-400 line-through" : "text-ink-900"}`}>{money(r.amount)}</span>,
          },
          { key: "method", header: "Usul", cell: (r) => label(PAYMENT_METHOD, r.method) },
          {
            key: "status",
            header: "Holat",
            cell: (r) => (
              <span title={r.void_reason || undefined}>
                <Badge tone={tone(PAYMENT_STATUS, r.status)}>{label(PAYMENT_STATUS, r.status)}</Badge>
              </span>
            ),
          },
          {
            key: "actions",
            header: "",
            className: "text-right",
            cell: (r) => (
              <div className="flex justify-end gap-1">
                <IconButton label="Chek" onClick={() => setReceipt(r)}>
                  <ReceiptIcon className="size-4" />
                </IconButton>
                {staff && r.status === "completed" && (
                  <IconButton label="Bekor qilish" onClick={() => setVoiding(r)} className="hover:text-danger">
                    <Ban className="size-4" />
                  </IconButton>
                )}
              </div>
            ),
          },
        ]}
      />
      <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        title="To'lovni bekor qilish"
        description={voiding && `${voiding.student_name} — ${money(voiding.amount)}. To'lov o'chirilmaydi, "bekor qilingan" deb belgilanadi va audit logga yoziladi.`}
        confirmLabel="Bekor qilish"
        loading={voidPayment.isPending}
        reason={{ label: "Sabab", placeholder: "Masalan: xato summa kiritilgan" }}
        onConfirm={(reason) => voiding && voidPayment.mutate({ id: voiding.id, reason })}
      />
      {receipt && (
        <Modal open onClose={() => setReceipt(null)} title="To'lov cheki" footer={<Button onClick={() => window.print()}>Chop etish</Button>}>
          <Receipt p={receipt} />
          {receipt.status === "voided" && (
            <p className="mt-3 rounded-md bg-danger-soft p-3 text-[13px] text-rose-800">
              Bekor qilingan: {receipt.void_reason} ({receipt.voided_by_name}, {dateTime(receipt.voided_at)})
            </p>
          )}
        </Modal>
      )}
    </Card>
  );
}

function InvoicesTable() {
  const me = useMe();
  const staff = isStaff(me.role);
  const list = usePagedList<Invoice>("invoices", "/invoices/");
  const groups = useOptions<Group>(["groups", "invoice-filter"], "/groups/", {}, staff);
  const [generating, setGenerating] = useState(false);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [genGroup, setGenGroup] = useState("");
  const [cancelling, setCancelling] = useState<Invoice | null>(null);
  const generate = useAction(() => post<{ created: number; skipped: number }>("/invoices/generate/", { period, group: genGroup ? Number(genGroup) : null }), {
    success: (r) => `${r.created} ta hisob yaratildi, ${r.skipped} tasi avval mavjud edi.`,
    invalidate: ["invoices", "balances", "dashboard"],
    onSuccess: () => setGenerating(false),
  });
  const cancel = useAction((v: { id: number; reason: string }) => post(`/invoices/${v.id}/cancel/`, { reason: v.reason }), {
    success: "Hisob bekor qilindi.",
    invalidate: ["invoices", "balances"],
    onSuccess: () => setCancelling(null),
  });
  return (
    <Card>
      <CardHeader
        title="Oylik hisoblar"
        description="To'lovlar eng eski hisobdan boshlab taqsimlanadi (FIFO)."
        actions={
          staff && (
            <Button size="sm" icon={<FilePlus2 className="size-4" />} onClick={() => setGenerating(true)}>
              Hisoblarni yaratish
            </Button>
          )
        }
      />
      {staff && (
        <FilterBar>
          <SearchInput value={String(list.filters.search ?? "")} onChange={(v) => list.setFilter("search", v)} placeholder="Student" />
          <Input type="month" className="sm:w-44" aria-label="Davr" value={String(list.filters.period ?? "")} onChange={(e) => list.setFilter("period", e.target.value)} />
          <Select className="sm:w-48" aria-label="Guruh" value={String(list.filters.group ?? "")} onChange={(e) => list.setFilter("group", e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </FilterBar>
      )}
      <DataTable
        rows={list.rows}
        loading={list.isLoading}
        error={list.error}
        onRetry={() => list.refetch()}
        rowKey={(r) => r.id}
        empty={<EmptyState title="Hisoblar yo'q" />}
        columns={[
          { key: "period", header: "Davr", cell: (r) => <span className="font-medium text-ink-900">{monthLabel(r.period)}</span> },
          ...(staff ? [{ key: "student", header: "Student", cell: (r: Invoice) => r.student_name }] : []),
          { key: "group", header: "Guruh", cell: (r) => r.group_name },
          {
            key: "amount",
            header: "Summa",
            cell: (r) => (
              <div className="tabular">
                {money(r.amount)}
                {Number(r.discount_amount) > 0 && <p className="text-xs text-success">chegirma {money(r.discount_amount)}</p>}
              </div>
            ),
          },
          { key: "paid", header: "To'langan", cell: (r) => money(r.paid_amount), className: "tabular" },
          { key: "due", header: "Muddat", cell: (r) => date(r.due_date) },
          { key: "state", header: "Holat", cell: (r) => <Badge tone={tone(INVOICE_STATE, r.payment_state)}>{label(INVOICE_STATE, r.payment_state)}</Badge> },
          ...(staff
            ? [
                {
                  key: "act",
                  header: "",
                  className: "text-right",
                  cell: (r: Invoice) =>
                    r.status === "open" && (
                      <button type="button" className="text-[13px] font-medium text-danger hover:underline" onClick={() => setCancelling(r)}>
                        Bekor qilish
                      </button>
                    ),
                },
              ]
            : []),
        ]}
      />
      <Pagination page={list.page} pageSize={list.pageSize} count={list.count} onPage={list.setPage} />
      <Modal
        open={generating}
        onClose={() => setGenerating(false)}
        title="Oylik hisoblarni yaratish"
        description="Faol a'zoliklar uchun tanlangan oyga hisob yoziladi. Mavjud hisoblar takrorlanmaydi."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenerating(false)}>
              Bekor qilish
            </Button>
            <Button loading={generate.isPending} onClick={() => generate.mutate(undefined)}>
              Yaratish
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Oy" required>
            {(p) => <Input {...p} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />}
          </Field>
          <Field label="Guruh" hint="Bo'sh — barcha guruhlar">
            {(p) => (
              <Select {...p} value={genGroup} onChange={(e) => setGenGroup(e.target.value)}>
                <option value="">Barcha guruhlar</option>
                {groups.data?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Hisobni bekor qilish"
        description={cancelling && `${cancelling.student_name} — ${monthLabel(cancelling.period)}, ${money(cancelling.amount)}`}
        confirmLabel="Bekor qilish"
        loading={cancel.isPending}
        reason={{ label: "Sabab" }}
        onConfirm={(reason) => cancelling && cancel.mutate({ id: cancelling.id, reason })}
      />
    </Card>
  );
}

function StudentBalances() {
  const q = useQuery({ queryKey: ["balances", "mine"], queryFn: () => get<{ results: Balance[] }>("/balances/", { page_size: 50 }) });
  const rows = q.data?.results ?? [];
  const debt = rows.reduce((s, b) => s + Number(b.debt), 0);
  const paid = rows.reduce((s, b) => s + Number(b.paid), 0);
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard label="Qarzdorlik" value={money(debt)} tone={debt > 0 ? "danger" : "success"} loading={q.isLoading} hint={debt > 0 ? "Iltimos, to'lovni o'z vaqtida amalga oshiring" : "Qarz yo'q"} />
      <StatCard label="Jami to'langan" value={money(paid)} tone="success" loading={q.isLoading} />
      {rows
        .filter((b) => ["active", "frozen"].includes(b.status))
        .slice(0, 1)
        .map((b) => (
          <StatCard key={b.id} label={`Oylik to'lov · ${b.group_name}`} value={money(b.monthly_amount)} tone="brand" />
        ))}
    </div>
  );
}

export default function PaymentsPage() {
  const me = useMe();
  const staff = isStaff(me.role);
  const [tab, setTab] = useState<"payments" | "invoices">("payments");
  const [paying, setPaying] = useState(false);
  return (
    <>
      <PageHeader
        title={staff ? "To'lovlar" : "To'lovlarim"}
        actions={
          staff && (
            <Button icon={<Plus className="size-4" />} onClick={() => setPaying(true)}>
              To'lov qabul qilish
            </Button>
          )
        }
      />
      {!staff && <StudentBalances />}
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "payments", label: "To'lovlar" },
          { value: "invoices", label: "Hisoblar" },
        ]}
      />
      {tab === "payments" ? <PaymentsTable /> : <InvoicesTable />}
      {paying && <PaymentModal onClose={() => setPaying(false)} />}
    </>
  );
}
