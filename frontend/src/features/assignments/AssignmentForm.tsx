import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { DateTimeInput } from "@/components/ui/dates";
import { fieldMessage, parseApiError, patch, post, toFormData } from "@/lib/api";
import { addDays, fromLocalInput, toLocalInput, today } from "@/lib/format";
import { useInvalidate, useOptions } from "@/lib/hooks";
import type { Assignment, Group } from "@/lib/types";

export function AssignmentForm({
  assignment,
  defaultGroup,
  onClose,
  onSaved,
}: {
  assignment?: Assignment | null;
  defaultGroup?: number;
  onClose: () => void;
  onSaved?: (a: Assignment) => void;
}) {
  const invalidate = useInvalidate();
  const groups = useOptions<Group>(["groups", "assignment-options"], "/groups/", {}, !assignment);
  const [form, setForm] = useState({
    group: assignment ? String(assignment.group) : defaultGroup ? String(defaultGroup) : "",
    title: assignment?.title ?? "",
    description: assignment?.description ?? "",
    grading_criteria: assignment?.grading_criteria ?? "",
    max_score: String(assignment?.max_score ?? 100),
    due_at: assignment ? toLocalInput(assignment.due_at) : `${addDays(today(), 7)}T23:59`,
    allow_late: assignment?.allow_late ?? true,
    link: assignment?.link ?? "",
    status: "published",
  });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    setErrors({});
    const payload: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      grading_criteria: form.grading_criteria,
      max_score: Number(form.max_score),
      due_at: form.due_at ? fromLocalInput(form.due_at) : "",
      allow_late: form.allow_late,
      link: form.link,
      attachment: file ?? undefined,
    };
    try {
      let saved: Assignment;
      if (assignment) {
        saved = await patch<Assignment>(`/assignments/${assignment.id}/`, toFormData(payload));
      } else {
        saved = await post<Assignment>("/assignments/", toFormData({ ...payload, group: Number(form.group), status: form.status }));
      }
      toast.success(assignment ? "Vazifa saqlandi." : form.status === "published" ? "Vazifa e'lon qilindi." : "Qoralama saqlandi.");
      await invalidate("assignments", "assignment");
      onSaved?.(saved);
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
      size="lg"
      title={assignment ? "Vazifani tahrirlash" : "Yangi vazifa"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={saving} disabled={!form.title || !form.description || (!assignment && !form.group)}>
            Saqlash
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!assignment && (
          <Field label="Guruh" error={errors.group} required>
            {(p) => (
              <Select {...p} value={form.group} onChange={(e) => set("group", e.target.value)}>
                <option value="">Tanlang</option>
                {groups.data
                  ?.filter((g) => ["active", "forming"].includes(g.status))
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        )}
        {!assignment && (
          <Field label="Holat">
            {(p) => (
              <Select {...p} value={form.status} onChange={(e) => set("status", e.target.value)}>
                <option value="published">Darhol e'lon qilish</option>
                <option value="draft">Qoralama</option>
              </Select>
            )}
          </Field>
        )}
        <Field label="Sarlavha" error={errors.title} required className="sm:col-span-2">
          {(p) => <Input {...p} value={form.title} onChange={(e) => set("title", e.target.value)} />}
        </Field>
        <Field label="Topshiriq matni" error={errors.description} required className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} />}
        </Field>
        <Field label="Baholash mezoni" error={errors.grading_criteria} className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={2} value={form.grading_criteria} onChange={(e) => set("grading_criteria", e.target.value)} />}
        </Field>
        <Field label="Muddat" error={errors.due_at} required>
          {(p) => <DateTimeInput {...p} value={form.due_at} onChange={(v) => set("due_at", v)} />}
        </Field>
        <Field label="Maksimal ball" error={errors.max_score} required>
          {(p) => <Input {...p} type="number" min={1} max={1000} value={form.max_score} onChange={(e) => set("max_score", e.target.value)} />}
        </Field>
        <Field label="Fayl biriktirish" error={errors.attachment} hint={assignment?.attachment_name ? `Joriy: ${assignment.attachment_name}` : undefined}>
          {(p) => <Input {...p} type="file" className="py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
        <Field label="Havola" error={errors.link}>
          {(p) => <Input {...p} type="url" placeholder="https://" value={form.link} onChange={(e) => set("link", e.target.value)} />}
        </Field>
        <Checkbox label="Muddatdan keyin topshirishga ruxsat" checked={form.allow_late} onChange={(e) => set("allow_late", e.target.checked)} />
      </div>
    </Modal>
  );
}
