import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { fieldMessage, parseApiError, post } from "@/lib/api";
import { today } from "@/lib/format";
import { useInvalidate, useOptions } from "@/lib/hooks";
import type { Group, User } from "@/lib/types";

/** Enrol a student into a group. Either side may be fixed by the caller. */
export function EnrollModal({ student, group, onClose }: { student?: User; group?: Group; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [groupId, setGroupId] = useState(group ? String(group.id) : "");
  const [studentId, setStudentId] = useState(student ? String(student.id) : "");
  const [studentSearch, setStudentSearch] = useState("");
  const [joinedAt, setJoinedAt] = useState(today());
  const [discountType, setDiscountType] = useState("none");
  const [discountValue, setDiscountValue] = useState("0");
  const [discountReason, setDiscountReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const groups = useOptions<Group>(
    ["groups", "enroll-options", student?.branch],
    "/groups/",
    { branch: student?.branch ?? undefined },
    !group,
  );
  const openGroups = (groups.data ?? []).filter((g) => g.status === "active" || g.status === "forming");
  const students = useOptions<User>(
    ["users", "enroll-students", group?.branch, studentSearch],
    "/users/",
    { role: "student", is_active: true, branch: group?.branch, search: studentSearch },
    !student,
  );
  const selectedGroup = group ?? openGroups.find((g) => String(g.id) === groupId);

  const submit = async () => {
    setSaving(true);
    setErrors({});
    try {
      await post("/memberships/", {
        group: Number(groupId),
        student: Number(studentId),
        joined_at: joinedAt,
        discount_type: discountType,
        discount_value: discountType === "none" ? "0" : discountValue || "0",
        discount_reason: discountReason,
      });
      toast.success("Student guruhga qo'shildi.");
      await invalidate("memberships", "group", "groups", "group-students", "balances");
      onClose();
    } catch (err) {
      const info = parseApiError(err);
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(info.errors)) next[k] = fieldMessage(v) ?? "";
      setErrors(next);
      if (!Object.keys(next).length || info.code !== "validation_error") toast.error(info.detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Guruhga qo'shish"
      description={student ? student.full_name : group ? `${group.name} (${group.code})` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={saving} disabled={!groupId || !studentId}>
            Qo'shish
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!group && (
          <Field label="Guruh" error={errors.group} required className="sm:col-span-2">
            {(p) => (
              <Select {...p} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">Tanlang</option>
                {openGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.code}) — {g.course_name}, {g.students_count}/{g.capacity}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {!student && (
          <>
            <Field label="Studentni qidirish" className="sm:col-span-2">
              {(p) => <Input {...p} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Ism yoki telefon" />}
            </Field>
            <Field label="Student" error={errors.student} required className="sm:col-span-2">
              {(p) => (
                <Select {...p} value={studentId} onChange={(e) => setStudentId(e.target.value)} size={Math.min(6, Math.max(3, students.data?.length ?? 3))} className="h-auto py-1">
                  {students.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} — {s.phone}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </>
        )}
        <Field label="Qo'shilish sanasi" error={errors.joined_at} required>
          {(p) => <Input {...p} type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} />}
        </Field>
        <Field label="Chegirma turi" error={errors.discount_type}>
          {(p) => (
            <Select {...p} value={discountType} onChange={(e) => setDiscountType(e.target.value)}>
              <option value="none">Chegirmasiz</option>
              <option value="percent">Foiz</option>
              <option value="fixed">Belgilangan summa</option>
            </Select>
          )}
        </Field>
        {discountType !== "none" && (
          <>
            <Field label={discountType === "percent" ? "Chegirma, %" : "Chegirma, so'm"} error={errors.discount_value}>
              {(p) => <Input {...p} type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />}
            </Field>
            <Field label="Chegirma sababi" error={errors.discount_reason}>
              {(p) => <Input {...p} value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} />}
            </Field>
          </>
        )}
      </div>
      {selectedGroup && (
        <p className="mt-4 rounded-md bg-ink-50 px-3 py-2 text-[13px] text-ink-600">
          Oylik to'lov kurs narxidan olinadi. Guruh: {selectedGroup.students_count}/{selectedGroup.capacity} o'rin band.
        </p>
      )}
      {errors.non_field_errors && <p className="mt-2 text-[13px] text-danger">{errors.non_field_errors}</p>}
    </Modal>
  );
}
