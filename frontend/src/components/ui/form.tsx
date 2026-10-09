import { Search, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

import { cn } from "@/lib/utils";

const control =
  "w-full rounded-md border border-line bg-surface px-3 text-sm text-ink-900 shadow-card transition-colors placeholder:text-ink-400 " +
  "hover:border-ink-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 " +
  "disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/20";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(control, "py-2 leading-relaxed", className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(control, "h-10 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export function Checkbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-ink-700", className)}>
      <input type="checkbox" className="size-4 rounded border-line accent-brand-600" {...rest} />
      {label}
    </label>
  );
}

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}

/** Label + control + hint/error, wired with ``aria-describedby``. */
export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label htmlFor={id} className="block text-[13px] font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": describedBy })}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Qidirish...",
  className,
  delay = 300,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  delay?: number;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), delay);
    return () => clearTimeout(t);
  }, [draft, value, onChange, delay]);
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(control, "h-10 pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden")}
      />
      {draft && (
        <button
          type="button"
          aria-label="Tozalash"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
