import { BarChart3, CalendarCheck2, GraduationCap, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-600/40 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-48 -left-24 size-[420px] rounded-full bg-brand-400/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <span className="text-xl font-semibold tracking-tight">EduCentr</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight text-white">
            O'quv markazingiz — bitta tizimda.
          </h2>
          <p className="mt-4 text-lg text-brand-200">
            Guruhlar, dars jadvali, davomat, vazifalar, baholar va to'lovlar. Har bir rol uchun o'z kabineti.
          </p>
          <ul className="mt-10 space-y-4 text-brand-100">
            {[
              [CalendarCheck2, "Davomat va dars jadvali real vaqtda"],
              [BarChart3, "Moliya va o'zlashtirish hisobotlari"],
              [ShieldCheck, "Rollar bo'yicha xavfsiz kirish"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof CalendarCheck2;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="rounded-lg bg-white/10 p-2">
                    <I className="size-4" aria-hidden />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-sm text-brand-300">© {new Date().getFullYear()} EduCentr</p>
      </aside>
      <main className="flex items-center justify-center bg-surface px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand-600 text-white">
              <GraduationCap className="size-5" aria-hidden />
            </span>
            <span className="text-lg font-semibold text-ink-900">EduCentr</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-ink-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
