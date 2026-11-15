"use client";

import { RotateCcw } from "lucide-react";
import { timeOfDay } from "@/lib/client";
import type { ActivityDTO, TokenDTO } from "@/lib/types";
import { Badge, TokenCode } from "../ui";

const outcome: Record<string, { label: string; tone: "green" | "red" | "neutral" }> = {
  served: { label: "Served", tone: "green" },
  cancelled: { label: "Cancelled", tone: "red" },
  no_show: { label: "Didn't come", tone: "neutral" },
};

export function RecentTokens({ tokens, onRestore }: { tokens: TokenDTO[]; onRestore: (t: TokenDTO) => void }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-semibold">Recently finished</h2>
      {tokens.length ? (
        <ul className="mt-3 space-y-2">
          {tokens.map((t) => {
            const o = outcome[t.status];
            return (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <TokenCode code={t.code} size="sm" tone={t.status === "served" ? "paper" : "muted"} />
                <span className="min-w-0 flex-1 truncate text-ink-soft">{t.name}</span>
                {t.status === "served" ? (
                  <Badge tone={o.tone}>{o.label}</Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRestore(t)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-teal hover:bg-teal-wash"
                    title={`${o?.label}. Put ${t.code} back at the end of the line.`}
                  >
                    <RotateCcw className="size-3" /> Put back
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-faint">Served, cancelled and no-show tokens appear here.</p>
      )}
    </section>
  );
}

const verbs: Record<string, string> = {
  created: "joined the line",
  moved: "was moved",
  called: "was called",
  recalled: "was called again",
  served: "was served",
  no_show: "didn't come",
  cancelled: "was cancelled",
  restored: "was put back",
};

export function ActivityFeed({ items }: { items: ActivityDTO[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="font-semibold">Activity</h2>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex gap-3">
              <span className="tabular w-16 shrink-0 text-ink-faint">{timeOfDay(a.at)}</span>
              <span className="text-ink-soft">
                <span className="font-wide font-semibold text-ink">{a.code}</span> {verbs[a.type] ?? a.type}
                {(a.type === "called" || a.type === "recalled") && a.counter ? ` to counter ${a.counter}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-faint">Nothing has happened in this queue yet.</p>
      )}
    </section>
  );
}
