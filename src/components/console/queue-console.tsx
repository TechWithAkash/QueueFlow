"use client";

import { ArrowLeft, Monitor, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api, formatDuration } from "@/lib/client";
import { useLiveData, useNow } from "@/lib/hooks";
import type { QueueSnapshot, TokenDTO } from "@/lib/types";
import { QueueForm } from "../queue-form";
import { Button, Dialog, LiveDot } from "../ui";
import { AddToken } from "./add-token";
import { Counters } from "./counters";
import { ActivityFeed, RecentTokens } from "./side-panels";
import { TokenQrDialog } from "./token-qr";
import { WaitingList } from "./waiting-list";

export function QueueConsole() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, status, refresh, apply } = useLiveData<QueueSnapshot>(
    `/api/queues/${id}`,
    `/api/queues/${id}/stream`,
  );
  const now = useNow(1000);
  const [busy, setBusy] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [qrToken, setQrToken] = useState<TokenDTO | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [menu, setMenu] = useState(false);
  // Remember which counter this browser sits at. (Only rendered after data loads, so no hydration mismatch.)
  const [myCounter, setMyCounter] = useState(() => {
    try {
      return Number(localStorage.getItem(`qf-counter-${id}`)) || 1;
    } catch {
      return 1;
    }
  });
  const nameRef = useRef<HTMLInputElement>(null);

  const counters = data?.queue.counters ?? 1;
  const selectedCounter = Math.min(myCounter, counters);
  const chooseCounter = (c: number) => {
    setMyCounter(c);
    try {
      localStorage.setItem(`qf-counter-${id}`, String(c));
    } catch {}
  };

  /** Runs a mutation that returns a fresh snapshot; refetches on failure so the UI never drifts. */
  const mutate = useCallback(
    async <R extends { snapshot: QueueSnapshot }>(key: string, run: () => Promise<R>): Promise<R | null> => {
      setBusy(key);
      try {
        const res = await run();
        apply(res.snapshot);
        return res;
      } catch (e) {
        toast.error((e as Error).message);
        void refresh();
        return null;
      } finally {
        setBusy(null);
      }
    },
    [apply, refresh],
  );

  const patchToken = useCallback(
    (t: TokenDTO, json: Record<string, unknown>) =>
      mutate(`tok-${t.id}`, () => api<{ snapshot: QueueSnapshot }>(`/api/tokens/${t.id}`, { method: "PATCH", json })),
    [mutate],
  );

  const callNext = useCallback(
    async (counter: number) => {
      const res = await mutate(`call-${counter}`, () =>
        api<{ token: TokenDTO | null; snapshot: QueueSnapshot }>(`/api/queues/${id}/call-next`, {
          method: "POST",
          json: { counter },
        }),
      );
      if (res && !res.token) toast("Nobody is waiting", { description: `Counter ${counter} is now free.` });
    },
    [id, mutate],
  );

  async function cancel(t: TokenDTO) {
    const res = await patchToken(t, { action: "cancel" });
    if (res)
      toast(`${t.code} cancelled`, {
        action: { label: "Undo", onClick: () => void patchToken(t, { action: "restore" }) },
        duration: 6000,
      });
  }

  function move(t: TokenDTO, direction: "up" | "down") {
    if (!data) return;
    const i = data.waiting.findIndex((x) => x.id === t.id);
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= data.waiting.length) return;
    const next = [...data.waiting];
    [next[i], next[j]] = [next[j], next[i]];
    apply({ ...data, waiting: next });
    void patchToken(t, { action: "move", direction });
  }

  function reorder(next: TokenDTO[], tokenId: string, beforeId: string | null) {
    if (!data) return;
    apply({ ...data, waiting: next });
    const t = next.find((x) => x.id === tokenId)!;
    void patchToken(t, { action: "reorder", beforeId });
  }

  // Keyboard: N = new person, C = call next at my counter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], dialog[open]")) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        nameRef.current?.focus();
      } else if ((e.key === "c" || e.key === "C") && !busy) {
        e.preventDefault();
        void callNext(selectedCounter);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, callNext, selectedCounter]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <p className="text-lg font-medium">{error}</p>
        <Link href="/queues" className="mt-4 inline-block text-teal hover:underline">
          Back to queues
        </Link>
      </div>
    );
  }
  if (!data) return <ConsoleSkeleton />;

  const { queue, stats } = data;
  const waitingAtTop = data.waiting[0];

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/queues" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="size-4" /> Queues
      </Link>
      <header className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <h1 className="font-wide text-3xl font-bold tracking-tight">{queue.name}</h1>
          <LiveDot status={status} />
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/display/${queue.id}`}
            target="_blank"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:border-ink-faint"
          >
            <Monitor className="size-4" /> Open display board
          </Link>
          <div className="relative">
            <Button aria-label="More queue options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal className="size-4" />
            </Button>
            {menu ? (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 z-40 mt-2 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-xl">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sunken"
                    onClick={() => {
                      setMenu(false);
                      setEditing(true);
                    }}
                  >
                    <Pencil className="size-4" /> Edit queue
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red hover:bg-red-wash"
                    onClick={() => {
                      setMenu(false);
                      setDeleting(true);
                    }}
                  >
                    <Trash2 className="size-4" /> Delete queue
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3 border-y border-line py-4">
        <Figure label="Waiting now" value={String(stats.waiting)} />
        <Figure label="Average wait today" value={formatDuration(stats.avgWaitTodaySec)} />
        <Figure label="Served today" value={String(stats.servedToday)} />
        <Figure label="Typical time at counter" value={formatDuration(stats.avgServiceSec)} />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <Counters
            counters={queue.counters}
            serving={data.serving}
            now={now}
            waitingCount={data.waiting.length}
            busy={busy}
            avgServiceSec={stats.avgServiceSec}
            onCall={callNext}
            onAction={(t, action) => {
              void patchToken(t, { action }).then((r) => {
                if (r && action === "recall") toast.success(`${t.code} called again to counter ${t.counter}`);
                if (r && action === "no_show")
                  toast(`${t.code} marked as not present`, {
                    action: { label: "Undo", onClick: () => void patchToken(t, { action: "restore" }) },
                  });
              });
            }}
          />

          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="font-semibold">
                Waiting <span className="tabular font-normal text-ink-faint">{data.waiting.length}</span>
              </h2>
              <div className="flex items-center gap-2">
                {queue.counters > 1 ? (
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    <span className="hidden sm:inline">I&apos;m at</span>
                    <select
                      value={selectedCounter}
                      onChange={(e) => chooseCounter(Number(e.target.value))}
                      className="h-8 rounded-md border border-line bg-surface px-2 text-sm text-ink"
                    >
                      {Array.from({ length: queue.counters }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          Counter {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!waitingAtTop}
                  loading={busy === `call-${selectedCounter}`}
                  onClick={() => callNext(selectedCounter)}
                  title="Shortcut: C"
                >
                  Call {waitingAtTop?.code ?? "next"}
                  {queue.counters > 1 ? ` to counter ${selectedCounter}` : ""}
                </Button>
              </div>
            </div>
            <WaitingList
              tokens={data.waiting}
              now={now}
              highlight={highlight}
              onReorder={reorder}
              onMove={move}
              onCancel={cancel}
              onQr={setQrToken}
            />
          </section>
        </div>

        <aside className="space-y-6">
          <AddToken
            ref={nameRef}
            queueId={queue.id}
            onAdded={(t, snap) => {
              apply(snap);
              setHighlight(t.id);
              setTimeout(() => setHighlight((h) => (h === t.id ? null : h)), 3500);
              toast.success(`${t.code} issued to ${t.name}`, {
                description:
                  t.etaSec != null ? `About ${formatDuration(t.etaSec)} until they're called.` : undefined,
                action: { label: "Show QR", onClick: () => setQrToken(t) },
              });
            }}
          />
          <RecentTokens tokens={data.recent} onRestore={(t) => void patchToken(t, { action: "restore" })} />
          <ActivityFeed items={data.activity} />
        </aside>
      </div>

      <TokenQrDialog token={qrToken} onClose={() => setQrToken(null)} />

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit queue">
        <QueueForm
          initial={queue}
          onCancel={() => setEditing(false)}
          onDone={() => {
            setEditing(false);
            toast.success("Queue updated");
            void refresh();
          }}
        />
      </Dialog>

      <DeleteDialog
        open={deleting}
        name={queue.name}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await api(`/api/queues/${queue.id}`, { method: "DELETE" });
          toast.success(`${queue.name} deleted`);
          router.push("/queues");
        }}
      />
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="font-wide tabular mt-0.5 text-2xl font-bold">{value}</dd>
    </div>
  );
}

function DeleteDialog({
  open,
  name,
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Delete ${name}?`}
      description="All tokens and history for this queue are removed, and it disappears from the dashboard. This can't be undone."
    >
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Keep queue</Button>
        <Button
          variant="danger"
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await onConfirm();
            } catch (e) {
              toast.error((e as Error).message);
              setLoading(false);
            }
          }}
        >
          Delete queue
        </Button>
      </div>
    </Dialog>
  );
}

function ConsoleSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse" aria-busy aria-label="Loading queue">
      <div className="mt-6 h-8 w-64 rounded bg-sunken" />
      <div className="mt-6 h-16 rounded bg-sunken" />
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="h-96 rounded-2xl bg-sunken" />
        <div className="h-72 rounded-2xl bg-sunken" />
      </div>
    </div>
  );
}
