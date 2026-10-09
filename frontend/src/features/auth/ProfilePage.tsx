import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Avatar, Badge, Card, CardHeader, DescriptionList, PageHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/form";
import { patch, toFormData } from "@/lib/api";
import { useAuth, useMe } from "@/lib/auth";
import { date, phone } from "@/lib/format";
import { applyApiErrors } from "@/lib/hooks";
import { ROLE, label, tone } from "@/lib/labels";
import type { User } from "@/lib/types";

export default function ProfilePage() {
  const me = useMe();
  const { setUser } = useAuth();
  const [form, setForm] = useState({
    first_name: me.first_name,
    last_name: me.last_name,
    email: me.email,
    specialization: me.profile?.specialization ?? "",
    bio: me.profile?.bio ?? "",
  });
  const [avatar, setAvatar] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = avatar ? toFormData({ ...form, avatar }) : form;
      const user = await patch<User>("/auth/me/", body);
      setUser(user);
      setAvatar(null);
      toast.success("Profil saqlandi.");
    } catch (err) {
      applyApiErrors(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profil" />
      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={me.full_name} src={me.avatar} size="lg" />
          <div>
            <p className="text-lg font-semibold text-ink-900">{me.full_name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-ink-500">
              <Badge tone={tone(ROLE, me.role)}>{label(ROLE, me.role)}</Badge>
              {me.branch_name && <span>{me.branch_name}</span>}
            </div>
          </div>
        </div>
        <DescriptionList
          className="mt-6"
          items={[
            ["Telefon", phone(me.phone)],
            ["Email", me.email || "—"],
            ["Oxirgi kirish", date(me.last_login)],
            ["Ro'yxatdan o'tgan", date(me.created_at)],
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Ma'lumotlarni tahrirlash" description="Telefon, rol va filialni faqat administrator o'zgartiradi." />
        <form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Ism" required>
            {(p) => <Input {...p} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />}
          </Field>
          <Field label="Familiya" required>
            {(p) => <Input {...p} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />}
          </Field>
          <Field label="Email">
            {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
          </Field>
          <Field label="Rasm" hint="JPG, PNG yoki WEBP">
            {(p) => (
              <Input
                {...p}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="py-1.5"
                onChange={(e) => setAvatar(e.target.files?.[0] ?? null)}
              />
            )}
          </Field>
          {me.role === "teacher" && (
            <>
              <Field label="Mutaxassislik" className="sm:col-span-2">
                {(p) => (
                  <Input {...p} value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
                )}
              </Field>
              <Field label="O'zingiz haqingizda" className="sm:col-span-2">
                {(p) => <Textarea {...p} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />}
              </Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving}>
              Saqlash
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
