import { CheckCircle2, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { DescriptionList } from "@/components/ui/display";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { fieldMessage, parseApiError, post } from "@/lib/api";
import { dateTime, money } from "@/lib/format";
import { useInvalidate, useOptions } from "@/lib/hooks";
import { PAYMENT_METHOD, label } from "@/lib/labels";
import type { Balance, Payment, User } from "@/lib/types";

function newKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
      );
}

export function Receipt({ p }: { p: Payment }) {
  return (
    <div id="receipt" className="rounded-lg border border-line p-5">
      <div className="mb-4 text-center">
        <p className="text-lg font-semibold text-ink-900">EduCentr</p>
        <p className="text-[13px] text-ink-500">To'lov cheki № {p.receipt_number}</p>
      </div>
      <DescriptionList
        className="sm:grid-cols-1"
        items={[
          ["Student", p.student_name],
          ["Guruh", `${p.group_name} (${p.course_name})`],
          ["Summa", <span className="tabular text-lg font-semibold">{money(p.amount)}</span>],
          ["To'lov usuli", label(PAYMENT_METHOD, p.method)],
          ["Sana", dateTime(p.paid_at)],
          ["Qabul qildi", p.received_by_name],
          ...(p.note ? ([["Izoh", p.note]] as [string, string][]) : []),
        ]}
      />
    </div>
  );
}

export function PaymentModal({ onClose, student: fixedStudent }: { onClose: () => void; student?: User }) {
  const invalidate = useInvalidate();
  const [key] = useState(newKey);
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState(fixedStudent ? String(fixedStudent.id) : "");
  const [membership, setMembership] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [done, setDone] = useState<Payment | null>(null);

  const students = useOptions<User>(["users", "pay-students", search], "/users/", { role: "student", search }, !fixedStudent && search.length >= 2);
  const balances = useOptions<Balance>(["balances", "pay", studentId], "/balances/", { student: studentId }, Boolean(studentId));
  const selected = useMemo(() => balances.data?.find((b) => String(b.id) === membership), [balances.data, membership]);

  const submit = async (confirmDuplicate = false) => {
    setSaving(true);
    setErrors({});
    try {
      const p = await post<Payment>("/payments/", {
        membership: Number(membership),
        amount,
        method,
        note,
        idempotency_key: key,
        confirm_duplicate: confirmDuplicate,
      });
      toast.success("To'lov qabul qilindi.");
      await invalidate("payments", "balances", "invoices", "dashboard", "debtors");
      setDone(p);
    } catch (err) {
      const info = parseApiError(err);
      if (info.code === "duplicate_suspected") {
        setDuplicate(true);
      } else {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(info.errors)) next[k] = fieldMessage(v) ?? "";
        setErrors(next);
        if (!Object.keys(next).length || info.code !== "validation_error") toast.error(info.detail);
      }
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Modal
        open
        onClose={onClose}
        title="To'lov qabul qilindi"
        footer={
          <>
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Chop etish
            </Button>
            <Button onClick={onClose}>Yopish</Button>
          </>
        }
      >
        <div className="mb-4 flex items-center gap-2 text-success">
          <CheckCircle2 className="size-5" aria-hidden /> Muvaffaqiyatli saqlandi
        </div>
        <Receipt p={done} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="To'lov qabul qilish"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button loading={saving} disabled={!membership || !amount || Number(amount) <= 0} onClick={() => submit(false)}>
            Qabul qilish
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!fixedStudent && (
          <>
            <Field label="Studentni qidirish" hint="Kamida 2 harf" className="sm:col-span-2">
              {(p) => <Input {...p} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism, familiya yoki telefon" autoFocus />}
            </Field>
            {search.length >= 2 && (
              <Field label="Student" required className="sm:col-span-2">
                {(p) => (
                  <Select
                    {...p}
                    value={studentId}
                    onChange={(e) => {
                      setStudentId(e.target.value);
                      setMembership("");
                    }}
                  >
                    <option value="">{students.isLoading ? "Qidirilmoqda…" : `Tanlang (${students.data?.length ?? 0})`}</option>
                    {students.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} — {s.phone}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </>
        )}
        {studentId && (
          <Field label="Guruh (a'zolik)" error={errors.membership} required className="sm:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={membership}
                onChange={(e) => {
                  setMembership(e.target.value);
                  const b = balances.data?.find((x) => String(x.id) === e.target.value);
                  if (b && Number(b.debt) > 0) setAmount(String(Number(b.debt)));
                  else if (b) setAmount(String(Number(b.monthly_amount)));
                }}
              >
                <option value="">Tanlang</option>
                {balances.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.group_name} — qarz: {money(b.debt)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {selected && (
          <div className="grid grid-cols-3 gap-2 rounded-md bg-ink-50 p-3 text-[13px] sm:col-span-2">
            <div>
              <p className="text-ink-500">Oylik</p>
              <p className="tabular font-medium text-ink-900">{money(selected.monthly_amount)}</p>
            </div>
            <div>
              <p className="text-ink-500">To'langan</p>
              <p className="tabular font-medium text-ink-900">{money(selected.paid)}</p>
            </div>
            <div>
              <p className="text-ink-500">Qarz</p>
              <p className={`tabular font-medium ${Number(selected.debt) > 0 ? "text-danger" : "text-success"}`}>{money(selected.debt)}</p>
            </div>
          </div>
        )}
        <Field label="Summa (so'm)" error={errors.amount} required>
          {(p) => <Input {...p} type="number" min={1} step="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="To'lov usuli" error={errors.method} required>
          {(p) => (
            <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(PAYMENT_METHOD).map(([k, [l]]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Izoh" error={errors.note} className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
      <Modal
        open={duplicate}
        onClose={() => setDuplicate(false)}
        title="Takroriy to'lov?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDuplicate(false)}>
              Bekor qilish
            </Button>
            <Button
              loading={saving}
              onClick={() => {
                setDuplicate(false);
                submit(true);
              }}
            >
              Ha, yangi to'lov
            </Button>
          </>
        }
      >
        <p className="text-ink-600">
          Shu student uchun xuddi shu summadagi to'lov hozirgina qayd etilgan. Bu haqiqatan yangi to'lovmi?
        </p>
      </Modal>
    </Modal>
  );
}
