import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/display";

/** Single-series charts: one hue (brand), thin marks, recessive grid, hover tooltip. */
const BRAND = "#5B3FE4";
const GRID = "#E6E8EF";
const AXIS = "#64748B";

interface TipProps {
  active?: boolean;
  payload?: readonly { value?: unknown }[];
  label?: unknown;
  valueFormat: (v: number) => string;
  labelFormat?: (l: string) => string;
}

function ChartTooltip({ active, payload, label, valueFormat, labelFormat }: TipProps) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number | null;
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[13px] shadow-pop">
      <p className="text-ink-500">{labelFormat ? labelFormat(String(label)) : String(label)}</p>
      <p className="tabular font-semibold text-ink-900">{v === null || v === undefined ? "Ma'lumot yo'q" : valueFormat(v)}</p>
    </div>
  );
}

interface ChartProps<T> {
  data: T[];
  x: string;
  y: string;
  valueFormat: (v: number) => string;
  tickFormat?: (v: number) => string;
  xFormat?: (v: string) => string;
  labelFormat?: (v: string) => string;
  height?: number;
  domain?: [number, number];
  empty?: ReactNode;
  ariaLabel: string;
}

function isEmpty<T>(data: T[], y: string) {
  return !data.length || data.every((d) => !Number((d as Record<string, unknown>)[y]));
}

export function BarSeries<T>({
  data,
  x,
  y,
  valueFormat,
  tickFormat,
  xFormat,
  labelFormat,
  height = 240,
  empty,
  ariaLabel,
}: ChartProps<T>) {
  if (isEmpty(data, y)) return <>{empty ?? <EmptyState title="Ma'lumot yo'q" className="py-10" />}</>;
  const rows = data.map((d) => ({ ...d, [y]: Number((d as Record<string, unknown>)[y]) }));
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows as Record<string, unknown>[]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis
            dataKey={x}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickFormatter={xFormat}
            minTickGap={8}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickFormatter={tickFormat}
            width={56}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(91,63,228,0.06)" }}
            content={(p) => (
              <ChartTooltip
                active={p.active}
                payload={p.payload}
                label={p.label}
                valueFormat={valueFormat}
                labelFormat={labelFormat ?? xFormat}
              />
            )}
          />
          <Bar dataKey={y} fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaSeries<T>({
  data,
  x,
  y,
  valueFormat,
  tickFormat,
  xFormat,
  labelFormat,
  height = 240,
  domain,
  empty,
  ariaLabel,
}: ChartProps<T>) {
  if (!data.length || data.every((d) => (d as Record<string, unknown>)[y] === null)) {
    return <>{empty ?? <EmptyState title="Ma'lumot yo'q" className="py-10" />}</>;
  }
  return (
    <div role="img" aria-label={ariaLabel} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data as Record<string, unknown>[]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
              <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
          <XAxis
            dataKey={x}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickFormatter={xFormat}
            minTickGap={12}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: AXIS, fontSize: 12 }}
            tickFormatter={tickFormat}
            width={56}
            domain={domain}
          />
          <Tooltip
            cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
            content={(p) => (
              <ChartTooltip
                active={p.active}
                payload={p.payload}
                label={p.label}
                valueFormat={valueFormat}
                labelFormat={labelFormat ?? xFormat}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey={y}
            stroke={BRAND}
            strokeWidth={2}
            fill="url(#area-fill)"
            connectNulls
            dot={false}
            activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const compactMoney = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)} mln`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)} ming`;
  return String(v);
};
