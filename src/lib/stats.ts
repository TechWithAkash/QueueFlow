/**
 * Pure analytics functions (no DB access) — easy to unit test.
 */
import { zonedParts } from "./time";

export type StatToken = {
  queue: string;
  status: "waiting" | "serving" | "served" | "cancelled" | "no_show";
  priority?: boolean;
  createdAt: Date;
  calledAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
};

export type RangeKey = "today" | "7d" | "30d";

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null) => (x == null ? null : Math.round(x));
const inRange = (d: Date | null | undefined, from: Date, to: Date): d is Date => !!d && d >= from && d <= to;
const sec = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 1000;

export type Kpis = {
  arrivals: number;
  served: number;
  cancelled: number;
  noShow: number;
  avgWaitSec: number | null;
  medianWaitSec: number | null;
  p90WaitSec: number | null;
  maxWaitSec: number | null;
  avgServiceSec: number | null;
  cancelRate: number | null;
  servedPerHour: number | null;
};

export function computeKpis(tokens: StatToken[], from: Date, to: Date, openHours?: number): Kpis {
  const waits = tokens
    .filter((t) => inRange(t.calledAt, from, to))
    .map((t) => sec(t.createdAt, t.calledAt!))
    .sort((a, b) => a - b);
  const services = tokens
    .filter((t) => t.status === "served" && inRange(t.completedAt, from, to) && t.calledAt)
    .map((t) => sec(t.calledAt!, t.completedAt!));
  const arrivals = tokens.filter((t) => inRange(t.createdAt, from, to)).length;
  const served = services.length;
  const cancelled = tokens.filter((t) => t.status === "cancelled" && inRange(t.cancelledAt, from, to)).length;
  const noShow = tokens.filter((t) => t.status === "no_show" && inRange(t.completedAt, from, to)).length;
  const finished = served + cancelled + noShow;
  return {
    arrivals,
    served,
    cancelled,
    noShow,
    avgWaitSec: round(mean(waits)),
    medianWaitSec: round(percentile(waits, 0.5)),
    p90WaitSec: round(percentile(waits, 0.9)),
    maxWaitSec: waits.length ? Math.round(waits[waits.length - 1]) : null,
    avgServiceSec: round(mean(services)),
    cancelRate: finished ? cancelled / finished : null,
    servedPerHour: openHours ? Math.round((served / openHours) * 10) / 10 : null,
  };
}

export type TrendPoint = {
  t: string;
  avgLength: number;
  peakLength: number;
  arrivals: number;
  served: number;
  cancelled: number;
  avgWaitSec: number | null;
};

/**
 * Queue length over time via a sweep line: +1 when a token joins, -1 when it
 * leaves the waiting list (called or cancelled). For each bucket we report the
 * time-weighted average length and the peak.
 */
export function computeTrend(tokens: StatToken[], from: Date, to: Date, bucketMs: number): TrendPoint[] {
  const deltas: { at: number; d: number }[] = [];
  for (const t of tokens) {
    deltas.push({ at: t.createdAt.getTime(), d: 1 });
    const left = t.calledAt ?? t.cancelledAt;
    if (left) deltas.push({ at: left.getTime(), d: -1 });
  }
  // Leaves before joins at the same instant so length never overshoots.
  deltas.sort((a, b) => a.at - b.at || a.d - b.d);

  const points: TrendPoint[] = [];
  let i = 0;
  let len = 0;
  while (i < deltas.length && deltas[i].at < from.getTime()) len += deltas[i++].d;

  for (let start = from.getTime(); start < to.getTime(); start += bucketMs) {
    const end = Math.min(start + bucketMs, to.getTime());
    let area = 0;
    let peak = len;
    let cursor = start;
    while (i < deltas.length && deltas[i].at < end) {
      area += len * (deltas[i].at - cursor);
      cursor = deltas[i].at;
      len += deltas[i++].d;
      peak = Math.max(peak, len);
    }
    area += len * (end - cursor);
    const s = new Date(start);
    const e = new Date(end);
    const waits = tokens.filter((t) => t.calledAt && t.calledAt >= s && t.calledAt < e).map((t) => sec(t.createdAt, t.calledAt!));
    points.push({
      t: s.toISOString(),
      avgLength: Math.round((area / Math.max(1, end - start)) * 10) / 10,
      peakLength: peak,
      arrivals: tokens.filter((t) => t.createdAt >= s && t.createdAt < e).length,
      served: tokens.filter((t) => t.status === "served" && t.completedAt && t.completedAt >= s && t.completedAt < e).length,
      cancelled: tokens.filter((t) => t.status === "cancelled" && t.cancelledAt && t.cancelledAt >= s && t.cancelledAt < e).length,
      avgWaitSec: round(mean(waits)),
    });
  }
  return points;
}

/** Average arrivals per weekday × hour (in the given timezone). heat[weekday][hour], weekday 0 = Sunday. */
export function computeHeatmap(tokens: StatToken[], from: Date, to: Date, tz: string) {
  const counts = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  const waitSums = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  const waitNs = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  for (const t of tokens) {
    if (!inRange(t.createdAt, from, to)) continue;
    const p = zonedParts(t.createdAt, tz);
    counts[p.weekday][p.hour]++;
    if (t.calledAt) {
      waitSums[p.weekday][p.hour] += sec(t.createdAt, t.calledAt);
      waitNs[p.weekday][p.hour]++;
    }
  }
  // How many of each weekday the range covers (to turn totals into per-day averages).
  const days = Array(7).fill(0) as number[];
  const seen = new Set<string>();
  for (let d = from.getTime(); d <= to.getTime(); d += 3_600_000) {
    const p = zonedParts(new Date(d), tz);
    const key = `${p.year}-${p.month}-${p.day}`;
    if (!seen.has(key)) {
      seen.add(key);
      days[p.weekday]++;
    }
  }
  return {
    arrivals: counts.map((row, wd) => row.map((c) => (days[wd] ? Math.round((c / days[wd]) * 10) / 10 : 0))),
    avgWaitSec: waitSums.map((row, wd) => row.map((s, h) => (waitNs[wd][h] ? Math.round(s / waitNs[wd][h]) : null))),
  };
}

export const WAIT_BUCKETS = [
  { label: "< 5m", max: 5 },
  { label: "5–10m", max: 10 },
  { label: "10–20m", max: 20 },
  { label: "20–30m", max: 30 },
  { label: "30–45m", max: 45 },
  { label: "45–60m", max: 60 },
  { label: "60m+", max: Infinity },
];

export function computeWaitDistribution(tokens: StatToken[], from: Date, to: Date) {
  const counts = WAIT_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const t of tokens) {
    if (!inRange(t.calledAt, from, to)) continue;
    const m = sec(t.createdAt, t.calledAt) / 60;
    counts[WAIT_BUCKETS.findIndex((b) => m < b.max)].count++;
  }
  return counts;
}

export function rangeBounds(range: RangeKey, now: Date, todayStart: Date) {
  const day = 86_400_000;
  switch (range) {
    case "today":
      return { from: todayStart, to: now, bucketMs: 3_600_000 / 2 };
    case "7d":
      return { from: new Date(todayStart.getTime() - 6 * day), to: now, bucketMs: 3 * 3_600_000 };
    case "30d":
      return { from: new Date(todayStart.getTime() - 29 * day), to: now, bucketMs: day };
  }
}
