import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/form";
import { parseApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

import { AuthShell } from "./AuthShell";

const schema = z.object({
  login: z.string().trim().min(1, "Telefon raqam yoki email kiriting."),
  password: z.string().min(1, "Parolni kiriting."),
});
type Values = z.infer<typeof schema>;

const DEMO = [
  ["Superadmin", "+998900000001"],
  ["Admin", "+998900000002"],
  ["Ustoz", "+998901000001"],
  ["Student", "+998902000001"],
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { login: "", password: "" } });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await login(values.login, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(user.must_change_password ? "/change-password" : from || "/", { replace: true });
    } catch (err) {
      setFormError(parseApiError(err).detail);
    }
  });

  return (
    <AuthShell title="Tizimga kirish" subtitle="Telefon raqamingiz yoki email va parolingizni kiriting.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-rose-700">
            {formError}
          </div>
        )}
        <Field label="Telefon yoki email" error={errors.login?.message} required>
          {(p) => (
            <Input {...p} {...register("login")} autoComplete="username" placeholder="+998 90 123 45 67" autoFocus />
          )}
        </Field>
        <Field label="Parol" error={errors.password?.message} required>
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                {...register("password")}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
                aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-[13px] font-medium text-brand-700 hover:underline">
            Parolni unutdingizmi?
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Kirish
        </Button>
      </form>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-lg border border-dashed border-line bg-ink-50 p-4">
          <p className="text-[12px] font-semibold tracking-wide text-ink-500 uppercase">Demo akkauntlar</p>
          <p className="mt-0.5 text-[13px] text-ink-500">
            Parol: <code className="font-mono text-ink-800">Demo12345!</code>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO.map(([role, phone]) => (
              <button
                key={phone}
                type="button"
                onClick={() => {
                  setValue("login", phone);
                  setValue("password", "Demo12345!");
                }}
                className="rounded-md border border-line bg-surface px-2.5 py-2 text-left text-[13px] hover:border-brand-300 hover:bg-brand-50"
              >
                <span className="block font-medium text-ink-900">{role}</span>
                <span className="tabular block text-xs text-ink-500">{phone}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}
