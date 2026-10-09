import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

import { MONTHS } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Input, Select } from "./form";

/*
 * Native <input type="date"> renders its placeholder and format in the *browser* language
 * (e.g. "дд.мм.гггг" on a Russian Windows). These inputs always show Uzbek "kk.oo.yyyy" text,
 * accept typing, and still open the native calendar from the icon button.
 */

const pad = (n: number) => String(n).padStart(2, "0");

export function isoToText(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** "09.10.2026" -> "2026-10-09"; "" -> ""; anything incomplete/invalid -> null. */
export function textToIso(text: string): string | null {
  if (!text.trim()) return "";
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Keep digits only and insert the dots: "0910" -> "09.10". */
export function maskDate(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max">;

interface DateInputProps extends BaseProps {
  /** ISO date "YYYY-MM-DD" or "". */
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
}

export function DateInput({ value, onChange, min, max, className, disabled, placeholder = "kk.oo.yyyy", ...rest }: DateInputProps) {
  const [text, setText] = useState(isoToText(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => setText(isoToText(value)), [value]);

  const handleText = (raw: string) => {
    const masked = maskDate(raw);
    setText(masked);
    const iso = textToIso(masked);
    if (iso !== null && iso !== value) onChange(iso);
  };

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  return (
    <div className={cn("relative h-10", className)}>
      <Input
        {...rest}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={(e) => handleText(e.target.value)}
        onBlur={(e) => {
          if (textToIso(text) === null) setText(isoToText(value)); // revert an incomplete entry
          rest.onBlur?.(e);
        }}
        className="tabular h-full pr-9"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Kalendarni ochish"
        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700 disabled:opacity-40"
      >
        <CalendarDays className="size-4" />
      </button>
      <input
        ref={picker}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute bottom-0 left-0 h-px w-px opacity-0"
      />
    </div>
  );
}

/** "YYYY-MM-DDTHH:mm" (local) split into an Uzbek date field and a 24-hour time field. */
export function DateTimeInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<DateInputProps, "min" | "max"> & { value: string; onChange: (value: string) => void }) {
  const [datePart = "", timePart = ""] = value ? value.split("T") : [];
  const emit = (d: string, t: string) => onChange(d ? `${d}T${t || "23:59"}` : "");
  return (
    <div className={cn("flex gap-2", className)}>
      <DateInput {...rest} className="flex-1" value={datePart} onChange={(d) => emit(d, timePart)} />
      <Input
        type="time"
        aria-label="Vaqt"
        className="w-28"
        value={timePart}
        disabled={rest.disabled || !datePart}
        onChange={(e) => emit(datePart, e.target.value)}
      />
    </div>
  );
}

function monthOptions(back = 24, ahead = 3) {
  const now = new Date();
  const out: { value: string; label: string }[] = [];
  for (let i = ahead; i >= -back; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return out;
}

/** Month picker ("YYYY-MM") with Uzbek month names. */
export function MonthSelect({
  value,
  onChange,
  emptyLabel,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
}) {
  return (
    <Select {...rest} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {monthOptions().map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </Select>
  );
}
