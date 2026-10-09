import { Copy } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/Modal";
import { DateInput } from "@/components/ui/dates";
import { patch, post } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/format";
import { applyApiErrors, useInvalidate, useOptions } from "@/lib/hooks";
import type { Branch, Role, User } from "@/lib/types";

interface Values {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  branch: string;
  password: string;
  birth_date: string;
  parent_name: string;
  parent_phone: string;
  specialization: string;
  notes: string;
}

export function TemporaryPasswordModal({ password, onClose }: { password: string; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Vaqtinchalik parol"
      size="sm"
      footer={<Button onClick={onClose}>Tushunarli</Button>}
    >
      <p className="text-ink-600">
        Parol faqat bir marta ko'rsatiladi. Uni foydalanuvchiga xavfsiz yo'l bilan yetkazing — birinchi kirishda u
        parolni almashtiradi.
      </p>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-line bg-ink-50 px-4 py-3">
        <code className="font-mono text-lg font-semibold tracking-wide text-ink-900">{password}</code>
        <Button
          variant="secondary"
          size="sm"
          icon={<Copy className="size-3.5" />}
          onClick={() => navigator.clipboard?.writeText(password).then(() => toast.success("Nusxa olindi."))}
        >
          Nusxa
        </Button>
      </div>
    </Modal>
  );
}

export function UserForm({ role, user, onClose }: { role: Role; user?: User | null; onClose: () => void }) {
  const me = useMe();
  const invalidate = useInvalidate();
  const [temp, setTemp] = useState<string | null>(null);
  const branches = useOptions<Branch>(["branches"], "/branches/", { is_active: true }, me.role === "superadmin");
  const p = user?.profile;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    defaultValues: {
      first_name: user?.first_name ?? "",
      last_name: user?.last_name ?? "",
      phone: user?.phone ?? "+998",
      email: user?.email ?? "",
      branch: user?.branch ? String(user.branch) : "",
      password: "",
      birth_date: p?.birth_date ?? "",
      parent_name: p?.parent_name ?? "",
      parent_phone: p?.parent_phone ?? "",
      specialization: p?.specialization ?? "",
      notes: p?.notes ?? "",
    },
  });

  const submit = handleSubmit(async (v) => {
    const profile: Record<string, unknown> = { notes: v.notes };
    if (role === "student") {
      Object.assign(profile, { birth_date: v.birth_date || null, parent_name: v.parent_name, parent_phone: v.parent_phone });
    }
    if (role === "teacher") profile.specialization = v.specialization;
    const body: Record<string, unknown> = {
      first_name: v.first_name,
      last_name: v.last_name,
      phone: v.phone,
      email: v.email,
      profile,
    };
    try {
      if (user) {
        await patch(`/users/${user.id}/`, body);
        toast.success("Ma'lumotlar saqlandi.");
        await invalidate("users", "user");
        onClose();
      } else {
        body.role = role;
        if (me.role === "superadmin" && role !== "superadmin") body.branch = v.branch ? Number(v.branch) : null;
        if (v.password) body.password = v.password;
        const created = await post<User>("/users/", body);
        toast.success(`${ROLE_LABELS[role]} yaratildi.`);
        await invalidate("users");
        if (created.temporary_password) setTemp(created.temporary_password);
        else onClose();
      }
    } catch (err) {
      applyApiErrors(err, setError);
    }
  });

  if (temp) return <TemporaryPasswordModal password={temp} onClose={onClose} />;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={user ? "Ma'lumotlarni tahrirlash" : `Yangi ${ROLE_LABELS[role].toLowerCase()}`}
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
        <Field label="Ism" error={errors.first_name?.message} required>
          {(f) => <Input {...f} {...register("first_name", { required: "Ism majburiy." })} autoFocus />}
        </Field>
        <Field label="Familiya" error={errors.last_name?.message} required>
          {(f) => <Input {...f} {...register("last_name", { required: "Familiya majburiy." })} />}
        </Field>
        <Field label="Telefon" error={errors.phone?.message} required hint="+998XXXXXXXXX">
          {(f) => <Input {...f} type="tel" {...register("phone", { required: "Telefon majburiy." })} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(f) => <Input {...f} type="email" {...register("email")} />}
        </Field>
        {!user && me.role === "superadmin" && role !== "superadmin" && (
          <Field label="Filial" error={errors.branch?.message} required>
            {(f) => (
              <Select {...f} {...register("branch", { required: "Filialni tanlang." })}>
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
        {!user && (
          <Field label="Parol" error={errors.password?.message} hint="Bo'sh qoldirilsa vaqtinchalik parol yaratiladi.">
            {(f) => <Input {...f} type="password" autoComplete="new-password" {...register("password")} />}
          </Field>
        )}
        {role === "student" && (
          <>
            <Field label="Tug'ilgan sana" error={errors.birth_date?.message}>
              {(f) => (
                <Controller
                  control={control}
                  name="birth_date"
                  render={({ field }) => <DateInput {...f} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />}
                />
              )}
            </Field>
            <Field label="Ota-ona ismi" error={errors.parent_name?.message}>
              {(f) => <Input {...f} {...register("parent_name")} />}
            </Field>
            <Field label="Ota-ona telefoni" error={errors.parent_phone?.message}>
              {(f) => <Input {...f} type="tel" {...register("parent_phone")} placeholder="+998" />}
            </Field>
          </>
        )}
        {role === "teacher" && (
          <Field label="Mutaxassislik" error={errors.specialization?.message}>
            {(f) => <Input {...f} {...register("specialization")} />}
          </Field>
        )}
        <Field label="Ichki izoh" hint="Faqat administratorlar ko'radi." className="sm:col-span-2">
          {(f) => <Textarea {...f} rows={2} {...register("notes")} />}
        </Field>
      </form>
    </Modal>
  );
}
