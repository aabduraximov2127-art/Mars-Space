import { Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-card",
  secondary: "bg-surface text-ink-800 border border-line hover:bg-ink-50 active:bg-ink-100 shadow-card",
  ghost: "text-ink-700 hover:bg-ink-100 active:bg-ink-200",
  danger: "bg-danger text-white hover:bg-rose-700 active:bg-rose-800 shadow-card",
  success: "bg-success text-white hover:bg-emerald-700 shadow-card",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800 disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
