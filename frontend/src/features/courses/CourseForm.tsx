import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { patch, post } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { applyApiErrors, useInvalidate, useOptions } from "@/lib/hooks";
import type { Branch, Course } from "@/lib/types";

interface Values {
  name: string;
  code: string;
  description: string;
  branch: string;
  duration_months: string;
  lessons_per_week: string;
  lesson_duration_minutes: string;
  monthly_price: string;
  is_active: boolean;
}

export function CourseForm({ course, onClose }: { course?: Course | null; onClose: () => void }) {
  const me = useMe();
  const invalidate = useInvalidate();
  const branches = useOptions<Branch>(["branches"], "/branches/", {}, me.role === "superadmin");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      name: course?.name ?? "",
      code: course?.code ?? "",
      description: course?.description ?? "",
      branch: course?.branch ? String(course.branch) : "",
      duration_months: String(course?.duration_months ?? 6),
      lessons_per_week: String(course?.lessons_per_week ?? 3),
      lesson_duration_minutes: String(course?.lesson_duration_minutes ?? 90),
      monthly_price: course ? String(Number(course.monthly_price)) : "",
      is_active: course?.is_active ?? true,
    },
  });
  const submit = handleSubmit(async (v) => {
    const body: Record<string, unknown> = {
      name: v.name,
      code: v.code,
      description: v.description,
      duration_months: Number(v.duration_months),
      lessons_per_week: Number(v.lessons_per_week),
      lesson_duration_minutes: Number(v.lesson_duration_minutes),
      monthly_price: v.monthly_price,
      is_active: v.is_active,
    };
    if (me.role === "superadmin") body.branch = v.branch ? Number(v.branch) : null;
    try {
      if (course) await patch(`/courses/${course.id}/`, body);
      else await post("/courses/", body);
      toast.success("Kurs saqlandi.");
      await invalidate("courses", "course");
      onClose();
    } catch (err) {
      applyApiErrors(err, setError);
    }
  });
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={course ? "Kursni tahrirlash" : "Yangi kurs"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button onClick={submit} loading={isSubmitting}>
            Saqlash
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field label="Nomi" error={errors.name?.message} required>
          {(p) => <Input {...p} {...register("name", { required: "Nomi majburiy." })} />}
        </Field>
        <Field label="Kodi" error={errors.code?.message} required>
          {(p) => <Input {...p} {...register("code", { required: "Kod majburiy." })} className="uppercase" />}
        </Field>
        {me.role === "superadmin" && (
          <Field label="Filial" hint="Bo'sh — barcha filiallar uchun umumiy kurs" error={errors.branch?.message} className="sm:col-span-2">
            {(p) => (
              <Select {...p} {...register("branch")}>
                <option value="">Umumiy (barcha filiallar)</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Oylik narx (so'm)" error={errors.monthly_price?.message} required>
          {(p) => <Input {...p} type="number" min={0} step="1000" {...register("monthly_price", { required: "Narx majburiy." })} />}
        </Field>
        <Field label="Davomiyligi (oy)" error={errors.duration_months?.message} required>
          {(p) => <Input {...p} type="number" min={1} max={60} {...register("duration_months")} />}
        </Field>
        <Field label="Haftada darslar" error={errors.lessons_per_week?.message}>
          {(p) => <Input {...p} type="number" min={1} max={7} {...register("lessons_per_week")} />}
        </Field>
        <Field label="Dars davomiyligi (daqiqa)" error={errors.lesson_duration_minutes?.message}>
          {(p) => <Input {...p} type="number" min={30} max={300} step={15} {...register("lesson_duration_minutes")} />}
        </Field>
        <Field label="Tavsif" error={errors.description?.message} className="sm:col-span-2">
          {(p) => <Textarea {...p} rows={3} {...register("description")} />}
        </Field>
        <Checkbox label="Faol" {...register("is_active")} />
      </form>
    </Modal>
  );
}
