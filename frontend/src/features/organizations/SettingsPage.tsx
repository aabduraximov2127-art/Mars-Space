import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Card, CardHeader, ErrorState, PageHeader, Spinner } from "@/components/ui/display";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { get, patch } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { applyApiErrors } from "@/lib/hooks";
import type { SystemSettings } from "@/lib/types";

export default function SettingsPage() {
  const me = useMe();
  const readOnly = me.role !== "superadmin";
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => get<SystemSettings>("/settings/") });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SystemSettings>();
  useEffect(() => {
    if (q.data) reset(q.data);
  }, [q.data, reset]);

  const submit = handleSubmit(async (v) => {
    try {
      const data = await patch<SystemSettings>("/settings/", {
        center_name: v.center_name,
        currency: v.currency,
        attendance_excused_policy: v.attendance_excused_policy,
        attendance_late_counts_present: v.attendance_late_counts_present,
        attendance_edit_window_hours: Number(v.attendance_edit_window_hours),
        max_upload_mb: Number(v.max_upload_mb),
        allowed_upload_extensions: v.allowed_upload_extensions,
        invoice_due_day: Number(v.invoice_due_day),
        payment_void_window_hours: Number(v.payment_void_window_hours),
        teacher_reward_limit: Number(v.teacher_reward_limit),
      });
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries({ queryKey: ["settings-public"] });
      reset(data);
      toast.success("Sozlamalar saqlandi.");
    } catch (err) {
      applyApiErrors(err, setError);
    }
  });

  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Tizim sozlamalari"
        description={
          readOnly
            ? "Sozlamalarni faqat superadmin o'zgartira oladi."
            : `Oxirgi o'zgarish: ${dateTime(q.data.updated_at)}${q.data.updated_by_name ? ` · ${q.data.updated_by_name}` : ""}`
        }
      />
      <form onSubmit={submit} className="space-y-6">
        <fieldset disabled={readOnly} className="space-y-6">
          <Card>
            <CardHeader title="Umumiy" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Markaz nomi" error={errors.center_name?.message}>
                {(p) => <Input {...p} {...register("center_name")} />}
              </Field>
              <Field label="Valyuta" error={errors.currency?.message}>
                {(p) => <Input {...p} {...register("currency")} maxLength={3} />}
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Davomat" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Uzrli sabab qanday hisoblanadi" error={errors.attendance_excused_policy?.message}>
                {(p) => (
                  <Select {...p} {...register("attendance_excused_policy")}>
                    <option value="exclude">Hisobdan chiqariladi</option>
                    <option value="present">Keldi deb hisoblanadi</option>
                    <option value="absent">Kelmadi deb hisoblanadi</option>
                  </Select>
                )}
              </Field>
              <Field label="Ustoz davomatni tahrirlash muddati (soat)" error={errors.attendance_edit_window_hours?.message}>
                {(p) => <Input {...p} type="number" min={1} max={720} {...register("attendance_edit_window_hours")} />}
              </Field>
              <Checkbox label="Kechikish «keldi» deb hisoblansin" {...register("attendance_late_counts_present")} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Moliya" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Hisob to'lov muddati (oyning kuni)" error={errors.invoice_due_day?.message}>
                {(p) => <Input {...p} type="number" min={1} max={28} {...register("invoice_due_day")} />}
              </Field>
              <Field label="Admin to'lovni bekor qilish muddati (soat)" error={errors.payment_void_window_hours?.message}>
                {(p) => <Input {...p} type="number" min={0} max={720} {...register("payment_void_window_hours")} />}
              </Field>
            </div>
          </Card>
          <Card>
            <CardHeader title="Fayllar va coinlar" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Maksimal fayl hajmi (MB)" error={errors.max_upload_mb?.message}>
                {(p) => <Input {...p} type="number" min={1} max={50} {...register("max_upload_mb")} />}
              </Field>
              <Field label="Ustoz bir martada beradigan coin limiti" error={errors.teacher_reward_limit?.message}>
                {(p) => <Input {...p} type="number" min={1} max={1000} {...register("teacher_reward_limit")} />}
              </Field>
              <Field
                label="Ruxsat etilgan fayl turlari"
                error={errors.allowed_upload_extensions?.message}
                hint="Vergul bilan: pdf,docx,zip"
                className="sm:col-span-2"
              >
                {(p) => <Input {...p} {...register("allowed_upload_extensions")} />}
              </Field>
            </div>
          </Card>
        </fieldset>
        {!readOnly && (
          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Saqlash
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
