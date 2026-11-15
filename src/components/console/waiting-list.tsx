"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, GripVertical, QrCode, Star, Users, X } from "lucide-react";
import { formatDuration, since } from "@/lib/client";
import type { TokenDTO } from "@/lib/types";
import { EmptyState, TokenCode } from "../ui";

export function WaitingList({
  tokens,
  now,
  highlight,
  onReorder,
  onMove,
  onCancel,
  onQr,
}: {
  tokens: TokenDTO[];
  now: number;
  highlight: string | null;
  onReorder: (next: TokenDTO[], id: string, beforeId: string | null) => void;
  onMove: (t: TokenDTO, direction: "up" | "down") => void;
  onCancel: (t: TokenDTO) => void;
  onQr: (t: TokenDTO) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = tokens.findIndex((t) => t.id === active.id);
    const to = tokens.findIndex((t) => t.id === over.id);
    const next = arrayMove(tokens, from, to);
    onReorder(next, String(active.id), next[to + 1]?.id ?? null);
  }

  if (!tokens.length) {
    return (
      <EmptyState icon={<Users className="size-8" />} title="Nobody is waiting">
        Add a person with the form, or press N.
      </EmptyState>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "To reorder, press space to pick up a token, use the arrow keys to move it, and space again to drop it.",
        },
      }}
    >
      <SortableContext items={tokens.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ol className="divide-y divide-line">
          {tokens.map((t, i) => (
            <Row
              key={t.id}
              t={t}
              index={i}
              last={i === tokens.length - 1}
              now={now}
              highlight={highlight === t.id}
              onMove={onMove}
              onCancel={onCancel}
              onQr={onQr}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function Row({
  t,
  index,
  last,
  now,
  highlight,
  onMove,
  onCancel,
  onQr,
}: {
  t: TokenDTO;
  index: number;
  last: boolean;
  now: number;
  highlight: boolean;
  onMove: (t: TokenDTO, d: "up" | "down") => void;
  onCancel: (t: TokenDTO) => void;
  onQr: (t: TokenDTO) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
  });
  const waited = since(t.createdAt, now);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "group relative flex items-center gap-3 bg-surface px-3 py-3 sm:px-4",
        isDragging && "z-10 rounded-xl shadow-xl ring-1 ring-line",
        highlight && "animate-flash",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${t.code}`}
        className="hidden cursor-grab touch-none rounded p-1 text-ink-faint hover:text-ink active:cursor-grabbing sm:block"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="tabular w-5 text-right text-sm text-ink-faint">{index + 1}</span>
      <TokenCode code={t.code} tone={index === 0 ? "amber" : "paper"} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          {t.priority ? (
            <Star className="size-3.5 shrink-0 fill-amber text-amber" aria-label="Priority" />
          ) : null}
          <span className="truncate">{t.name}</span>
        </p>
        <p className="flex gap-3 truncate text-xs text-ink-faint">
          <span>Waiting {formatDuration(waited)}</span>
          {t.etaSec != null ? <span>Called in about {formatDuration(t.etaSec)}</span> : null}
          {t.note ? <span className="truncate italic">{t.note}</span> : null}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-100 sm:opacity-60 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <RowBtn label={`Move ${t.code} up`} onClick={() => onMove(t, "up")} disabled={index === 0}>
          <ChevronUp className="size-4" />
        </RowBtn>
        <RowBtn label={`Move ${t.code} down`} onClick={() => onMove(t, "down")} disabled={last}>
          <ChevronDown className="size-4" />
        </RowBtn>
        <RowBtn label={`Show QR code for ${t.code}`} onClick={() => onQr(t)}>
          <QrCode className="size-4" />
        </RowBtn>
        <RowBtn label={`Cancel ${t.code}`} onClick={() => onCancel(t)} danger>
          <X className="size-4" />
        </RowBtn>
      </div>
    </li>
  );
}

function RowBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        "grid size-8 place-items-center rounded-md text-ink-soft disabled:pointer-events-none disabled:opacity-30",
        danger ? "hover:bg-red-wash hover:text-red" : "hover:bg-sunken hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
