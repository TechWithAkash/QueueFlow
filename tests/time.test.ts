import { describe, expect, it } from "vitest";
import { dayKey, startOfDay } from "@/lib/time";

describe("time helpers", () => {
  it("uses the clinic's day, not UTC's", () => {
    // 20:00 UTC on the 13th is already 01:30 on the 14th in Kolkata.
    expect(dayKey(new Date("2026-11-13T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-14");
    expect(dayKey(new Date("2026-11-13T20:00:00Z"), "UTC")).toBe("2026-11-13");
  });
  it("finds local midnight", () => {
    expect(startOfDay(new Date("2026-11-13T10:00:00Z"), "Asia/Kolkata").toISOString()).toBe("2026-11-12T18:30:00.000Z");
  });
});
