"use client";

import { clsx } from "clsx";
import { useParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { formatDuration, timeOfDay } from "@/lib/client";
import { useLiveData } from "@/lib/hooks";
import type { TrackerSnapshot } from "@/lib/types";
import { Logo } from "./logo";
import { LiveDot } from "./ui";

/** Patient's own view of their token, opened from the QR code. */
export function Tracker() {
  const { key } = useParams<{ key: string }>();
  const { data, error, status } = useLiveData<TrackerSnapshot>(
    `/api/public/track/${key}`,
    `/api/public/track/${key}/stream`,
    15_000,
  );
  const prevStatus = useRef<string | null>(null);

  // Buzz the phone and flag the tab when it's their turn.
  useEffect(() => {
    if (!data) return;
    if (data.status === "serving" && prevStatus.current && prevStatus.current !== "serving") {
      navigator.vibrate?.([300, 150, 300, 150, 600]);
    }
    prevStatus.current = data.status;
    document.title =
      data.status === "serving"
        ? `Your turn: counter ${data.counter}`
        : data.status === "waiting"
          ? data.ahead === 0
            ? `You're next: ${data.code}`
            : `${data.ahead} ahead of ${data.code}`
          : `${data.code} | QueueFlow`;
  }, [data]);

  if (error && !data) {
    return (
      <Shell>
        <p className="mt-16 text-center text-lg">This token link doesn&apos;t work any more.</p>
        <p className="mt-2 text-center text-ink-soft">Ask at the front desk for a new one.</p>
      </Shell>
    );
  }
  if (!data) {
    return (
      <Shell>
        <div className="mx-auto mt-16 h-40 w-60 animate-pulse rounded-2xl bg-sunken" />
      </Shell>
    );
  }

  const turn = data.status === "serving";
  const firstName = data.name.split(" ")[0];

  return (
    <Shell status={status}>
      <p className="text-center text-ink-soft">
        {firstName ? `Hi ${firstName}, this` : "This"} is your token for <strong className="text-ink">{data.queueName}</strong>
      </p>

      <div
        className={clsx(
          "ticket mx-auto mt-6 flex w-full max-w-xs flex-col items-center py-8",
          turn ? "animate-call bg-amber text-[#2a1d00]" : "bg-surface shadow-sm",
          (data.status === "cancelled" || data.status === "no_show") && "opacity-60",
        )}
      >
        <span className="font-wide tabular text-6xl leading-none font-black tracking-tight">{data.code}</span>
        <span className={clsx("mt-3 text-sm", turn ? "opacity-80" : "text-ink-faint")}>
          Issued at {timeOfDay(data.createdAt)}
        </span>
      </div>

      <section className="mt-8 text-center" aria-live="polite">
        {data.status === "waiting" ? (
          <>
            {data.ahead === 0 ? (
              <p className="font-wide text-3xl font-bold">You&apos;re next</p>
            ) : (
              <p className="font-wide text-3xl font-bold">
                <span className="tabular">{data.ahead}</span> {data.ahead === 1 ? "person" : "people"} ahead of you
              </p>
            )}
            <p className="mt-2 text-lg text-ink-soft">
              {data.etaSec != null ? <>Expected in about {formatDuration(data.etaSec)}</> : "Please stay nearby"}
            </p>
            {data.ahead <= 2 ? (
              <p className="mx-auto mt-5 max-w-xs rounded-lg bg-amber-wash px-4 py-3 text-sm text-amber-ink">
                Almost your turn. Please make your way to the waiting area.
              </p>
            ) : (
              <p className="mx-auto mt-5 max-w-xs text-sm text-ink-faint">
                Keep this page open. It updates by itself and your phone will buzz when you&apos;re called.
              </p>
            )}
          </>
        ) : turn ? (
          <>
            <p className="font-wide text-3xl font-bold">It&apos;s your turn</p>
            <p className="mt-2 text-xl">
              Please go to <strong className="font-wide">counter {data.counter}</strong>
            </p>
          </>
        ) : data.status === "served" ? (
          <p className="text-xl">You&apos;ve been seen. Thank you for waiting.</p>
        ) : data.status === "no_show" ? (
          <p className="text-xl">You were called but we couldn&apos;t find you. Please speak to the front desk.</p>
        ) : (
          <p className="text-xl">This token was cancelled. Please speak to the front desk if that&apos;s a mistake.</p>
        )}
      </section>

      {data.nowServing.length && data.status === "waiting" ? (
        <section className="mt-10 border-t border-line pt-6">
          <h2 className="text-center text-sm text-ink-faint">Now serving</h2>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {data.nowServing.map((s) => (
              <li key={s.code} className="rounded-lg bg-surface px-3 py-2 text-center shadow-sm">
                <span className="font-wide tabular block font-bold">{s.code}</span>
                <span className="text-xs text-ink-faint">Counter {s.counter}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}

function Shell({ children, status }: { children: React.ReactNode; status?: "connecting" | "live" | "offline" }) {
  return (
    <div className="mx-auto min-h-dvh max-w-md px-5 py-6">
      <div className="flex items-center justify-between">
        <Logo href="/t" className="pointer-events-none" />
        {status ? <LiveDot status={status} /> : null}
      </div>
      <main className="mt-10">{children}</main>
    </div>
  );
}
