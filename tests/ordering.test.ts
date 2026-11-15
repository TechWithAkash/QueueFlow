import { describe, expect, it } from "vitest";
import { estimateWaitSec, evenPositions, insertionNeighbours, needsRebalance, positionBetween, STEP } from "@/lib/ordering";

describe("positionBetween", () => {
  it("starts an empty list at STEP", () => expect(positionBetween(null, null)).toBe(STEP));
  it("goes before the head", () => expect(positionBetween(null, 1024)).toBe(0));
  it("goes after the tail", () => expect(positionBetween(2048, null)).toBe(2048 + STEP));
  it("takes the midpoint between neighbours", () => expect(positionBetween(1024, 2048)).toBe(1536));

  it("keeps order stable across many moves into the same gap", () => {
    let lo = 1024;
    const hi = 2048;
    for (let i = 0; i < 30; i++) {
      const p = positionBetween(lo, hi);
      expect(p).toBeGreaterThan(lo);
      expect(p).toBeLessThan(hi);
      lo = p;
    }
  });
});

describe("needsRebalance", () => {
  it("is false for normal gaps and open ends", () => {
    expect(needsRebalance(1, 2)).toBe(false);
    expect(needsRebalance(null, 2)).toBe(false);
    expect(needsRebalance(1, null)).toBe(false);
  });
  it("is true once neighbours are almost touching", () => expect(needsRebalance(1, 1 + 1e-9)).toBe(true));
  it("evenPositions spaces items STEP apart", () => expect(evenPositions(3)).toEqual([STEP, 2 * STEP, 3 * STEP]));
});

describe("insertionNeighbours", () => {
  const list = [
    { position: 100, priority: true },
    { position: 200, priority: true },
    { position: 300, priority: false },
    { position: 400, priority: false },
  ];

  it("puts a normal token at the back", () => expect(insertionNeighbours(list, false)).toEqual({ before: 400, after: null }));
  it("puts a priority token behind other priority tokens, ahead of normal ones", () =>
    expect(insertionNeighbours(list, true)).toEqual({ before: 200, after: 300 }));
  it("puts a priority token at the front when nobody else is priority", () =>
    expect(insertionNeighbours(list.slice(2), true)).toEqual({ before: null, after: 300 }));
  it("puts a priority token at the back when everyone is priority", () =>
    expect(insertionNeighbours(list.slice(0, 2), true)).toEqual({ before: 200, after: null }));
  it("handles an empty list", () => expect(insertionNeighbours([], true)).toEqual({ before: null, after: null }));
});

describe("estimateWaitSec", () => {
  it("is half a service time when you are next at one counter", () => expect(estimateWaitSec(0, 600, 1)).toBe(300));
  it("grows with people ahead", () => expect(estimateWaitSec(3, 600, 1)).toBe(4 * 600 - 300));
  it("shrinks with more counters", () => expect(estimateWaitSec(3, 600, 2)).toBe(2 * 600 - 300));
  it("treats zero counters as one", () => expect(estimateWaitSec(0, 600, 0)).toBe(300));
});
