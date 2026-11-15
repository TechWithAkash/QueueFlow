import "server-only";
import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { Analytics } from "./analytics-service";

const counters = (n: number) => `${n} counter${n === 1 ? "" : "s"}`;

export const InsightSchema = z.object({
  headline: z.string().describe("One-sentence overall summary of queue health, max 140 chars"),
  insights: z
    .array(
      z.object({
        title: z.string().describe("Short title, max 60 chars"),
        detail: z.string().describe("1-2 sentences with specific numbers from the data"),
        recommendation: z.string().describe("One concrete, actionable step for the manager"),
        severity: z.enum(["info", "warning", "critical", "positive"]),
      }),
    )
    .describe("3 to 5 insights, most important first"),
});
export type Insights = z.infer<typeof InsightSchema> & { source: "ai" | "rules"; model?: string };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const mins = (s: number | null | undefined) => (s == null ? "n/a" : `${Math.round(s / 60)} min`);
const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${Math.round(x * 100)}%`);
const change = (now: number | null, prev: number | null) =>
  now == null || prev == null || prev === 0 ? null : (now - prev) / prev;

function peak(a: Analytics) {
  let best = { day: 0, hour: 0, v: -1 };
  a.heatmap.arrivals.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { day: d, hour: h, v })));
  return best;
}

/** Compact, model-friendly digest of the analytics (keeps the prompt small). */
export function digest(a: Analytics) {
  const p = peak(a);
  return {
    range: a.range,
    timezone: a.timezone,
    overall: a.kpis,
    previousPeriod: a.previous,
    busiestSlot: { day: DAYS[p.day], hour: `${p.hour}:00`, avgArrivalsPerHour: p.v },
    waitDistribution: a.waitDistribution,
    queues: a.perQueue.map((q) => ({
      name: q.name,
      counters: q.counters,
      arrivals: q.arrivals,
      served: q.served,
      avgWait: mins(q.avgWaitSec),
      p90Wait: mins(q.p90WaitSec),
      avgService: mins(q.avgServiceSec),
      cancelRate: pct(q.cancelRate),
      servedPerHour: q.servedPerHour,
      waitingNow: q.waitingNow,
    })),
  };
}

/** Deterministic insights — used when no API key is configured or the AI call fails. */
export function ruleBasedInsights(a: Analytics): Insights {
  const out: Insights["insights"] = [];
  const k = a.kpis;
  const p = peak(a);

  const worst = [...a.perQueue].filter((q) => q.p90WaitSec != null).sort((x, y) => y.p90WaitSec! - x.p90WaitSec!)[0];
  if (worst && worst.p90WaitSec! > 30 * 60) {
    const extra = Math.max(1, Math.round(worst.counters * 0.5));
    out.push({
      title: `${worst.name} is the bottleneck`,
      detail: `1 in 10 people waits more than ${mins(worst.p90WaitSec)} at ${worst.name} (average ${mins(worst.avgWaitSec)}) with ${counters(worst.counters)}.`,
      recommendation: `Open ${extra} more counter${extra > 1 ? "s" : ""} for ${worst.name} during peak hours.`,
      severity: worst.p90WaitSec! > 45 * 60 ? "critical" : "warning",
    });
  }
  if (p.v > 0) {
    out.push({
      title: `Peak demand: ${DAYS[p.day]} ${p.hour}:00–${p.hour + 1}:00`,
      detail: `About ${p.v} people arrive per hour in this slot — the busiest time in the selected period.`,
      recommendation: "Schedule full staffing and avoid breaks during this window.",
      severity: "info",
    });
  }
  if (k.cancelRate != null && k.cancelRate > 0.08) {
    out.push({
      title: "People are leaving before being served",
      detail: `${pct(k.cancelRate)} of tokens were cancelled (${k.cancelled} in this period), which usually tracks long waits.`,
      recommendation: "Share the live tracking link (QR) so people can wait elsewhere instead of giving up.",
      severity: k.cancelRate > 0.15 ? "critical" : "warning",
    });
  }
  const dWait = change(k.avgWaitSec, a.previous.avgWaitSec);
  if (dWait != null && Math.abs(dWait) > 0.1) {
    out.push({
      title: dWait > 0 ? "Wait times are rising" : "Wait times improved",
      detail: `Average wait is ${mins(k.avgWaitSec)}, ${dWait > 0 ? "up" : "down"} ${pct(Math.abs(dWait))} from the previous period (${mins(a.previous.avgWaitSec)}).`,
      recommendation: dWait > 0 ? "Check whether service times grew or demand increased, and rebalance counters." : "Keep the current staffing pattern.",
      severity: dWait > 0 ? "warning" : "positive",
    });
  }
  const best = [...a.perQueue].filter((q) => q.avgWaitSec != null).sort((x, y) => x.avgWaitSec! - y.avgWaitSec!)[0];
  if (best && worst && best.id !== worst.id && best.avgWaitSec! < 10 * 60) {
    out.push({
      title: `${best.name} has spare capacity`,
      detail: `Average wait at ${best.name} is only ${mins(best.avgWaitSec)} with ${counters(best.counters)}.`,
      recommendation: `During peaks, move a staff member from ${best.name} to ${worst.name}.`,
      severity: "positive",
    });
  }
  if (!out.length) {
    out.push({
      title: "Not enough data yet",
      detail: "Serve a few more tokens to unlock trends and staffing suggestions.",
      recommendation: "Try the 7-day or 30-day range for more history.",
      severity: "info",
    });
  }
  return {
    source: "rules",
    headline: `Average wait ${mins(k.avgWaitSec)}, ${k.served.toLocaleString("en-IN")} served, ${pct(k.cancelRate)} cancelled in this period.`,
    insights: out.slice(0, 5),
  };
}

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

const SYSTEM = `You are an operations analyst for clinics and service counters that use a token queue system.
You receive aggregated queue analytics as JSON (times in seconds unless labelled). Write insights a busy front-desk manager can act on today:
- Ground every claim in the numbers provided; cite specific figures (minutes, %, counts, queue names, days/hours).
- Prioritise: long waits (p90), under-staffed queues, cancellations/no-shows, peak hours, trends vs the previous period, spare capacity.
- Recommendations must be concrete (e.g. "open a 2nd Lab counter Mon 10:00-12:00"), not generic advice.
- Use "positive" severity for things going well. Do not invent data that isn't present.`;

export async function aiInsights(a: Analytics): Promise<Insights> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return ruleBasedInsights(a);
  try {
    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: `Queue analytics:\n${JSON.stringify(digest(a))}`,
      config: {
        systemInstruction: SYSTEM,
        // Structured output: Gemini must reply with JSON matching our Zod schema.
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(InsightSchema),
        abortSignal: AbortSignal.timeout(45_000),
      },
    });
    // Validate anyway: never trust model output to match the schema.
    const parsed = InsightSchema.safeParse(JSON.parse(res.text ?? ""));
    if (!parsed.success) return ruleBasedInsights(a);
    return { ...parsed.data, insights: parsed.data.insights.slice(0, 5), source: "ai", model: res.modelVersion ?? MODEL };
  } catch (err) {
    if (err instanceof ApiError) console.warn(`[insights] Gemini API error ${err.status}: ${err.message}`);
    else console.warn("[insights] falling back to rules:", (err as Error).message);
    return ruleBasedInsights(a);
  }
}
