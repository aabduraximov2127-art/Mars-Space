import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/form";
import { post, setAccessToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { applyApiErrors } from "@/lib/hooks";

const schema = z
  .object({
    old_password: z.string().min(1, "Joriy parolni kiriting."),
    new_password: z.string().min(8, "Kamida 8 ta belgi."),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Parollar mos kelmadi." });
type Values = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const { user, reloadUser } = useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const r = await post<{ access: string }>("/auth/change-password/", {
        old_password: values.old_password,
        new_password: values.new_password,
      });
      setAccessToken(r.access);
      await reloadUser();
      toast.success("Parol o'zgartirildi.");
      navigate("/", { replace: true });
    } catch (err) {
      applyApiErrors(err, setError);
    }
  });

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Parolni o'zgartirish"
        description={
          user?.must_change_password
            ? "Xavfsizlik uchun vaqtinchalik parolni o'zingizning parolingizga almashtiring."
            : "Boshqa qurilmalardagi sessiyalar yopiladi."
        }
      />
      <Card className="p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Joriy parol" error={errors.old_password?.message} required>
            {(p) => <Input {...p} type="password" autoComplete="current-password" {...register("old_password")} />}
          </Field>
          <Field
            label="Yangi parol"
            error={errors.new_password?.message}
            hint="Kamida 8 belgi, oddiy va faqat raqamli bo'lmasin."
            required
          >
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...register("new_password")} />}
          </Field>
          <Field label="Yangi parolni takrorlang" error={errors.confirm?.message} required>
            {(p) => <Input {...p} type="password" autoComplete="new-password" {...register("confirm")} />}
          </Field>
          <Button type="submit" loading={isSubmitting} icon={<KeyRound className="size-4" />}>
            Saqlash
          </Button>
        </form>
      </Card>
    </div>
  );
}
