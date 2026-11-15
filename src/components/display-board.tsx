"use client";

import { clsx } from "clsx";
import { Maximize, Volume2, VolumeX } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { chime, speakCall, unlockAudio } from "@/lib/announce";
import { formatDuration } from "@/lib/client";
import { useLiveData, useNow } from "@/lib/hooks";
import type { DisplaySnapshot } from "@/lib/types";

/** Full-screen waiting-room board for a TV. Public: shows token codes only, never names. */
export function DisplayBoard() {
  const { id } = useParams<{ id: string }>();
  const { data, error, status } = useLiveData<DisplaySnapshot>(
    `/api/public/display/${id}`,
    `/api/public/display/${id}/stream`,
    15_000,
  );
  const now = useNow(10_000);
  const [sound, setSound] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const lastSeen = useRef<string | null | undefined>(undefined);

  // Announce each new call or recall (but not whatever was last called before the page opened).
  useEffect(() => {
    if (!data) return;
    const call = data.lastCall;
    if (lastSeen.current === undefined) {
      lastSeen.current = call?.id ?? null;
      return;
    }
    if (call && call.id !== lastSeen.current) {
      lastSeen.current = call.id;
      setFresh(call.code);
      if (sound) {
        chime();
        setTimeout(() => speakCall(call.code, call.counter), 900);
      }
    }
  }, [data, sound]);

  // The highlight fades back after a while.
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 12_000);
    return () => clearTimeout(t);
  }, [fresh]);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      try {
        if (localStorage.getItem("qf-theme") !== "dark") document.documentElement.classList.remove("dark");
      } catch {}
    };
  }, []);

  if (error && !data) {
    return (
      <div className="grid min-h-dvh place-items-center bg-board p-8 text-center text-board-ink">
        <p className="text-2xl">{error}</p>
      </div>
    );
  }

  const slots = data
    ? Array.from({ length: data.queue.counters }, (_, i) => ({
        counter: i + 1,
        code: data.serving.find((s) => s.counter === i + 1)?.code ?? null,
      }))
    : [];

  return (
    <div className="flex min-h-dvh flex-col bg-board p-[3vmin] text-board-ink lg:h-dvh lg:overflow-hidden">
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-baseline gap-4">
          <h1 className="font-wide text-[4.5vmin] leading-none font-extrabold tracking-tight">
            {data?.queue.name ?? " "}
          </h1>
          {status !== "live" ? (
            <span className="text-[1.8vmin] text-amber">{status === "offline" ? "Reconnecting" : "Connecting"}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          <p className="tabular text-[3vmin] font-medium text-board-ink/70" suppressHydrationWarning>
            {new Date(now).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </p>
          <button
            type="button"
            onClick={() => {
              if (!sound) unlockAudio();
              setSound((s) => !s);
            }}
            className="rounded-lg p-2 text-board-ink/50 hover:bg-white/10 hover:text-board-ink"
            aria-label={sound ? "Turn announcements off" : "Turn announcements on"}
            title={sound ? "Announcements on" : "Announcements off"}
          >
            {sound ? <Volume2 className="size-6" /> : <VolumeX className="size-6" />}
          </button>
          <button
            type="button"
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            className="rounded-lg p-2 text-board-ink/50 hover:bg-white/10 hover:text-board-ink"
            aria-label="Full screen"
          >
            <Maximize className="size-6" />
          </button>
        </div>
      </header>

      <main className="mt-[3vmin] grid min-h-0 flex-1 gap-[3vmin] lg:grid-cols-[1.6fr_1fr]">
        <section aria-label="Now serving" aria-live="polite" className="flex min-h-0 flex-col">
          <h2 className="text-[2.4vmin] text-board-ink/60">Now serving</h2>
          <ul
            className={clsx(
              "mt-[1.5vmin] grid min-h-0 flex-1 gap-[1.5vmin]",
              slots.length > 4 ? "grid-cols-2" : "grid-cols-1",
            )}
            style={{ gridAutoRows: "minmax(0, 1fr)" }}
          >
            {slots.map((s) => {
              const isFresh = s.code && s.code === fresh;
              return (
                <li
                  key={s.counter}
                  className={clsx(
                    "flex items-center justify-between rounded-[2vmin] px-[3vmin] py-[2vmin]",
                    isFresh ? "animate-call bg-amber text-[#2a1d00]" : "bg-white/6",
                  )}
                >
                  <span
                    className={clsx(
                      "font-wide tabular leading-none font-black",
                      slots.length > 4 ? "text-[7vmin]" : "text-[11vmin]",
                      !s.code && "text-board-ink/20",
                    )}
                  >
                    {s.code ?? "—"}
                  </span>
                  <span className="text-right">
                    <span className={clsx("block text-[2vmin]", isFresh ? "opacity-80" : "text-board-ink/50")}>
                      Counter
                    </span>
                    <span className="font-wide tabular block text-[7vmin] leading-none font-bold">{s.counter}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Up next" className="flex min-h-0 flex-col rounded-[2vmin] bg-white/4 p-[3vmin]">
          <h2 className="text-[2.4vmin] text-board-ink/60">Up next</h2>
          {data?.upNext.length ? (
            <ol className="mt-[1.5vmin] min-h-0 flex-1 space-y-[1.2vmin] overflow-hidden">
              {data.upNext.slice(0, 6).map((t, i) => (
                <li key={t.code} className="flex items-center gap-[2vmin]">
                  <span
                    className={clsx(
                      "ticket font-wide tabular px-[2.5vmin] py-[0.8vmin] text-[5vmin] leading-tight font-extrabold",
                      i === 0 ? "bg-board-ink text-board" : "bg-white/10",
                    )}
                  >
                    {t.code}
                  </span>
                  {t.priority ? <span className="text-[1.8vmin] text-amber">Priority</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-[2vmin] text-[3vmin] text-board-ink/50">No one waiting</p>
          )}
          <div className="mt-auto grid grid-cols-2 gap-[2vmin] border-t border-white/10 pt-[2vmin]">
            <div>
              <p className="font-wide tabular text-[5vmin] leading-none font-bold">{data?.waiting ?? 0}</p>
              <p className="mt-[0.6vmin] text-[1.8vmin] text-board-ink/60">waiting</p>
            </div>
            <div>
              <p className="font-wide tabular text-[5vmin] leading-none font-bold">
                {data ? formatDuration(data.avgServiceSec) : "—"}
              </p>
              <p className="mt-[0.6vmin] text-[1.8vmin] text-board-ink/60">per person, usually</p>
            </div>
          </div>
        </section>
      </main>

      {!sound ? (
        <button
          type="button"
          onClick={() => {
            unlockAudio();
            setSound(true);
          }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-amber px-5 py-3 font-semibold text-[#2a1d00] shadow-lg"
        >
          Click once to turn on spoken announcements
        </button>
      ) : null}
    </div>
  );
}
