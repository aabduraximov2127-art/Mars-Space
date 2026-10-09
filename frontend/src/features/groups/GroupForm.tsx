import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { patch, post } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { WEEKDAYS_SHORT } from "@/lib/format";
import { applyApiErrors, useInvalidate, useOptions } from "@/lib/hooks";
import type { Branch, Course, Group, Room, User } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Values {
  code: string;
  name: string;
  course: string;
  branch: string;
  teacher: string;
  room: string;
  status: string;
  start_date: string;
  end_date: string;
  capacity: string;
  days_of_week: number[];
  lesson_start_time: string;
  lesson_end_time: string;
}

export function GroupForm({ group, onClose, onSaved }: { group?: Group | null; onClose: () => void; onSaved?: (g: Group) => void }) {
  const me = useMe();
  const invalidate = useInvalidate();
  const {
    register,
    handleSubmit,
    setError,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      code: group?.code ?? "",
      name: group?.name ?? "",
      course: group ? String(group.course) : "",
      branch: group ? String(group.branch) : me.branch ? String(me.branch) : "",
      teacher: group?.teacher ? String(group.teacher) : "",
      room: group?.room ? String(group.room) : "",
      status: group?.status ?? "forming",
      start_date: group?.start_date ?? "",
      end_date: group?.end_date ?? "",
      capacity: String(group?.capacity ?? 16),
      days_of_week: group?.days_of_week ?? [0, 2, 4],
      lesson_start_time: group?.lesson_start_time?.slice(0, 5) ?? "14:00",
      lesson_end_time: group?.lesson_end_time?.slice(0, 5) ?? "15:30",
    },
  });
  const branch = useWatch({ control, name: "branch" });
  const days = useWatch({ control, name: "days_of_week" });
  const branches = useOptions<Branch>(["branches"], "/branches/", { is_active: true }, me.role === "superadmin");
  const courses = useOptions<Course>(["courses", "options"], "/courses/", { is_active: true });
  const teachers = useOptions<User>(["users", "teachers", branch], "/users/", { role: "teacher", is_active: true, branch }, Boolean(branch));
  const rooms = useOptions<Room>(["rooms", "options", branch], "/rooms/", { branch, is_active: true }, Boolean(branch));
  const courseOptions = (courses.data ?? []).filter((c) => !c.branch || String(c.branch) === branch);

  const submit = handleSubmit(async (v) => {
    if (!v.days_of_week.length) {
      setError("days_of_week", { message: "Kamida bitta dars kunini tanlang." });
      return;
    }
    const body: Record<string, unknown> = {
      code: v.code,
      name: v.name,
      course: Number(v.course),
      teacher: v.teacher ? Number(v.teacher) : null,
      room: v.room ? Number(v.room) : null,
      status: v.status,
      start_date: v.start_date,
      end_date: v.end_date || null,
      capacity: Number(v.capacity),
      days_of_week: v.days_of_week,
      lesson_start_time: v.lesson_start_time,
      lesson_end_time: v.lesson_end_time,
    };
    if (me.role === "superadmin") body.branch = Number(v.branch);
    try {
      const saved = group ? await patch<Group>(`/groups/${group.id}/`, body) : await post<Group>("/groups/", body);
      toast.success(group ? "Guruh saqlandi." : "Guruh yaratildi.");
      await invalidate("groups", "group");
      onSaved?.(saved);
      onClose();
    } catch (err) {
      applyApiErrors(err, setError);
    }
  });

  const toggleDay = (d: number) =>
    setValue(
      "days_of_week",
      days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort(),
      { shouldDirty: true },
    );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={group ? "Guruhni tahrirlash" : "Yangi guruh"}
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
          {(p) => <Input {...p} {...register("name", { required: "Nomi majburiy." })} placeholder="Frontend 03" />}
        </Field>
        <Field label="Kodi" error={errors.code?.message} required>
          {(p) => <Input {...p} {...register("code", { required: "Kod majburiy." })} placeholder="FE-03" className="uppercase" />}
        </Field>
        {me.role === "superadmin" && (
          <Field label="Filial" error={errors.branch?.message} required>
            {(p) => (
              <Select {...p} {...register("branch", { required: "Filialni tanlang." })}>
                <option value="">Tanlang</option>
                {branches.data?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Kurs" error={errors.course?.message} required>
          {(p) => (
            <Select {...p} {...register("course", { required: "Kursni tanlang." })}>
              <option value="">Tanlang</option>
              {courseOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.branch ? "" : "(umumiy)"}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Ustoz" error={errors.teacher?.message}>
          {(p) => (
            <Select {...p} {...register("teacher")} disabled={!branch}>
              <option value="">Biriktirilmagan</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Xona" error={errors.room?.message}>
          {(p) => (
            <Select {...p} {...register("room")} disabled={!branch}>
              <option value="">Tanlanmagan</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} {r.capacity ? `(${r.capacity} o'rin)` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Holat" error={errors.status?.message}>
          {(p) => (
            <Select {...p} {...register("status")}>
              <option value="forming">Shakllanmoqda</option>
              <option value="active">Faol</option>
              <option value="completed">Yakunlangan</option>
              <option value="cancelled">Bekor qilingan</option>
            </Select>
          )}
        </Field>
        <Field label="Sig'im" error={errors.capacity?.message} required>
          {(p) => <Input {...p} type="number" min={1} max={500} {...register("capacity", { required: true })} />}
        </Field>
        <Field label="Boshlanish sanasi" error={errors.start_date?.message} required>
          {(p) => <Input {...p} type="date" {...register("start_date", { required: "Sana majburiy." })} />}
        </Field>
        <Field label="Tugash sanasi" error={errors.end_date?.message}>
          {(p) => <Input {...p} type="date" {...register("end_date")} />}
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-[13px] font-medium text-ink-700">Dars kunlari</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Dars kunlari">
            {WEEKDAYS_SHORT.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(i)}
                onClick={() => toggleDay(i)}
                className={cn(
                  "h-9 w-11 rounded-md border text-sm font-medium transition-colors",
                  days.includes(i)
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-line bg-surface text-ink-600 hover:border-brand-300",
                )}
              >
                {d}
              </button>
            ))}
          </div>
          {errors.days_of_week?.message && <p className="mt-1.5 text-[13px] text-danger">{errors.days_of_week.message}</p>}
        </div>
        <Field label="Dars boshlanishi" error={errors.lesson_start_time?.message}>
          {(p) => <Input {...p} type="time" {...register("lesson_start_time")} />}
        </Field>
        <Field label="Dars tugashi" error={errors.lesson_end_time?.message}>
          {(p) => <Input {...p} type="time" {...register("lesson_end_time")} />}
        </Field>
      </form>
    </Modal>
  );
}
