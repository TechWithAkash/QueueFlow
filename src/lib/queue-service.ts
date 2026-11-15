import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { ApiError, notFound, toObjectId } from "./api";
import { Queue, QueueEvent, Token, type EventType, type QueueDoc, type TokenDoc } from "./models";
import { estimateWaitSec, evenPositions, insertionNeighbours, needsRebalance, positionBetween } from "./ordering";
import { publish } from "./realtime";
import { dayKey, startOfDay } from "./time";
import type {
  ActivityDTO,
  DisplaySnapshot,
  QueueListItem,
  QueueSnapshot,
  QueueSummary,
  TokenDTO,
  TrackerSnapshot,
} from "./types";

const DEFAULT_SERVICE_SEC = 5 * 60;

// ---------- mapping ----------

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : undefined);

function toQueueSummary(q: QueueDoc): QueueSummary {
  return { id: String(q._id), name: q.name, prefix: q.prefix, counters: q.counters, createdAt: iso(q.createdAt)! };
}

function toTokenDTO(t: TokenDoc, etaSec?: number): TokenDTO {
  return {
    id: String(t._id),
    code: t.code,
    number: t.number,
    name: t.name,
    phone: t.phone ?? undefined,
    note: t.note ?? undefined,
    priority: Boolean(t.priority),
    status: t.status,
    counter: t.counter ?? undefined,
    publicKey: t.publicKey,
    createdAt: iso(t.createdAt)!,
    calledAt: iso(t.calledAt),
    completedAt: iso(t.completedAt),
    cancelledAt: iso(t.cancelledAt),
    etaSec,
  };
}

export const formatCode = (prefix: string, n: number) => `${prefix}-${String(n).padStart(3, "0")}`;

// ---------- helpers ----------

async function ownedQueue(ownerId: string, queueId: string): Promise<QueueDoc> {
  const q = await Queue.findOne({ _id: toObjectId(queueId, "Queue"), owner: toObjectId(ownerId) }).lean<QueueDoc>();
  if (!q) throw notFound("Queue");
  return q;
}

async function ownedToken(ownerId: string, tokenId: string): Promise<TokenDoc> {
  const t = await Token.findOne({ _id: toObjectId(tokenId, "Token"), owner: toObjectId(ownerId) }).lean<TokenDoc>();
  if (!t) throw notFound("Token");
  return t;
}

async function logEvent(t: Pick<TokenDoc, "_id" | "owner" | "queue" | "code">, type: EventType, counter?: number) {
  await QueueEvent.create({ owner: t.owner, queue: t.queue, token: t._id, code: t.code, type, counter });
  publish(String(t.queue), type);
}

async function waitingList(queueId: Types.ObjectId) {
  return Token.find({ queue: queueId, status: "waiting" })
    .sort({ position: 1, number: 1 })
    .select({ _id: 1, position: 1, priority: 1 })
    .lean<{ _id: Types.ObjectId; position: number; priority: boolean }[]>();
}

/** Re-spaces every waiting token evenly (rarely needed; keeps midpoints precise). */
async function rebalance(queueId: Types.ObjectId) {
  const list = await waitingList(queueId);
  const pos = evenPositions(list.length);
  await Token.bulkWrite(
    list.map((t, i) => ({ updateOne: { filter: { _id: t._id }, update: { $set: { position: pos[i] } } } })),
  );
  return waitingList(queueId);
}

/** Typical service duration for a queue: median of the last 25 completed tokens. */
async function avgServiceSec(queueId: Types.ObjectId): Promise<number> {
  const recent = await Token.find({ queue: queueId, status: "served", calledAt: { $ne: null }, completedAt: { $ne: null } })
    .sort({ completedAt: -1 })
    .limit(25)
    .select({ calledAt: 1, completedAt: 1 })
    .lean<{ calledAt: Date; completedAt: Date }[]>();
  const durations = recent
    .map((t) => (t.completedAt.getTime() - t.calledAt.getTime()) / 1000)
    .filter((s) => s > 5 && s < 4 * 3600)
    .sort((a, b) => a - b);
  if (durations.length < 3) return DEFAULT_SERVICE_SEC;
  return Math.round(durations[Math.floor(durations.length / 2)]);
}

// ---------- queues ----------

export async function listQueues(ownerId: string): Promise<QueueListItem[]> {
  const owner = toObjectId(ownerId);
  const queues = await Queue.find({ owner }).sort({ createdAt: 1 }).lean<QueueDoc[]>();
  const since = startOfDay(new Date());
  const [live, today] = await Promise.all([
    Token.find({ owner, status: { $in: ["waiting", "serving"] } })
      .select({ queue: 1, status: 1, code: 1, counter: 1 })
      .lean<Pick<TokenDoc, "queue" | "status" | "code" | "counter">[]>(),
    Token.find({ owner, calledAt: { $gte: since } })
      .select({ queue: 1, status: 1, createdAt: 1, calledAt: 1 })
      .lean<Pick<TokenDoc, "queue" | "status" | "createdAt" | "calledAt">[]>(),
  ]);
  return queues.map((q) => {
    const id = String(q._id);
    const mine = live.filter((t) => String(t.queue) === id);
    const called = today.filter((t) => String(t.queue) === id);
    const served = called.filter((t) => t.status === "served").length;
    const waits = called.map((t) => (t.calledAt!.getTime() - t.createdAt.getTime()) / 1000);
    return {
      ...toQueueSummary(q),
      waiting: mine.filter((t) => t.status === "waiting").length,
      serving: mine.filter((t) => t.status === "serving").length,
      nowServing: mine
        .filter((t) => t.status === "serving")
        .sort((a, b) => (a.counter ?? 0) - (b.counter ?? 0))
        .map((t) => t.code),
      servedToday: served,
      avgWaitTodaySec: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
    };
  });
}

export async function createQueue(ownerId: string, input: { name: string; prefix: string; counters: number }) {
  const q = await Queue.create({ owner: toObjectId(ownerId), ...input });
  return toQueueSummary(q.toObject() as QueueDoc);
}

export async function updateQueue(
  ownerId: string,
  queueId: string,
  input: Partial<{ name: string; prefix: string; counters: number }>,
) {
  const q = await ownedQueue(ownerId, queueId);
  if (input.counters != null && input.counters < q.counters) {
    const busy = await Token.findOne({ queue: q._id, status: "serving", counter: { $gt: input.counters } }).lean<TokenDoc>();
    if (busy) {
      throw new ApiError(409, `Counter ${busy.counter} is still serving ${busy.code}. Complete it before removing the counter.`);
    }
  }
  const updated = await Queue.findByIdAndUpdate(q._id, { $set: input }, { returnDocument: "after", runValidators: true }).lean<QueueDoc>();
  publish(queueId, "updated");
  return toQueueSummary(updated!);
}

export async function deleteQueue(ownerId: string, queueId: string) {
  const q = await ownedQueue(ownerId, queueId);
  await Promise.all([Token.deleteMany({ queue: q._id }), QueueEvent.deleteMany({ queue: q._id })]);
  await Queue.deleteOne({ _id: q._id });
  publish(queueId, "deleted");
}

// ---------- snapshot ----------

export async function getSnapshot(ownerId: string, queueId: string): Promise<QueueSnapshot> {
  const q = await ownedQueue(ownerId, queueId);
  const since = startOfDay(new Date());
  const [waiting, serving, recent, events, todays, svc] = await Promise.all([
    Token.find({ queue: q._id, status: "waiting" }).sort({ position: 1, number: 1 }).lean<TokenDoc[]>(),
    Token.find({ queue: q._id, status: "serving" }).sort({ counter: 1 }).lean<TokenDoc[]>(),
    Token.find({ queue: q._id, status: { $in: ["served", "cancelled", "no_show"] } })
      .sort({ updatedAt: -1 })
      .limit(8)
      .lean<TokenDoc[]>(),
    QueueEvent.find({ queue: q._id }).sort({ at: -1 }).limit(12).lean(),
    Token.find({ queue: q._id, $or: [{ calledAt: { $gte: since } }, { cancelledAt: { $gte: since } }] })
      .select({ status: 1, createdAt: 1, calledAt: 1 })
      .lean<Pick<TokenDoc, "status" | "createdAt" | "calledAt">[]>(),
    avgServiceSec(q._id),
  ]);
  const waits = todays
    .filter((t) => t.calledAt)
    .map((t) => (t.calledAt!.getTime() - t.createdAt.getTime()) / 1000);
  return {
    queue: toQueueSummary(q),
    waiting: waiting.map((t, i) => toTokenDTO(t, estimateWaitSec(i, svc, q.counters))),
    serving: serving.map((t) => toTokenDTO(t)),
    recent: recent.map((t) => toTokenDTO(t)),
    activity: events.map(
      (e): ActivityDTO => ({
        id: String(e._id),
        type: e.type,
        code: e.code ?? undefined,
        counter: e.counter ?? undefined,
        at: iso(e.at)!,
      }),
    ),
    stats: {
      waiting: waiting.length,
      servedToday: todays.filter((t) => t.status === "served").length,
      cancelledToday: todays.filter((t) => t.status === "cancelled").length,
      avgWaitTodaySec: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      avgServiceSec: svc,
    },
  };
}

// ---------- tokens ----------

export async function addToken(
  ownerId: string,
  queueId: string,
  input: { name: string; phone?: string; note?: string; priority?: boolean },
): Promise<TokenDTO> {
  const owner = toObjectId(ownerId);
  // One atomic update both issues the number and restarts numbering on a new day,
  // so two simultaneous adds can never get the same code.
  const today = dayKey(new Date());
  const q = await Queue.findOneAndUpdate(
    { _id: toObjectId(queueId, "Queue"), owner },
    [
      {
        $set: {
          nextNumber: { $cond: [{ $eq: ["$numberDay", today] }, { $add: ["$nextNumber", 1] }, 2] },
          numberDay: today,
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true },
  ).lean<QueueDoc>();
  if (!q) throw notFound("Queue");
  const number = q.nextNumber - 1;

  let list = await waitingList(q._id);
  let { before, after } = insertionNeighbours(list, Boolean(input.priority));
  if (needsRebalance(before, after)) {
    list = await rebalance(q._id);
    ({ before, after } = insertionNeighbours(list, Boolean(input.priority)));
  }

  const token = await Token.create({
    queue: q._id,
    owner,
    number,
    code: formatCode(q.prefix, number),
    name: input.name,
    phone: input.phone || undefined,
    note: input.note || undefined,
    priority: Boolean(input.priority),
    status: "waiting",
    position: positionBetween(before, after),
    publicKey: randomBytes(9).toString("base64url"),
    createdAt: new Date(),
  });
  const doc = token.toObject() as TokenDoc;
  await logEvent(doc, "created");
  return toTokenDTO(doc);
}

export type MoveTarget = { direction: "up" | "down" } | { beforeId: string | null };

export async function moveToken(ownerId: string, tokenId: string, target: MoveTarget) {
  const token = await ownedToken(ownerId, tokenId);
  if (token.status !== "waiting") throw new ApiError(409, `${token.code} is no longer waiting`);

  const compute = (list: Awaited<ReturnType<typeof waitingList>>) => {
    const idx = list.findIndex((t) => t._id.equals(token._id));
    const others = list.filter((t) => !t._id.equals(token._id));
    let to: number;
    if ("direction" in target) {
      to = target.direction === "up" ? idx - 1 : idx + 1;
      if (to < 0 || to > others.length) return null; // already at the edge
    } else if (target.beforeId == null) {
      to = others.length;
    } else {
      to = others.findIndex((t) => String(t._id) === target.beforeId);
      if (to === -1) throw new ApiError(409, "The queue changed. Please try again.");
    }
    if (to === idx) return null;
    return { before: others[to - 1]?.position ?? null, after: others[to]?.position ?? null };
  };

  let slot = compute(await waitingList(token.queue));
  if (!slot) return; // nothing to do
  if (needsRebalance(slot.before, slot.after)) slot = compute(await rebalance(token.queue));
  if (!slot) return;

  const res = await Token.updateOne(
    { _id: token._id, status: "waiting" },
    { $set: { position: positionBetween(slot.before, slot.after) } },
  );
  if (res.matchedCount === 0) throw new ApiError(409, `${token.code} is no longer waiting`);
  await logEvent(token, "moved");
}

/**
 * Serve the next token at a counter. Whatever that counter was serving is
 * marked as served first. The "pick top + mark serving" step is one atomic
 * findOneAndUpdate, so two counters can never call the same token.
 */
export async function callNext(ownerId: string, queueId: string, counter: number): Promise<TokenDTO | null> {
  const q = await ownedQueue(ownerId, queueId);
  if (counter < 1 || counter > q.counters) throw new ApiError(400, `Counter ${counter} does not exist`);
  const now = new Date();

  const current = await Token.find({ queue: q._id, status: "serving", counter }).lean<TokenDoc[]>();
  for (const t of current) {
    const r = await Token.updateOne({ _id: t._id, status: "serving" }, { $set: { status: "served", completedAt: now } });
    if (r.modifiedCount) await logEvent(t, "served", counter);
  }

  const next = await Token.findOneAndUpdate(
    { queue: q._id, status: "waiting" },
    { $set: { status: "serving", calledAt: now, counter } },
    { sort: { position: 1, number: 1 }, returnDocument: "after" },
  ).lean<TokenDoc>();
  if (!next) return null;
  await logEvent(next, "called", counter);
  return toTokenDTO(next);
}

export type TokenAction = "complete" | "no_show" | "cancel" | "restore" | "recall";

const TRANSITIONS: Record<
  Exclude<TokenAction, "recall">,
  { from: TokenDoc["status"][]; set: (now: Date) => Record<string, unknown>; unset?: string[]; event: EventType }
> = {
  complete: { from: ["serving"], set: (now) => ({ status: "served", completedAt: now }), event: "served" },
  no_show: { from: ["serving"], set: (now) => ({ status: "no_show", completedAt: now }), event: "no_show" },
  cancel: { from: ["waiting"], set: (now) => ({ status: "cancelled", cancelledAt: now }), event: "cancelled" },
  // Restoring keeps the original position, so "Undo" puts the token back exactly where it was
  // and a late no-show goes to the front.
  restore: {
    from: ["cancelled", "no_show"],
    set: () => ({ status: "waiting" }),
    unset: ["cancelledAt", "completedAt", "calledAt", "counter"],
    event: "restored",
  },
};

const STATUS_LABEL: Record<TokenDoc["status"], string> = {
  waiting: "waiting",
  serving: "being served",
  served: "already served",
  cancelled: "cancelled",
  no_show: "marked as no-show",
};

export async function tokenAction(ownerId: string, tokenId: string, action: TokenAction) {
  const token = await ownedToken(ownerId, tokenId);
  if (action === "recall") {
    if (token.status !== "serving") throw new ApiError(409, `${token.code} is not being served`);
    await logEvent(token, "recalled", token.counter ?? undefined);
    return;
  }
  const tr = TRANSITIONS[action];
  const update: Record<string, unknown> = { $set: tr.set(new Date()) };
  if (tr.unset) update.$unset = Object.fromEntries(tr.unset.map((k) => [k, 1]));
  // Conditional update = optimistic concurrency guard against stale UIs.
  const res = await Token.updateOne({ _id: token._id, status: { $in: tr.from } }, update);
  if (res.matchedCount === 0) {
    const fresh = await Token.findById(token._id).select({ status: 1 }).lean<TokenDoc>();
    throw new ApiError(409, `${token.code} is ${STATUS_LABEL[fresh?.status ?? token.status]}`);
  }
  await logEvent(token, tr.event, token.counter ?? undefined);
}

// ---------- public views (no personal data) ----------

async function lastCall(queueId: Types.ObjectId) {
  const e = await QueueEvent.findOne({ queue: queueId, type: { $in: ["called", "recalled"] } })
    .sort({ at: -1 })
    .lean();
  return e ? { id: String(e._id), code: e.code ?? "", counter: e.counter ?? 1, at: iso(e.at)! } : null;
}

export async function getDisplay(queueId: string): Promise<DisplaySnapshot> {
  const q = await Queue.findById(toObjectId(queueId, "Queue")).lean<QueueDoc>();
  if (!q) throw notFound("Queue");
  const [serving, waiting, svc, call] = await Promise.all([
    Token.find({ queue: q._id, status: "serving" }).sort({ counter: 1 }).select({ code: 1, counter: 1 }).lean<TokenDoc[]>(),
    Token.find({ queue: q._id, status: "waiting" })
      .sort({ position: 1, number: 1 })
      .select({ code: 1, priority: 1 })
      .lean<TokenDoc[]>(),
    avgServiceSec(q._id),
    lastCall(q._id),
  ]);
  return {
    queue: { name: q.name, prefix: q.prefix, counters: q.counters },
    serving: serving.map((t) => ({ code: t.code, counter: t.counter ?? 1 })),
    upNext: waiting.slice(0, 8).map((t) => ({ code: t.code, priority: Boolean(t.priority) })),
    waiting: waiting.length,
    avgServiceSec: svc,
    lastCall: call,
  };
}

export async function getTracker(publicKey: string): Promise<TrackerSnapshot> {
  const t = await Token.findOne({ publicKey }).lean<TokenDoc>();
  if (!t) throw notFound("Token");
  const q = await Queue.findById(t.queue).lean<QueueDoc>();
  if (!q) throw notFound("Queue");
  const [waiting, serving, svc] = await Promise.all([
    Token.find({ queue: q._id, status: "waiting" }).sort({ position: 1, number: 1 }).select({ _id: 1 }).lean(),
    Token.find({ queue: q._id, status: "serving" }).sort({ counter: 1 }).select({ code: 1, counter: 1 }).lean<TokenDoc[]>(),
    avgServiceSec(q._id),
  ]);
  const ahead = t.status === "waiting" ? waiting.findIndex((w) => w._id.equals(t._id)) : 0;
  return {
    code: t.code,
    // First name only — this page is reachable by anyone with the link.
    name: t.name.split(/\s+/)[0] ?? "",
    status: t.status,
    queueName: q.name,
    queueId: String(q._id),
    ahead: Math.max(0, ahead),
    etaSec: t.status === "waiting" ? estimateWaitSec(Math.max(0, ahead), svc, q.counters) : null,
    counter: t.counter ?? undefined,
    nowServing: serving.map((s) => ({ code: s.code, counter: s.counter ?? 1 })),
    createdAt: iso(t.createdAt)!,
    calledAt: iso(t.calledAt),
  };
}
