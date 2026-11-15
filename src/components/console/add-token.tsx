"use client";

import { clsx } from "clsx";
import { ChevronDown, Star } from "lucide-react";
import { forwardRef, useState } from "react";
import { api } from "@/lib/client";
import type { QueueSnapshot, TokenDTO } from "@/lib/types";
import { Button, Input } from "../ui";

export const AddToken = forwardRef<
  HTMLInputElement,
  { queueId: string; onAdded: (token: TokenDTO, snapshot: QueueSnapshot) => void }
>(function AddToken({ queueId, onAdded }, nameRef) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ token: TokenDTO; snapshot: QueueSnapshot }>(`/api/queues/${queueId}/tokens`, {
        method: "POST",
        json: { name, phone: phone || undefined, note: note || undefined, priority },
      });
      setName("");
      setPhone("");
      setNote("");
      setPriority(false);
      onAdded(res.token, res.snapshot);
      (nameRef as React.RefObject<HTMLInputElement | null>)?.current?.focus();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Add a person</h2>
        <kbd className="rounded border border-line px-1.5 text-xs text-ink-faint">N</kbd>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="t-name" className="sr-only">
            Name
          </label>
          <Input
            id="t-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            required
            maxLength={80}
            autoComplete="off"
          />
        </div>
        {more ? (
          <>
            <div>
              <label htmlFor="t-phone" className="sr-only">
                Phone
              </label>
              <Input
                id="t-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone (optional)"
                inputMode="tel"
                autoComplete="off"
              />
            </div>
            <div>
              <label htmlFor="t-note" className="sr-only">
                Note
              </label>
              <Input
                id="t-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note for staff (optional)"
                maxLength={140}
              />
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setMore(true)}
            className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink"
          >
            <ChevronDown className="size-4" /> Add phone or note
          </button>
        )}
        <label
          className={clsx(
            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
            priority ? "border-amber bg-amber-wash text-amber-ink" : "border-line text-ink-soft hover:border-ink-faint",
          )}
        >
          <input
            type="checkbox"
            checked={priority}
            onChange={(e) => setPriority(e.target.checked)}
            className="size-4 accent-[var(--amber)]"
          />
          <Star className={clsx("size-4", priority && "fill-current")} />
          <span>
            <span className="font-medium">Priority</span>
            <span className="block text-xs opacity-80">Seniors, emergencies. Joins ahead of regular tokens.</span>
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" className="w-full" loading={loading}>
          Issue token
        </Button>
      </div>
    </form>
  );
});
