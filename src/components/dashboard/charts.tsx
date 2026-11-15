"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { Analytics } from "@/lib/analytics-service";
import { formatDuration } from "@/lib/client";
import { bucketLabel, dayLabel, type RangeKey } from "./format";

type Trend = Analytics["trend"];

const axis = { stroke: "var(--ink-faint)", fontSize: 12, tickLine: false, axisLine: false } as const;

/** Show roughly one tick per day (7d) / every few hours (today) / every ~5 days (30d). */
function tickEvery(range: RangeKey, n: number) {
  if (range === "7d") return Math.max(1, Math.round(n / 7)) - 1;
  if (range === "today") return 3;
  return 4;
}

function Panel({
  title,
  subtitle,
  legend,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string; dashed?: boolean }[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"rounded-2xl border border-line bg-surface p-5 " + (className ?? "")}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm text-ink-faint">{subtitle}</p> : null}
        </div>
        {legend ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-4 rounded"
                  style={
                    l.dashed
                      ? { backgroundImage: `linear-gradient(90deg, ${l.color} 60%, transparent 0)`, backgroundSize: "6px 2px" }
                      : { background: l.color, height: 8, width: 8, borderRadius: 2 }
                  }
                />
                {l.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="mt-1 flex items-center gap-2 text-ink-soft">
          {r.color ? <span className="size-2 rounded-sm" style={{ background: r.color }} /> : null}
          <span>{r.label}</span>
          <span className="tabular ml-auto pl-4 font-medium text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export function QueueLengthChart({ trend, range, tz }: { trend: Trend; range: RangeKey; tz: string }) {
  return (
    <Panel
      title="Queue length"
      subtitle="People waiting at once, averaged over each period"
      legend={[
        { label: "Average", color: "var(--series-1)" },
        { label: "Peak", color: "var(--series-1)", dashed: true },
      ]}
      className="lg:col-span-2"
    >
      <div className="h-64">
        <ResponsiveContainer>
          <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="len-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="t"
              {...axis}
              interval={tickEvery(range, trend.length)}
              tickFormatter={(t) => bucketLabel(t, range, tz)}
              minTickGap={16}
            />
            <YAxis {...axis} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ stroke: "var(--ink-faint)", strokeDasharray: "3 3" }}
              content={(p: TooltipContentProps<ValueType, NameType>) =>
                p.active && p.payload?.length ? (
                  <TipBox
                    title={bucketLabel(String(p.label), range, tz, true)}
                    rows={[
                      { label: "Average waiting", value: String(p.payload[0].payload.avgLength), color: "var(--series-1)" },
                      { label: "Peak", value: String(p.payload[0].payload.peakLength) },
                    ]}
                  />
                ) : null
              }
            />
            <Area
              type="monotone"
              dataKey="avgLength"
              stroke="var(--series-1)"
              strokeWidth={2}
              fill="url(#len-fill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="peakLength"
              stroke="var(--series-1)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              activeDot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function WaitTrendChart({ trend, range, tz }: { trend: Trend; range: RangeKey; tz: string }) {
  // Hourly averages over a week are too noisy to read; show one point per day instead.
  const daily = range === "7d";
  const label = (t: string, long = false) => (daily ? dayLabel(t, tz, long) : bucketLabel(t, range, tz, long));
  const data = (daily ? rollupDaily(trend, tz) : trend).map((t) => ({ ...t, waitMin: t.avgWaitSec == null ? null : Math.round(t.avgWaitSec / 6) / 10 }));
  return (
    <Panel title="Average wait" subtitle="Minutes from joining to being called, by when they were called">
      <div className="h-56">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="t"
              {...axis}
              interval={daily ? 0 : tickEvery(range, data.length)}
              tickFormatter={(t) => label(t)}
              minTickGap={16}
            />
            <YAxis {...axis} width={40} unit="m" />
            <Tooltip
              cursor={{ stroke: "var(--ink-faint)", strokeDasharray: "3 3" }}
              content={(p: TooltipContentProps<ValueType, NameType>) =>
                p.active && p.payload?.length ? (
                  <TipBox
                    title={label(String(p.label), true)}
                    rows={[
                      {
                        label: "Average wait",
                        value: formatDuration(p.payload[0].payload.avgWaitSec),
                        color: "var(--series-1)",
                      },
                      { label: "Called", value: String(p.payload[0].payload.served) },
                    ]}
                  />
                ) : null
              }
            />
            <Line
              type="monotone"
              dataKey="waitMin"
              stroke="var(--series-1)"
              strokeWidth={2}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
              connectNulls={range !== "today"}
              dot={daily ? { r: 3, strokeWidth: 0, fill: "var(--series-1)" } : false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export function ThroughputChart({ trend, range, tz }: { trend: Trend; range: RangeKey; tz: string }) {
  // 7-day view: 3-hour buckets are too thin for paired bars, so roll them up per day.
  const data = range === "7d" ? rollupDaily(trend, tz) : trend;
  return (
    <Panel
      title="Arrivals and served"
      subtitle={range === "today" ? "Per half hour" : "Per day"}
      legend={[
        { label: "Joined", color: "var(--series-2)" },
        { label: "Served", color: "var(--series-1)" },
      ]}
    >
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="t"
              {...axis}
              tickFormatter={(t) => range === "7d" ? dayLabel(t, tz) : bucketLabel(t, range, tz)}
              interval={range === "today" ? 3 : range === "30d" ? 4 : 0}
              minTickGap={8}
            />
            <YAxis {...axis} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ fill: "var(--sunken)" }}
              content={(p: TooltipContentProps<ValueType, NameType>) =>
                p.active && p.payload?.length ? (
                  <TipBox
                    title={range === "7d" ? dayLabel(String(p.label), tz, true) : bucketLabel(String(p.label), range, tz, true)}
                    rows={[
                      { label: "Joined", value: String(p.payload[0].payload.arrivals), color: "var(--series-2)" },
                      { label: "Served", value: String(p.payload[0].payload.served), color: "var(--series-1)" },
                      { label: "Cancelled", value: String(p.payload[0].payload.cancelled) },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="arrivals" fill="var(--series-2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="served" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function rollupDaily(trend: Trend, tz: string) {
  type Row = { t: string; arrivals: number; served: number; cancelled: number; waitSum: number; waitN: number };
  const byDay = new Map<string, Row>();
  for (const p of trend) {
    const key = new Date(p.t).toLocaleDateString("en-CA", { timeZone: tz });
    const row = byDay.get(key) ?? { t: p.t, arrivals: 0, served: 0, cancelled: 0, waitSum: 0, waitN: 0 };
    row.arrivals += p.arrivals;
    row.served += p.served;
    row.cancelled += p.cancelled;
    if (p.avgWaitSec != null && p.served) {
      row.waitSum += p.avgWaitSec * p.served;
      row.waitN += p.served;
    }
    byDay.set(key, row);
  }
  return [...byDay.values()].map(({ waitSum, waitN, ...r }) => ({ ...r, avgWaitSec: waitN ? waitSum / waitN : null }));
}

export function WaitDistributionChart({ data }: { data: Analytics["waitDistribution"] }) {
  const total = data.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <Panel title="How long people waited" subtitle="Minutes waited, for everyone called in this period">
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" {...axis} interval={0} tickFormatter={(l: string) => l.replace(/m$/, "").replace("< 5", "<5")} />
            <YAxis {...axis} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ fill: "var(--sunken)" }}
              content={(p: TooltipContentProps<ValueType, NameType>) =>
                p.active && p.payload?.length ? (
                  <TipBox
                    title={`Waited ${p.payload[0].payload.label}`}
                    rows={[
                      {
                        label: "People",
                        value: `${p.payload[0].payload.count} (${Math.round((p.payload[0].payload.count / total) * 100)}%)`,
                        color: "var(--series-1)",
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="count" fill="var(--series-1)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export { Panel };
