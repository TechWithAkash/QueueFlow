import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { hashPassword } from "./auth";
import { Queue, QueueEvent, Token, User, type QueueDoc, type UserDoc } from "./models";
import { STEP } from "./ordering";
import { formatCode } from "./queue-service";
import { APP_TIMEZONE, dayKey, startOfDay } from "./time";

export const DEMO_EMAIL = "demo@queueflow.app";

/**
 * Demo data is produced by a small discrete-event simulation rather than random
 * numbers: patients arrive following an hourly/weekday demand curve, are served
 * FIFO by N counters with variable service times, and some give up (cancel)
 * when the wait exceeds their patience. That makes the analytics show realistic
 * patterns — lunchtime peaks, busy Mondays, an under-staffed lab.
 */
type Profile = { name: string; prefix: string; counters: number; perHour: number; serviceMin: number };

const PROFILES: Profile[] = [
  { name: "General OPD", prefix: "A", counters: 3, perHour: 12.5, serviceMin: 12 },
  { name: "Pharmacy", prefix: "P", counters: 2, perHour: 11, serviceMin: 6.5 },
  { name: "Lab & Diagnostics", prefix: "L", counters: 1, perHour: 5.2, serviceMin: 10 },
];

const HOURLY: Record<number, number> = { 9: 0.7, 10: 1.35, 11: 1.6, 12: 1.3, 13: 0.65, 14: 0.75, 15: 0.9, 16: 1.0, 17: 1.35, 18: 1.05 };
const WEEKDAY = [0, 1.3, 1.05, 1.0, 1.0, 1.1, 0.75]; // Sun closed, Mon busiest

const FIRST = ["Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Arjun", "Kavya", "Rahul", "Meera", "Karthik", "Divya", "Aditya", "Lakshmi", "Sanjay", "Pooja", "Nikhil", "Asha", "Imran", "Fatima", "Joseph", "Mary", "Suresh", "Deepa", "Harish", "Nandini", "Varun", "Shreya", "Ganesh", "Ritu"];
const LAST = ["Sharma", "Iyer", "Reddy", "Nair", "Patel", "Rao", "Menon", "Gupta", "Kumar", "Singh", "Das", "Pillai", "Khan", "Joshi", "Hegde", "Shetty"];

// Deterministic PRNG so the demo looks the same on every machine.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, r: () => number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

/** Log-normal-ish service time with the given mean (minutes). */
function serviceMs(meanMin: number, r: () => number) {
  const z = Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
  return Math.max(1.2, meanMin * Math.exp(0.38 * z - 0.07)) * 60_000;
}

type SimToken = {
  createdAt: Date;
  calledAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
  status: "waiting" | "serving" | "served" | "cancelled" | "no_show";
  counter?: number;
  priority: boolean;
  name: string;
  phone?: string;
};

function simulateQueue(p: Profile, days: number, now: Date, r: () => number): SimToken[] {
  const out: SimToken[] = [];
  const today = startOfDay(now, APP_TIMEZONE);
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = new Date(today.getTime() - d * 86_400_000);
    const weekday = new Date(dayStart.getTime() + 12 * 3_600_000).getUTCDay();
    const dayFactor = WEEKDAY[weekday] * (0.92 + r() * 0.16);
    if (dayFactor === 0) continue;

    const arrivals: Date[] = [];
    for (const [h, f] of Object.entries(HOURLY)) {
      const n = poisson(p.perHour * f * dayFactor, r);
      for (let i = 0; i < n; i++) {
        arrivals.push(new Date(dayStart.getTime() + (Number(h) + r()) * 3_600_000));
      }
    }
    arrivals.sort((a, b) => a.getTime() - b.getTime());

    const freeAt = Array.from({ length: p.counters }, () => dayStart.getTime() + 9 * 3_600_000);
    for (const at of arrivals) {
      if (at > now) break;
      const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      const t: SimToken = {
        createdAt: at,
        status: "waiting",
        priority: r() < 0.07,
        name,
        phone: r() < 0.6 ? `+91 9${Math.floor(100000000 + r() * 899999999)}` : undefined,
      };
      const c = freeAt.indexOf(Math.min(...freeAt));
      const start = Math.max(at.getTime(), freeAt[c]);
      const patienceMs = (25 + r() * 50) * 60_000;
      const waitMs = start - at.getTime();
      if ((waitMs > patienceMs && r() < 0.65) || r() < 0.025) {
        const cancelAt = at.getTime() + Math.min(waitMs, patienceMs) * (0.4 + r() * 0.6);
        if (cancelAt <= now.getTime()) {
          t.status = "cancelled";
          t.cancelledAt = new Date(cancelAt);
        }
        out.push(t);
        continue;
      }
      if (start > now.getTime()) {
        out.push(t); // still waiting
        continue;
      }
      const noShow = r() < 0.03;
      const end = start + (noShow ? 90_000 : serviceMs(p.serviceMin, r));
      freeAt[c] = end;
      t.calledAt = new Date(start);
      t.counter = c + 1;
      if (end > now.getTime()) {
        t.status = "serving";
      } else {
        t.status = noShow ? "no_show" : "served";
        t.completedAt = new Date(end);
      }
      out.push(t);
    }
  }
  return out;
}

/** Ensures the queue looks "alive" when a reviewer opens it, even outside opening hours. */
function topUpLive(p: Profile, tokens: SimToken[], now: Date, r: () => number) {
  const waiting = tokens.filter((t) => t.status === "waiting").length;
  const want = Math.max(0, Math.round(p.perHour * 0.7) - waiting);
  for (let i = 0; i < want; i++) {
    tokens.push({
      createdAt: new Date(now.getTime() - (want - i) * (2 + r() * 3) * 60_000),
      status: "waiting",
      priority: i === 2,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
    });
  }
  for (let c = 1; c <= p.counters; c++) {
    if (tokens.some((t) => t.status === "serving" && t.counter === c)) continue;
    tokens.push({
      createdAt: new Date(now.getTime() - (14 + r() * 10) * 60_000),
      calledAt: new Date(now.getTime() - (1 + r() * 4) * 60_000),
      status: "serving",
      counter: c,
      priority: false,
      name: `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`,
    });
  }
  tokens.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export async function seedDemoData(ownerId: Types.ObjectId, now = new Date()) {
  const r = rng(20261115);
  const today = startOfDay(now, APP_TIMEZONE);
  for (const p of PROFILES) {
    const sim = simulateQueue(p, 30, now, r);
    topUpLive(p, sim, now, r);
    const queue = await Queue.create({
      owner: ownerId,
      name: p.name,
      prefix: p.prefix,
      counters: p.counters,
      nextNumber: 1, // set below once today's numbers are known
      numberDay: "",
      createdAt: new Date(today.getTime() - 30 * 86_400_000),
    });
    // Waiting tokens keep arrival order, except priority ones go first.
    const waitingOrder = sim
      .filter((t) => t.status === "waiting")
      .sort((a, b) => Number(b.priority) - Number(a.priority) || a.createdAt.getTime() - b.createdAt.getTime());
    // Numbers restart every day, like the real token roll.
    const perDay = new Map<string, number>();
    const numbers = sim.map((t) => {
      const k = dayKey(t.createdAt);
      const n = (perDay.get(k) ?? 0) + 1;
      perDay.set(k, n);
      return n;
    });
    const todayKey = dayKey(now);
    await Queue.updateOne(
      { _id: queue._id },
      { $set: { nextNumber: (perDay.get(todayKey) ?? 0) + 1, numberDay: todayKey } },
    );
    const docs = sim.map((t, i) => ({
      _id: new Types.ObjectId(),
      queue: queue._id,
      owner: ownerId,
      number: numbers[i],
      code: formatCode(p.prefix, numbers[i]),
      name: t.name,
      phone: t.phone,
      priority: t.priority,
      status: t.status,
      position: t.status === "waiting" ? (waitingOrder.indexOf(t) + 1) * STEP : (i + 1) * STEP,
      counter: t.counter,
      publicKey: randomBytes(9).toString("base64url"),
      createdAt: t.createdAt,
      calledAt: t.calledAt,
      completedAt: t.completedAt,
      cancelledAt: t.cancelledAt,
      updatedAt: t.completedAt ?? t.cancelledAt ?? t.calledAt ?? t.createdAt,
    }));
    // timestamps:false keeps our historical updatedAt (used to sort "recently finished").
    await Token.insertMany(docs, { ordered: false, timestamps: false } as never);

    // Activity log for today, so the feed isn't empty.
    const events = docs
      .filter((d) => d.createdAt >= today)
      .flatMap((d) => {
        const base = { owner: ownerId, queue: queue._id, token: d._id, code: d.code };
        const ev = [{ ...base, type: "created", at: d.createdAt }];
        if (d.calledAt) ev.push({ ...base, type: "called", at: d.calledAt, counter: d.counter } as never);
        if (d.completedAt) ev.push({ ...base, type: d.status === "no_show" ? "no_show" : "served", at: d.completedAt, counter: d.counter } as never);
        if (d.cancelledAt) ev.push({ ...base, type: "cancelled", at: d.cancelledAt });
        return ev;
      });
    if (events.length) await QueueEvent.insertMany(events, { ordered: false });
  }
}

export async function clearUserData(ownerId: Types.ObjectId) {
  await Promise.all([
    Token.deleteMany({ owner: ownerId }),
    QueueEvent.deleteMany({ owner: ownerId }),
    Queue.deleteMany({ owner: ownerId }),
  ]);
}

let inflight: Promise<UserDoc> | null = null;

/**
 * Returns the shared demo user. (Re)seeds when it has no queues or the data is
 * stale (nobody used it for 2+ days), so the dashboard always shows recent history.
 */
export function ensureDemoAccount(): Promise<UserDoc> {
  inflight ??= (async () => {
    let user = await User.findOne({ email: DEMO_EMAIL }).lean<UserDoc>();
    if (!user) {
      const created = await User.create({
        name: "Demo Manager",
        email: DEMO_EMAIL,
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        isDemo: true,
      });
      user = created.toObject() as UserDoc;
    }
    const hasQueue = await Queue.exists({ owner: user._id });
    const recent = await Token.exists({ owner: user._id, createdAt: { $gte: new Date(Date.now() - 2 * 86_400_000) } });
    if (!hasQueue || !recent) {
      await clearUserData(user._id);
      await seedDemoData(user._id);
    }
    return user;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function resetDemo(ownerId: string) {
  const id = new Types.ObjectId(ownerId);
  await clearUserData(id);
  await seedDemoData(id);
}

export type { QueueDoc };
