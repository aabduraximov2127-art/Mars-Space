import { AlertTriangle, Inbox, Loader2, ShieldOff, WifiOff, type LucideIcon } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

import { parseApiError } from "@/lib/api";
import { initials } from "@/lib/format";
import type { Tone } from "@/lib/labels";
import { cn } from "@/lib/utils";

import { Button } from "./Button";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...rest} />;
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-success-soft text-emerald-700",
  warning: "bg-warning-soft text-amber-700",
  danger: "bg-danger-soft text-rose-700",
  info: "bg-info-soft text-sky-700",
};

const DOTS: Record<Tone, string> = {
  neutral: "bg-ink-400",
  brand: "bg-brand-500",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export function Badge({ tone = "neutral", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {Icon && (
          <span className={cn("rounded-md p-2", TONES[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-24" />
      ) : (
        <p className="tabular mt-1 text-[28px] leading-tight font-[650] tracking-tight text-ink-900">{value}</p>
      )}
      {hint && <p className="mt-1 text-[13px] text-ink-500">{hint}</p>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink-100", className)} aria-hidden />;
}

export function Spinner({ className, label = "Yuklanmoqda" }: { className?: string; label?: string }) {
  return (
    <div role="status" className={cn("flex items-center justify-center p-8 text-ink-500", className)}>
      <Loader2 className="size-6 animate-spin" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({
  title = "Hali ma'lumot yo'q",
  description,
  action,
  icon: Icon = Inbox,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <span className="mb-3 rounded-full bg-ink-100 p-3 text-ink-400">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="font-medium text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const info = parseApiError(error);
  const forbidden = info.status === 403;
  const offline = info.code === "network_error";
  const Icon = forbidden ? ShieldOff : offline ? WifiOff : AlertTriangle;
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)} role="alert">
      <span className="mb-3 rounded-full bg-danger-soft p-3 text-danger">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="font-medium text-ink-800">
        {forbidden ? "Ruxsat yo'q" : info.status === 404 ? "Topilmadi" : offline ? "Aloqa yo'q" : "Xatolik yuz berdi"}
      </p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-500">{info.detail}</p>
      {onRetry && !forbidden && info.status !== 404 && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Qayta urinish
        </Button>
      )}
    </div>
  );
}

export function Avatar({ name, src, size = "md" }: { name: string; src?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-14 text-lg" };
  if (src) return <img src={src} alt="" className={cn("rounded-full object-cover", sizes[size])} />;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700",
        sizes[size],
      )}
      aria-hidden
    >
      {initials(name) || "?"}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 text-ink-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function DescriptionList({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12px] font-medium tracking-wide text-ink-500 uppercase">{k}</dt>
          <dd className="mt-0.5 break-words text-ink-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ProgressBar({ value, tone = "brand" }: { value: number | null | undefined; tone?: Tone }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const bar: Record<Tone, string> = {
    neutral: "bg-ink-400",
    brand: "bg-brand-500",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  };
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-all", bar[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function rateTone(rate: number | null | undefined): Tone {
  if (rate === null || rate === undefined) return "neutral";
  if (rate >= 85) return "success";
  if (rate >= 70) return "warning";
  return "danger";
}
