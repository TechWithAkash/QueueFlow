"use client";

import { clsx } from "clsx";
import { Check, Megaphone, UserX } from "lucide-react";
import { clock, formatDuration, since } from "@/lib/client";
import type { TokenDTO } from "@/lib/types";
import { Button } from "../ui";

export function Counters({
  counters,
  serving,
  now,
  waitingCount,
  busy,
  onCall,
  onAction,
  avgServiceSec,
}: {
  counters: number;
  serving: TokenDTO[];
  now: number;
  waitingCount: number;
  busy: string | null;
  avgServiceSec: number;
  onCall: (counter: number) => void;
  onAction: (token: TokenDTO, action: "complete" | "no_show" | "recall") => void;
}) {
  const byCounter = new Map(serving.map((t) => [t.counter, t]));
  return (
    <section aria-label="Counters" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: counters }, (_, i) => i + 1).map((c) => {
        const t = byCounter.get(c);
        const elapsed = t?.calledAt ? since(t.calledAt, now) : 0;
        const overtime = t && elapsed > avgServiceSec * 2;
        return (
          <div
            key={c}
            className={clsx(
              "flex flex-col rounded-2xl border p-4",
              t ? "border-transparent bg-board text-board-ink" : "border-dashed border-line bg-surface",
            )}
          >
            <div className="flex h-8 items-center justify-between gap-2 text-sm">
              <span className={t ? "text-board-ink/70" : "text-ink-soft"}>
                Counter {c}
                {t ? (
                  <span
                    className={clsx("tabular ml-2", overtime ? "font-semibold text-amber" : "text-board-ink/50")}
                    title={
                      overtime ? `Longer than twice the usual ${formatDuration(avgServiceSec)}` : "Time at counter"
                    }
                  >
                    {clock(elapsed)}
                  </span>
                ) : null}
              </span>
              {t ? (
                <span className="flex gap-0.5">
                  <IconBtn label={`Call ${t.code} again`} onClick={() => onAction(t, "recall")}>
                    <Megaphone className="size-4" />
                  </IconBtn>
                  <IconBtn label={`Mark ${t.code} served`} onClick={() => onAction(t, "complete")}>
                    <Check className="size-4" />
                  </IconBtn>
                  <IconBtn label={`${t.code} didn't come`} onClick={() => onAction(t, "no_show")}>
                    <UserX className="size-4" />
                  </IconBtn>
                </span>
              ) : (
                <span className="text-ink-faint">Free</span>
              )}
            </div>
            {t ? (
              <div key={t.id} className="animate-call mt-2 mb-4">
                <p className="font-wide tabular text-4xl leading-none font-extrabold text-amber">{t.code}</p>
                <p className="mt-2 truncate font-medium">{t.name}</p>
                {t.note ? <p className="truncate text-sm text-board-ink/60">{t.note}</p> : null}
              </div>
            ) : (
              <p className="mt-2 mb-4 text-sm text-ink-faint">
                {waitingCount ? "Call the next person to this counter." : "Nobody waiting."}
              </p>
            )}
            <Button
              variant={t ? "amber" : "primary"}
              size="sm"
              className="mt-auto w-full"
              onClick={() => onCall(c)}
              loading={busy === `call-${c}`}
              disabled={!waitingCount && !t}
              title={t ? `Mark ${t.code} done and call the next person` : "Call the person at the top of the list"}
            >
              {t ? (waitingCount ? "Done, call next" : "Done") : "Call next"}
            </Button>
          </div>
        );
      })}
    </section>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-7 place-items-center rounded-md text-board-ink/80 hover:bg-white/15 hover:text-board-ink"
    >
      {children}
    </button>
  );
}
