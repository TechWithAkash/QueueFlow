import "server-only";
import { Types } from "mongoose";
import { toObjectId } from "./api";
import { Queue, Token, type QueueDoc, type TokenDoc } from "./models";
import {
  computeHeatmap,
  computeKpis,
  computeTrend,
  computeWaitDistribution,
  rangeBounds,
  type Kpis,
  type RangeKey,
  type StatToken,
} from "./stats";
import { APP_TIMEZONE, startOfDay } from "./time";

export type Analytics = {
  range: RangeKey;
  from: string;
  to: string;
  bucketMs: number;
  timezone: string;
  queues: { id: string; name: string; prefix: string }[];
  kpis: Kpis & { waitingNow: number; servingNow: number };
  previous: Kpis;
  trend: ReturnType<typeof computeTrend>;
  heatmap: ReturnType<typeof computeHeatmap>;
  waitDistribution: ReturnType<typeof computeWaitDistribution>;
  perQueue: (Kpis & { id: string; name: string; prefix: string; counters: number; waitingNow: number })[];
};

/** Approximate opening hours in a range (for "served per hour"): hours where anything arrived. */
function activeHours(tokens: StatToken[], from: Date, to: Date) {
  const hours = new Set<number>();
  for (const t of tokens) if (t.createdAt >= from && t.createdAt <= to) hours.add(Math.floor(t.createdAt.getTime() / 3_600_000));
  return hours.size || undefined;
}

export async function getAnalytics(ownerId: string, range: RangeKey, queueId?: string | null): Promise<Analytics> {
  const owner = toObjectId(ownerId);
  const now = new Date();
  const { from, to, bucketMs } = rangeBounds(range, now, startOfDay(now));
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);

  const queues = await Queue.find({ owner }).sort({ createdAt: 1 }).lean<QueueDoc[]>();
  const queueFilter = queueId ? { queue: toObjectId(queueId, "Queue") } : {};
  // A token is relevant if it was alive at any point in [prevFrom, to].
  const rows = await Token.find({
    owner,
    ...queueFilter,
    createdAt: { $lte: to },
    $or: [
      { createdAt: { $gte: new Date(prevFrom.getTime() - 86_400_000) } },
      { status: { $in: ["waiting", "serving"] } },
    ],
  })
    .select({ queue: 1, status: 1, priority: 1, createdAt: 1, calledAt: 1, completedAt: 1, cancelledAt: 1 })
    .lean<TokenDoc[]>();
  const tokens: StatToken[] = rows.map((r) => ({
    queue: String(r.queue),
    status: r.status,
    priority: r.priority,
    createdAt: r.createdAt,
    calledAt: r.calledAt,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
  }));

  const live = (list: StatToken[]) => ({
    waitingNow: list.filter((t) => t.status === "waiting").length,
    servingNow: list.filter((t) => t.status === "serving").length,
  });

  const visibleQueues = queueId ? queues.filter((q) => String(q._id) === queueId) : queues;
  return {
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    bucketMs,
    timezone: APP_TIMEZONE,
    queues: queues.map((q) => ({ id: String(q._id), name: q.name, prefix: q.prefix })),
    kpis: { ...computeKpis(tokens, from, to, activeHours(tokens, from, to)), ...live(tokens) },
    previous: computeKpis(tokens, prevFrom, from, activeHours(tokens, prevFrom, from)),
    trend: computeTrend(tokens, from, to, bucketMs),
    heatmap: computeHeatmap(tokens, from, to, APP_TIMEZONE),
    waitDistribution: computeWaitDistribution(tokens, from, to),
    perQueue: visibleQueues.map((q) => {
      const mine = tokens.filter((t) => t.queue === String(q._id));
      return {
        id: String(q._id),
        name: q.name,
        prefix: q.prefix,
        counters: q.counters,
        ...computeKpis(mine, from, to, activeHours(mine, from, to)),
        waitingNow: live(mine).waitingNow,
      };
    }),
  };
}

/** Raw token rows for CSV export. */
export async function exportTokens(ownerId: string, range: RangeKey, queueId?: string | null) {
  const owner = toObjectId(ownerId);
  const now = new Date();
  const { from, to } = rangeBounds(range, now, startOfDay(now));
  const queues = await Queue.find({ owner }).lean<QueueDoc[]>();
  const names = new Map(queues.map((q) => [String(q._id), q.name]));
  const rows = await Token.find({
    owner,
    ...(queueId ? { queue: new Types.ObjectId(toObjectId(queueId, "Queue")) } : {}),
    createdAt: { $gte: from, $lte: to },
  })
    .sort({ createdAt: 1 })
    .lean<TokenDoc[]>();
  return rows.map((r) => ({
    queue: names.get(String(r.queue)) ?? "",
    token: r.code,
    name: r.name,
    priority: r.priority ? "yes" : "no",
    status: r.status,
    counter: r.counter ?? "",
    joined_at: r.createdAt.toISOString(),
    called_at: r.calledAt?.toISOString() ?? "",
    finished_at: (r.completedAt ?? r.cancelledAt)?.toISOString() ?? "",
    wait_minutes: r.calledAt ? ((r.calledAt.getTime() - r.createdAt.getTime()) / 60000).toFixed(1) : "",
    service_minutes:
      r.calledAt && r.completedAt ? ((r.completedAt.getTime() - r.calledAt.getTime()) / 60000).toFixed(1) : "",
  }));
}
