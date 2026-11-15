"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Re-renders every `ms` so elapsed timers stay current. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export type LiveStatus = "connecting" | "live" | "offline";

/**
 * Loads a snapshot from `url` and keeps it fresh:
 *  - Server-Sent Events from `streamUrl` trigger a (debounced) refetch,
 *  - a slow poll + refetch-on-focus cover dropped connections.
 * Mutations can push a fresh snapshot directly with `setData`.
 */
export function useLiveData<T>(url: string | null, streamUrl: string | null, pollMs = 20_000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!url) return;
    const mySeq = ++seq.current;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (mySeq !== seq.current) return; // a newer request already won
      if (!res.ok) {
        if (res.status === 401) {
          // Full page load on purpose: it drops all client state from the expired session.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
          return;
        }
        setError(json.error ?? "Could not load data");
        return;
      }
      setError(null);
      setData(json as T);
    } catch {
      if (mySeq === seq.current) setStatus("offline");
    }
  }, [url]);

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 120);
  }, [refresh]);

  /** Apply a snapshot returned by a mutation and invalidate any in-flight fetch. */
  const apply = useCallback((next: T) => {
    seq.current++;
    setData(next);
  }, []);

  useEffect(() => {
    // Initial fetch; state is only set after the network round trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!streamUrl) return;
    const es = new EventSource(streamUrl);
    es.addEventListener("ready", () => setStatus("live"));
    es.onmessage = () => {
      setStatus("live");
      schedule();
    };
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
    const poll = setInterval(refresh, pollMs);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", refresh);
    return () => {
      es.close();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", refresh);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [streamUrl, schedule, refresh, pollMs]);

  return { data, error, status, refresh, apply };
}
