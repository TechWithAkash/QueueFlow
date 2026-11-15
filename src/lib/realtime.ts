import "server-only";
import { EventEmitter } from "node:events";
import { QueueEvent } from "./models";
import { connectDB } from "./db";

/**
 * Real-time fan-out.
 *
 * Every state change writes a row to the `events` collection. We open ONE
 * MongoDB change stream per server instance on that collection and re-emit
 * inserts to in-memory listeners (SSE connections). Because the source of
 * truth is the database, this works across multiple server instances
 * (e.g. serverless). If change streams are unavailable (standalone MongoDB),
 * we fall back to emitting in-process.
 */
type Payload = { queueId: string; type: string };
type State = { emitter: EventEmitter; mode: "idle" | "starting" | "changestream" | "local" };

const g = globalThis as unknown as { __qfRealtime?: State };
const state: State =
  g.__qfRealtime ??
  (g.__qfRealtime = (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    return { emitter, mode: "idle" as const };
  })());

async function ensureStarted() {
  if (state.mode !== "idle") return;
  state.mode = "starting";
  try {
    await connectDB();
    const stream = QueueEvent.watch([{ $match: { operationType: "insert" } }]);
    const markReady = () => {
      state.mode = "changestream";
    };
    stream.on("change", (change: { fullDocument?: { queue?: unknown; type?: string } }) => {
      markReady();
      const doc = change.fullDocument;
      if (!doc?.queue) return;
      state.emitter.emit("event", { queueId: String(doc.queue), type: String(doc.type) } satisfies Payload);
    });
    // The driver reports the cursor is open via one of these, depending on version.
    stream.on("init", markReady);
    stream.on("resumeTokenChanged", markReady);
    stream.on("error", (err) => {
      console.warn("[realtime] change stream unavailable, using in-process events:", err.message);
      state.mode = "local";
      stream.close().catch(() => {});
    });
  } catch (err) {
    console.warn("[realtime] could not start change stream:", (err as Error).message);
    state.mode = "local";
  }
}

/** Called after every mutation. No-op when the change stream will deliver it. */
export function publish(queueId: string, type: string) {
  if (state.mode !== "changestream") state.emitter.emit("event", { queueId, type } satisfies Payload);
}

export function subscribe(queueId: string, fn: (p: Payload) => void): () => void {
  void ensureStarted();
  const listener = (p: Payload) => {
    if (p.queueId === queueId) fn(p);
  };
  state.emitter.on("event", listener);
  return () => state.emitter.off("event", listener);
}

/** Server-Sent Events response that pings the client whenever `queueId` changes. */
export function sseResponse(req: Request, queueId: string): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
      const unsubscribe = subscribe(queueId, (p) => send(`data: ${JSON.stringify(p)}\n\n`));
      const ping = setInterval(() => send(`: ping\n\n`), 20_000);
      // Close before typical serverless limits; EventSource reconnects automatically.
      const lifetime = setTimeout(() => cleanup(), 270_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(ping);
        clearTimeout(lifetime);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
