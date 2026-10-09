import type { Role } from "./types";

/** Thousands are separated by non-breaking spaces so amounts never wrap across lines. */
const NBSP = "\u00a0";
const group3 = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

/** "1250000.00" -> "1 250 000 so'm". Money is never computed on the client, only formatted. */
export function money(value: string | number | null | undefined, suffix = `${NBSP}so'm`): string {
  if (value === null || value === undefined || value === "") return "—";
  const str = typeof value === "number" ? value.toFixed(2) : String(value);
  const negative = str.startsWith("-");
  const [intPart, frac = ""] = str.replace("-", "").split(".");
  const cents = frac.replace(/0+$/, "");
  return `${negative ? "−" : ""}${group3(intPart)}${cents ? "," + cents.padEnd(2, "0") : ""}${suffix}`;
}

export function num(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return group3(String(value));
}

function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  // Plain dates are local wall-clock values: avoid the UTC shift of `new Date("2026-10-09")`.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function date(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = parseDate(value);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function time(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5);
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return `${date(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const MONTHS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentabr",
  "Oktabr",
  "Noyabr",
  "Dekabr",
];
export const WEEKDAYS = ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"];
export const WEEKDAYS_SHORT = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

export function monthLabel(value: string): string {
  const d = parseDate(value.length === 7 ? `${value}-01` : value);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function weekdayLabel(value: string): string {
  const d = parseDate(value);
  return WEEKDAYS[(d.getDay() + 6) % 7];
}

export function relative(value: string | null | undefined): string {
  if (!value) return "";
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return "hozirgina";
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} kun oldin`;
  return date(value);
}

export function phone(value: string | null | undefined): string {
  if (!value) return "—";
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(value);
  return m ? `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : value;
}

export function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today(): string {
  return isoDate(new Date());
}

export function addDays(value: string, days: number): string {
  const d = parseDate(value);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function startOfWeek(value: string): string {
  const d = parseDate(value);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

export function daysOfWeek(days: number[] | null | undefined): string {
  if (!days?.length) return "—";
  return days.map((d) => WEEKDAYS_SHORT[d]).join(", ");
}

export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Datetime-local input value from ISO and back. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

export const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  teacher: "Ustoz",
  student: "Student",
};
