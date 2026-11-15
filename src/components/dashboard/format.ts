export type RangeKey = "today" | "7d" | "30d";

/** Axis/tooltip labels for a bucket start, in the clinic's time zone. */
export function bucketLabel(iso: string, range: RangeKey, tz: string, long = false): string {
  const d = new Date(iso);
  if (range === "today")
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: long ? "2-digit" : undefined, timeZone: tz });
  if (range === "7d")
    return long
      ? d.toLocaleString("en-IN", { weekday: "short", hour: "numeric", timeZone: tz })
      : d.toLocaleDateString("en-IN", { weekday: "short", timeZone: tz });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: tz });
}

export const pct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${Math.round(x * 100)}%`);
export const minutes = (sec: number | null | undefined) => (sec == null ? null : Math.round(sec / 60));

/** Labels for charts rolled up to one point per day: "Mon" on the axis, "Mon, 9 Nov" in tooltips. */
export function dayLabel(iso: string, tz: string, long = false): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    ...(long ? { day: "numeric", month: "short" } : {}),
    timeZone: tz,
  });
}
