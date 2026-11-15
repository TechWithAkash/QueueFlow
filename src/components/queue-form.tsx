"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import type { QueueSummary } from "@/lib/types";
import { Button, Field, Input } from "./ui";

/** Create or edit a queue. */
export function QueueForm({
  initial,
  onDone,
  onCancel,
}: {
  initial?: QueueSummary;
  onDone: (q: QueueSummary) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [prefix, setPrefix] = useState(initial?.prefix ?? "");
  const [prefixTouched, setPrefixTouched] = useState(!!initial);
  const [counters, setCounters] = useState(initial?.counters ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const suggested = (name.match(/[A-Za-z]/)?.[0] ?? "").toUpperCase();
  const effectivePrefix = prefixTouched ? prefix : suggested;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = { name: name.trim(), prefix: effectivePrefix, counters };
      const q = initial
        ? await api<QueueSummary>(`/api/queues/${initial.id}`, { method: "PATCH", json: body })
        : await api<QueueSummary>("/api/queues", { method: "POST", json: body });
      onDone(q);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Queue name" htmlFor="q-name" hint="What patients see on the board, for example Pharmacy.">
        <Input
          id="q-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={60}
          autoFocus
          placeholder="General OPD"
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Token letter" htmlFor="q-prefix" hint={`Codes look like ${effectivePrefix || "A"}-001.`}>
          <Input
            id="q-prefix"
            value={effectivePrefix}
            onChange={(e) => {
              setPrefixTouched(true);
              setPrefix(e.target.value.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase());
            }}
            required
            className="font-wide font-bold uppercase"
          />
        </Field>
        <Field label="Counters" htmlFor="q-counters" hint="Desks serving this queue.">
          <Input
            id="q-counters"
            type="number"
            min={1}
            max={10}
            value={counters}
            onChange={(e) => setCounters(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
            required
          />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-red-wash px-3 py-2 text-sm text-red">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={loading}>
          {initial ? "Save changes" : "Create queue"}
        </Button>
      </div>
    </form>
  );
}
