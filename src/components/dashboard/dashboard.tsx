"use client";

import { clsx } from "clsx";
import { Download, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Analytics } from "@/lib/analytics-service";
import { formatDuration } from "@/lib/client";
import { useLiveData } from "@/lib/hooks";
import { EmptyState } from "../ui";
import { QueueLengthChart, ThroughputChart, WaitDistributionChart, WaitTrendChart } from "./charts";
import { pct, type RangeKey } from "./format";
import { Heatmap } from "./heatmap";
import { InsightsPanel } from "./insights-panel";

const RANGES: { key: RangeKey; label: string; prev: string }[] = [
  { key: "today", label: "Today", prev: "same time yesterday" },
  { key: "7d", label: "7 days", prev: "previous 7 days" },
  { key: "30d", label: "30 days", prev: "previous 30 days" },
];

export function Dashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const range = (RANGES.find((r) => r.key === params.get("range"))?.key ?? "7d") as RangeKey;
  const queue = params.get("queue");
  const qs = new URLSearchParams({ range, ...(queue ? { queue } : {}) }).toString();
  const { data, error, refresh } = useLiveData<Analytics>(`/api/analytics?${qs}`, null);
  const [heatMetric, setHeatMetric] = useState<"arrivals" | "wait">("arrivals");

  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const prevLabel = RANGES.find((r) => r.key === range)!.prev;
  const stale = data && data.range !== range;

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-wide text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-ink-soft">How long people wait, and when the queue builds up.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Time range" className="flex rounded-lg border border-line bg-surface p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                role="radio"
                aria-checked={range === r.key}
                onClick={() => setParam("range", r.key)}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  range === r.key ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <select
            aria-label="Queue"
            value={queue ?? ""}
            onChange={(e) => setParam("queue", e.target.value || null)}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value="">All queues</option>
            {data?.queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
          <a
            href={`/api/analytics/export?${qs}`}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:border-ink-faint"
            download
          >
            <Download className="size-4" /> Export CSV
          </a>
        </div>
      </div>

      {error ? (
        <p className="mt-8 rounded-lg bg-red-wash px-4 py-3 text-red">{error}</p>
      ) : !data ? (
        <DashboardSkeleton />
      ) : data.queues.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line">
          <EmptyState
            title="No queues yet"
            action={
              <Link href="/queues" className="font-medium text-teal hover:underline">
                Create a queue
              </Link>
            }
          >
            Charts appear here once people start joining your queues.
          </EmptyState>
        </div>
      ) : (
        <div className={clsx("mt-6 space-y-6 transition-opacity", stale && "opacity-60")}>
          <Kpis a={data} prevLabel={prevLabel} />
          <InsightsPanel range={range} queue={queue} />
          <div className="grid gap-6 lg:grid-cols-2">
            <QueueLengthChart trend={data.trend} range={range} tz={data.timezone} />
            <WaitTrendChart trend={data.trend} range={range} tz={data.timezone} />
            <ThroughputChart trend={data.trend} range={range} tz={data.timezone} />
            <WaitDistributionChart data={data.waitDistribution} />
            <Outcomes a={data} />
            <div className="lg:col-span-2">
              <div className="mb-2 flex justify-end">
                <div role="radiogroup" aria-label="Heatmap measure" className="flex gap-1 text-sm">
                  {(
                    [
                      ["arrivals", "Arrivals"],
                      ["wait", "Wait time"],
                    ] as const
                  ).map(([k, l]) => (
                    <button
                      key={k}
                      role="radio"
                      aria-checked={heatMetric === k}
                      onClick={() => setHeatMetric(k)}
                      className={clsx(
                        "rounded-md px-2.5 py-1",
                        heatMetric === k ? "bg-surface font-medium shadow-sm ring-1 ring-line" : "text-ink-soft",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <Heatmap heatmap={data.heatmap} metric={heatMetric} />
            </div>
          </div>
          {!queue ? <PerQueue a={data} /> : null}
          <p className="text-xs text-ink-faint">
            Times shown in {data.timezone}. Wait = time from joining the line to being called to a counter.
          </p>
        </div>
      )}
    </div>
  );
}

type Kpi = { label: string; value: string; now: number | null; prev: number | null; better: "down" | "up"; hint?: string };

function Kpis({ a, prevLabel }: { a: Analytics; prevLabel: string }) {
  const k = a.kpis;
  const p = a.previous;
  const items: Kpi[] = [
    { label: "Average wait", value: formatDuration(k.avgWaitSec), now: k.avgWaitSec, prev: p.avgWaitSec, better: "down" },
    {
      label: "9 in 10 called within",
      value: formatDuration(k.p90WaitSec),
      now: k.p90WaitSec,
      prev: p.p90WaitSec,
      better: "down",
      hint: "90th percentile wait",
    },
    { label: "Served", value: k.served.toLocaleString("en-IN"), now: k.served, prev: p.served, better: "up" },
    {
      label: "Left without being seen",
      value: pct(k.cancelRate),
      now: k.cancelRate,
      prev: p.cancelRate,
      better: "down",
      hint: "Cancelled tokens as a share of everyone who joined",
    },
    {
      label: "Time at counter",
      value: formatDuration(k.avgServiceSec),
      now: k.avgServiceSec,
      prev: p.avgServiceSec,
      better: "down",
    },
    { label: "Waiting right now", value: String(k.waitingNow), now: null, prev: null, better: "down" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      {items.map((it) => (
        <div key={it.label} className="bg-surface p-4" title={it.hint}>
          <dt className="text-sm text-ink-soft">{it.label}</dt>
          <dd className="font-wide tabular mt-1 text-2xl font-bold">{it.value}</dd>
          <Delta it={it} prevLabel={prevLabel} />
        </div>
      ))}
    </dl>
  );
}

function Delta({ it, prevLabel }: { it: Kpi; prevLabel: string }) {
  if (it.now == null || it.prev == null || it.prev === 0) {
    return <p className="mt-1 text-xs text-ink-faint">{it.now == null ? "Live" : "No earlier data"}</p>;
  }
  const change = (it.now - it.prev) / it.prev;
  const flat = Math.abs(change) < 0.02;
  const good = flat ? null : (change < 0) === (it.better === "down");
  const Icon = change > 0 ? TrendingUp : TrendingDown;
  return (
    <p
      className={clsx("mt-1 flex items-center gap-1 text-xs", {
        "text-ink-faint": good === null,
        "text-green": good === true,
        "text-red": good === false,
      })}
      title={`vs ${prevLabel}`}
    >
      {flat ? null : <Icon className="size-3.5" aria-hidden />}
      <span>{flat ? "About the same" : `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`}</span>
      <span className="text-ink-faint">vs {prevLabel}</span>
    </p>
  );
}

function Outcomes({ a }: { a: Analytics }) {
  const { served, cancelled, noShow, arrivals } = a.kpis;
  const total = served + cancelled + noShow;
  const parts = [
    { label: "Served", n: served, color: "var(--series-1)" },
    { label: "Cancelled before being called", n: cancelled, color: "var(--series-2)" },
    { label: "Called but didn't come", n: noShow, color: "var(--series-muted)" },
  ];
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-semibold">What happened to each token</h2>
      <p className="text-sm text-ink-faint">
        {arrivals.toLocaleString("en-IN")} joined; {(arrivals - total).toLocaleString("en-IN")} still in line or at a counter
      </p>
      {total ? (
        <>
          <div
            className="mt-6 flex h-5 gap-0.5 overflow-hidden rounded"
            role="img"
            aria-label={parts.map((p) => `${p.label} ${p.n}`).join(", ")}
          >
            {parts.map((p) =>
              p.n ? <div key={p.label} style={{ width: `${(p.n / total) * 100}%`, background: p.color }} /> : null,
            )}
          </div>
          <ul className="mt-5 divide-y divide-line text-sm">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
                <span className="flex-1 text-ink-soft">{p.label}</span>
                <span className="tabular font-medium">{p.n.toLocaleString("en-IN")}</span>
                <span className="tabular w-12 text-right text-ink-faint">{pct(p.n / total)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-6 text-sm text-ink-soft">No finished tokens in this period yet.</p>
      )}
    </section>
  );
}

function PerQueue({ a }: { a: Analytics }) {
  const rows = a.perQueue;
  const worst = Math.max(...rows.map((r) => r.avgWaitSec ?? 0));
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <h2 className="px-5 pt-5 font-semibold">By queue</h2>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full text-sm">
          <thead className="whitespace-nowrap text-left text-ink-faint">
            <tr className="border-b border-line">
              <th className="px-5 py-2 font-normal">Queue</th>
              <th className="px-3 py-2 text-right font-normal">Counters</th>
              <th className="px-3 py-2 text-right font-normal">Joined</th>
              <th className="px-3 py-2 text-right font-normal">Served</th>
              <th className="px-3 py-2 font-normal">Average wait</th>
              <th className="px-3 py-2 text-right font-normal">9 in 10 within</th>
              <th className="px-3 py-2 text-right font-normal">Time at counter</th>
              <th className="px-5 py-2 text-right font-normal">Cancelled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-3 font-medium">
                  <Link href={`/dashboard?range=${a.range}&queue=${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="tabular px-3 py-3 text-right">{r.counters}</td>
                <td className="tabular px-3 py-3 text-right">{r.arrivals.toLocaleString("en-IN")}</td>
                <td className="tabular px-3 py-3 text-right">{r.served.toLocaleString("en-IN")}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span className="tabular w-14 shrink-0">{formatDuration(r.avgWaitSec)}</span>
                    <span className="h-1.5 min-w-16 flex-1 rounded-full bg-sunken">
                      <span
                        className="block h-full rounded-full bg-series-1"
                        style={{ width: `${worst ? ((r.avgWaitSec ?? 0) / worst) * 100 : 0}%` }}
                      />
                    </span>
                  </div>
                </td>
                <td className="tabular px-3 py-3 text-right">{formatDuration(r.p90WaitSec)}</td>
                <td className="tabular px-3 py-3 text-right">{formatDuration(r.avgServiceSec)}</td>
                <td className="tabular px-5 py-3 text-right">{pct(r.cancelRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-6" aria-busy aria-label="Loading dashboard">
      <div className="h-28 rounded-2xl bg-sunken" />
      <div className="h-48 rounded-2xl bg-sunken" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-72 rounded-2xl bg-sunken lg:col-span-2" />
        <div className="h-64 rounded-2xl bg-sunken" />
        <div className="h-64 rounded-2xl bg-sunken" />
      </div>
    </div>
  );
}
