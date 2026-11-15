"use client";

import { Monitor, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatDuration } from "@/lib/client";
import { useLiveData } from "@/lib/hooks";
import type { QueueListItem } from "@/lib/types";
import { QueueForm } from "./queue-form";
import { Button, Dialog, EmptyState, TokenCode } from "./ui";

export function QueueList() {
  const router = useRouter();
  const { data, error, refresh } = useLiveData<QueueListItem[]>("/api/queues", null);
  const [creating, setCreating] = useState(false);

  // Poll: this page summarises every queue, so there is no single stream to follow.
  useEffect(() => {
    const id = setInterval(refresh, 8000);
    const onRefresh = () => refresh();
    window.addEventListener("qf:refresh", onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener("qf:refresh", onRefresh);
    };
  }, [refresh]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-wide text-3xl font-bold tracking-tight">Queues</h1>
          <p className="mt-1 text-ink-soft">Open a queue to add people and call them to a counter.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New queue
        </Button>
      </div>

      <div className="mt-8">
        {error ? (
          <p className="rounded-lg bg-red-wash px-4 py-3 text-red">{error}</p>
        ) : !data ? (
          <ListSkeleton />
        ) : data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line">
            <EmptyState
              icon={<Users className="size-8" />}
              title="No queues yet"
              action={
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus className="size-4" /> Create your first queue
                </Button>
              }
            >
              A queue is one line of people waiting for the same service, like Pharmacy or Lab tests.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {data.map((q) => (
              <QueueRow key={q.id} q={q} />
            ))}
          </ul>
        )}
      </div>

      <Dialog open={creating} onClose={() => setCreating(false)} title="New queue">
        <QueueForm
          onCancel={() => setCreating(false)}
          onDone={(q) => {
            toast.success(`${q.name} created`);
            setCreating(false);
            router.push(`/queues/${q.id}`);
          }}
        />
      </Dialog>
    </div>
  );
}

function QueueRow({ q }: { q: QueueListItem }) {
  return (
    <li className="relative grid gap-4 px-5 py-5 transition-colors hover:bg-paper/60 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <Link
            href={`/queues/${q.id}`}
            className="truncate text-lg font-semibold after:absolute after:inset-0 hover:underline"
          >
            {q.name}
          </Link>
          <span className="text-sm text-ink-faint">
            {q.counters} {q.counters === 1 ? "counter" : "counters"}
          </span>
        </div>
        <div className="mt-2 flex min-h-7 flex-wrap items-center gap-2 text-sm text-ink-soft">
          {q.nowServing.length ? (
            <>
              <span>Now serving</span>
              {q.nowServing.map((c) => (
                <TokenCode key={c} code={c} size="sm" tone="amber" />
              ))}
            </>
          ) : (
            <span>No one at a counter</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-6 sm:gap-8">
        <Stat label="Waiting" value={String(q.waiting)} strong />
        <Stat label="Avg wait today" value={formatDuration(q.avgWaitTodaySec)} />
        <Stat label="Served today" value={String(q.servedToday)} />
        <Link
          href={`/display/${q.id}`}
          target="_blank"
          className="relative z-10 rounded-md p-2 text-ink-faint hover:bg-sunken hover:text-ink"
          title="Open the waiting-room display"
          aria-label={`Open the waiting-room display for ${q.name}`}
        >
          <Monitor className="size-5" />
        </Link>
      </div>
    </li>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-16">
      <p className={"font-wide tabular leading-none font-bold " + (strong ? "text-3xl" : "text-xl text-ink-soft")}>
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-faint">{label}</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-surface" aria-busy aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between px-5 py-6">
          <div className="h-5 w-40 animate-pulse rounded bg-sunken" />
          <div className="h-8 w-48 animate-pulse rounded bg-sunken" />
        </div>
      ))}
    </div>
  );
}
