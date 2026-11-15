"use client";

import { useState } from "react";
import type { Analytics } from "@/lib/analytics-service";
import { formatDuration } from "@/lib/client";
import { Panel } from "./charts";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0]; // heatmap rows are Sunday-first; show Monday-first
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;

/** Weekday x hour grid. One hue, light to dark = more arrivals. */
export function Heatmap({ heatmap, metric }: { heatmap: Analytics["heatmap"]; metric: "arrivals" | "wait" }) {
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null);
  const grid = metric === "arrivals" ? heatmap.arrivals : heatmap.avgWaitSec;
  // Only show opening hours (any hour that ever had arrivals).
  const hours = Array.from({ length: 24 }, (_, h) => h).filter((h) => heatmap.arrivals.some((row) => row[h] > 0));
  const max = Math.max(1, ...grid.flat().map((v) => v ?? 0));
  const value = (d: number, h: number) => grid[d][h] ?? 0;
  const fmt = (v: number) => (metric === "arrivals" ? `${v} joined` : v ? `${formatDuration(v)} average wait` : "No one called");

  if (!hours.length) {
    return (
      <Panel title="Busiest times">
        <p className="py-8 text-center text-sm text-ink-faint">Not enough history yet.</p>
      </Panel>
    );
  }

  const peak = (() => {
    let best = { d: 0, h: hours[0], v: -1 };
    for (const d of DAY_INDEX) for (const h of hours) if (value(d, h) > best.v) best = { d, h, v: value(d, h) };
    return best;
  })();

  return (
    <Panel
      title={metric === "arrivals" ? "Busiest times" : "When waits are longest"}
      subtitle={
        metric === "arrivals"
          ? `Arrivals by weekday and hour. Peak: ${DAYS[DAY_INDEX.indexOf(peak.d)]} ${hourLabel(peak.h)}.`
          : `Average wait by weekday and hour. Longest: ${DAYS[DAY_INDEX.indexOf(peak.d)]} ${hourLabel(peak.h)}.`
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] table-fixed border-separate border-spacing-[3px] text-xs" aria-label="Weekday by hour heatmap">
          <thead>
            <tr>
              <th className="w-10" />
              {hours.map((h) => (
                <th key={h} scope="col" className="tabular pb-1 font-normal text-ink-faint">
                  {h % 2 === 0 || hours.length < 12 ? hourLabel(h) : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_INDEX.map((d, i) => (
              <tr key={d}>
                <th scope="row" className="pr-2 text-left font-normal text-ink-soft">
                  {DAYS[i]}
                </th>
                {hours.map((h) => {
                  const v = value(d, h);
                  const k = v / max;
                  const on = hover?.d === d && hover?.h === h;
                  return (
                    <td
                      key={h}
                      onMouseEnter={() => setHover({ d, h })}
                      onMouseLeave={() => setHover(null)}
                      title={`${DAYS[i]} ${hourLabel(h)}: ${fmt(v)}`}
                      className="relative h-7 min-w-6 rounded-[4px]"
                      style={{
                        background: v
                          ? `color-mix(in oklab, var(--series-1) ${Math.round(12 + k * 88)}%, var(--surface))`
                          : "var(--sunken)",
                        outline: on ? "2px solid var(--ink)" : undefined,
                      }}
                    >
                      <span className="sr-only">{fmt(v)}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between gap-4 text-xs text-ink-faint">
        <span aria-live="polite" className="min-h-4 text-ink-soft">
          {hover ? `${DAYS[DAY_INDEX.indexOf(hover.d)]} ${hourLabel(hover.h)}: ${fmt(value(hover.d, hover.h))}` : ""}
        </span>
        <span className="flex items-center gap-2">
          Fewer
          <span
            className="h-2 w-24 rounded"
            style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--series-1) 12%, var(--surface)), var(--series-1))" }}
          />
          More
        </span>
      </div>
    </Panel>
  );
}
