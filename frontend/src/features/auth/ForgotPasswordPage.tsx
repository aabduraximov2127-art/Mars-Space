import { MailCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/form";
import { parseApiError, post } from "@/lib/api";

import { AuthShell } from "./AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("To'g'ri email kiriting.");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      await post("/auth/password-reset/", { email });
      setSent(true);
    } catch (err) {
      setError(parseApiError(err).detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Parolni tiklash" subtitle="Akkauntingizga bog'langan emailni kiriting.">
      {sent ? (
        <div className="rounded-lg border border-success/20 bg-success-soft p-5 text-emerald-800">
          <MailCheck className="mb-2 size-6" aria-hidden />
          <p className="font-medium">Xat yuborildi</p>
          <p className="mt-1 text-[13px]">
            Agar bu email ro'yxatdan o'tgan bo'lsa, parolni tiklash havolasi yuborildi. Pochtangizni tekshiring.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" error={error} required>
            {(p) => (
              <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Havola yuborish
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
