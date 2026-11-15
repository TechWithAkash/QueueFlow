"use client";

import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Insights } from "@/lib/insights";
import { Button } from "../ui";
import type { RangeKey } from "./format";

const SEVERITY = {
  critical: { icon: OctagonAlert, label: "Needs action", cls: "text-red" },
  warning: { icon: AlertTriangle, label: "Watch", cls: "text-amber-ink" },
  info: { icon: Info, label: "Note", cls: "text-ink-soft" },
  positive: { icon: CheckCircle2, label: "Going well", cls: "text-green" },
} as const;

/** Plain-language summary of the numbers: Gemini when an API key is set, rules otherwise. */
export function InsightsPanel({ range, queue }: { range: RangeKey; queue: string | null }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Insights>("/api/insights", { method: "POST", json: { range, queue } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range, queue]);

  useEffect(() => {
    // Fetch on filter change; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-line bg-surface p-5" aria-busy={loading}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-4 text-series-2" /> What to act on
        </h2>
        <div className="flex items-center gap-3">
          {data ? (
            <span className="text-xs text-ink-faint">
              {data.source === "ai" ? `Written by Gemini from this period's numbers` : "Automatic summary from this period's numbers"}
            </span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={load} loading={loading} aria-label="Refresh summary">
            {!loading ? <RefreshCw className="size-3.5" /> : null}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-red">{error}</p>
      ) : !data ? (
        <div className="mt-4 space-y-3" aria-label="Loading summary">
          <div className="h-5 w-2/3 animate-pulse rounded bg-sunken" />
          <div className="h-16 animate-pulse rounded bg-sunken" />
          <div className="h-16 animate-pulse rounded bg-sunken" />
        </div>
      ) : (
        <div className={clsx("transition-opacity", loading && "opacity-50")}>
          <p className="font-wide mt-3 text-lg leading-snug font-semibold text-balance">{data.headline}</p>
          <ul className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
            {data.insights.map((ins) => {
              const s = SEVERITY[ins.severity];
              return (
                <li key={ins.title} className="flex gap-3">
                  <s.icon className={clsx("mt-0.5 size-5 shrink-0", s.cls)} aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="sr-only">{s.label}: </span>
                      {ins.title}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">{ins.detail}</p>
                    <p className="mt-1.5 text-sm">
                      <span className="font-medium text-teal">Try: </span>
                      {ins.recommendation}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
