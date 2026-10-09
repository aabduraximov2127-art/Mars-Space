import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/form";
import { fieldMessage, parseApiError, post } from "@/lib/api";

import { AuthShell } from "./AuthShell";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError("Parol kamida 8 ta belgidan iborat bo'lsin.");
    if (password !== confirm) return setError("Parollar mos kelmadi.");
    setLoading(true);
    try {
      await post("/auth/password-reset/confirm/", { uid, token, new_password: password });
      toast.success("Parol yangilandi. Endi tizimga kiring.");
      navigate("/login", { replace: true });
    } catch (err) {
      const info = parseApiError(err);
      setError(fieldMessage(info.errors.new_password) ?? info.detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Yangi parol" subtitle="Yangi parolni kiriting.">
      {!uid || !token ? (
        <p className="rounded-md bg-danger-soft p-4 text-rose-700">Havola noto'g'ri yoki muddati o'tgan.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Yangi parol" required hint="Kamida 8 belgi, faqat raqamlardan iborat bo'lmasin.">
            {(p) => (
              <Input {...p} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            )}
          </Field>
          <Field label="Parolni takrorlang" error={error} required>
            {(p) => (
              <Input {...p} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Saqlash
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-[13px]">
        <Link to="/login" className="font-medium text-brand-700 hover:underline">
          Kirish sahifasiga qaytish
        </Link>
      </p>
    </AuthShell>
  );
}
