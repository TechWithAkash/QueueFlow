import { describe, expect, it } from "vitest";
import { computeKpis, computeTrend, computeWaitDistribution, percentile, type StatToken } from "@/lib/stats";

const T0 = new Date("2026-11-13T04:00:00Z"); // 09:30 in Kolkata
const at = (min: number) => new Date(T0.getTime() + min * 60_000);
const from = at(0);
const to = at(120);

function tok(p: Partial<StatToken> & { joined: number }): StatToken {
  const { joined, ...rest } = p;
  return { queue: "q", status: "waiting", createdAt: at(joined), ...rest };
}

describe("percentile", () => {
  it("returns null for no data", () => expect(percentile([], 0.5)).toBeNull());
  it("interpolates between ranks", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0.9)).toBeCloseTo(37);
  });
});

describe("computeKpis", () => {
  const tokens = [
    tok({ joined: 0, status: "served", calledAt: at(10), completedAt: at(15) }), // waited 10, served 5
    tok({ joined: 5, status: "served", calledAt: at(25), completedAt: at(35) }), // waited 20, served 10
    tok({ joined: 10, status: "no_show", calledAt: at(40), completedAt: at(42) }), // waited 30
    tok({ joined: 12, status: "cancelled", cancelledAt: at(20) }),
    tok({ joined: 50 }), // still waiting
  ];
  const k = computeKpis(tokens, from, to, 2);

  it("counts outcomes", () => {
    expect(k).toMatchObject({ arrivals: 5, served: 2, cancelled: 1, noShow: 1 });
  });
  it("measures wait as join → called, including no-shows", () => {
    expect(k.avgWaitSec).toBe(20 * 60);
    expect(k.medianWaitSec).toBe(20 * 60);
    expect(k.maxWaitSec).toBe(30 * 60);
  });
  it("measures service time only for served tokens", () => expect(k.avgServiceSec).toBe(7.5 * 60));
  it("computes cancel rate over finished tokens", () => expect(k.cancelRate).toBeCloseTo(1 / 4));
  it("computes throughput per open hour", () => expect(k.servedPerHour).toBe(1));
  it("returns nulls rather than zeros when there is no data", () => {
    const empty = computeKpis([], from, to);
    expect(empty.avgWaitSec).toBeNull();
    expect(empty.cancelRate).toBeNull();
  });
});

describe("computeTrend", () => {
  it("tracks queue length with a sweep line", () => {
    const tokens = [
      tok({ joined: 0, status: "serving", calledAt: at(30) }),
      tok({ joined: 0, status: "serving", calledAt: at(60) }),
      tok({ joined: 30, status: "cancelled", cancelledAt: at(45) }),
    ];
    const pts = computeTrend(tokens, from, at(90), 30 * 60_000);
    expect(pts.map((p) => p.peakLength)).toEqual([2, 2, 1]);
    // 0–30: 2 waiting all the time; 30–60: 1 (+1 for 15 min); 60–90: empty.
    expect(pts.map((p) => p.avgLength)).toEqual([2, 1.5, 0]);
    expect(pts.map((p) => p.arrivals)).toEqual([2, 1, 0]);
  });

  it("counts people already waiting before the range starts", () => {
    const pts = computeTrend([tok({ joined: -10, status: "serving", calledAt: at(10) })], from, at(30), 30 * 60_000);
    expect(pts[0].peakLength).toBe(1);
    expect(pts[0].arrivals).toBe(0);
  });
});

describe("computeWaitDistribution", () => {
  it("buckets waits by minutes", () => {
    const tokens = [
      tok({ joined: 0, status: "served", calledAt: at(2) }),
      tok({ joined: 0, status: "served", calledAt: at(7) }),
      tok({ joined: 0, status: "served", calledAt: at(90) }),
      tok({ joined: 0 }), // never called: not counted
    ];
    const d = computeWaitDistribution(tokens, from, to);
    expect(d.find((b) => b.label === "< 5m")?.count).toBe(1);
    expect(d.find((b) => b.label === "5–10m")?.count).toBe(1);
    expect(d.find((b) => b.label === "60m+")?.count).toBe(1);
    expect(d.reduce((a, b) => a + b.count, 0)).toBe(3);
  });
});
