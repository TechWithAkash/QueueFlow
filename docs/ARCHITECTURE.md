# Architecture

QueueFlow is one Next.js app: React pages for the UI and route handlers under `src/app/api` for the JSON API, both talking to MongoDB through a small service layer.

```
Browser (console, board, tracker, dashboard)
   │  fetch JSON                 ▲ Server-Sent Events ("something changed")
   ▼                             │
Route handlers  src/app/api/**   │  sseResponse()
   │ handler()/authed(): auth, Zod validation, error → JSON
   ▼                             │
Services  src/lib/queue-service.ts, analytics-service.ts
   │ every mutation writes an event row
   ▼                             │
MongoDB: users · queues · tokens · events ──change stream──┘
```

## Data model

| Collection | Key fields | Notes |
| --- | --- | --- |
| `users` | email (unique), passwordHash | bcrypt, cost 10 |
| `queues` | owner, name, prefix, counters, `nextNumber`, `numberDay` | `numberDay` is the local date the counter belongs to |
| `tokens` | queue, number, code, status, `position`, priority, publicKey, createdAt / calledAt / completedAt / cancelledAt | Index `{queue, status, position}` serves the waiting list |
| `events` | queue, token, type, counter, at | Activity feed, display-board "last call", and the real-time feed |

Token lifecycle:

```
waiting ──call next──▶ serving ──done──▶ served
   │                      └──no-show──▶ no_show ─┐
   └──cancel──▶ cancelled ────────────restore────┴──▶ waiting (same position)
```

Timestamps on the token are the source of truth for analytics: wait = `calledAt − createdAt`, service time = `completedAt − calledAt`.

## Decisions worth explaining

### Ordering: fractional positions
Each waiting token has a numeric `position`, and the list is sorted by it. Moving a token sets its position to the midpoint of its new neighbours, so a move is **one write to one document**. Renumbering everyone (`0,1,2,3…`) would rewrite the whole list on every move and race with other writers. If two neighbours get too close for a float midpoint (after ~50 moves into the same gap), the queue is rebalanced to evenly spaced positions. See `src/lib/ordering.ts` and its tests.

Priority tokens are inserted after the last waiting priority token and before the first normal one.

### Concurrency
- **Call next** is a single `findOneAndUpdate({status: "waiting"}, {$set: {status: "serving"}}, {sort: {position: 1}})`. MongoDB applies it atomically, so two counters pressing the button at the same moment always get different tokens. An integration test fires three calls in parallel to prove it.
- **Token numbers** come from one atomic pipeline update on the queue: `nextNumber = numberDay == today ? nextNumber + 1 : 2`. This both reserves a number and restarts numbering at `001` on a new day, with no read-then-write race. Tested with 25 parallel adds.
- **Status changes** (cancel, done, no-show, restore) are conditional updates: `updateOne({_id, status: {$in: allowedFrom}}, …)`. A stale screen trying to cancel a token that was just called gets a clear `409 "A-004 is being served"` instead of corrupting state.

### Real time
Every mutation inserts an `events` row. Each server instance opens **one** MongoDB change stream on `events` and fans inserts out to its open SSE connections through an in-memory `EventEmitter`. Because the database is the bus, a token called on instance A updates a TV connected to instance B, which matters on serverless hosts. Messages only say "queue X changed", and clients refetch the snapshot, so a missed message can't leave a screen wrong. Clients also poll slowly and refetch on reconnect or when the tab becomes visible. If change streams aren't available (standalone MongoDB), it falls back to in-process events.

SSE rather than WebSockets: the data only flows server → client, it works over plain HTTP through proxies, the browser reconnects automatically, and it runs in ordinary route handlers.

### Optimistic UI
Reorders update the list immediately and roll back if the server refuses. Mutations return the fresh queue snapshot, which replaces local state, so the console doesn't wait for the SSE round trip.

### Analytics
`src/lib/stats.ts` contains pure functions (no database), which makes them easy to test:
- **Queue length over time** uses a sweep line: +1 when a token joins, −1 when it is called or cancelled. Each bucket reports the time-weighted average length and the peak.
- **Wait percentiles** (median, p90) because averages hide the people who waited an hour. "9 in 10 called within" is p90 in plain words.
- **Comparisons** against the previous period of the same length ("same time yesterday" for Today).
- **Heatmap** of average arrivals per weekday × hour in the clinic's time zone.

`analytics-service.ts` loads the tokens for the range plus the previous period with one indexed query and runs those functions.

### AI insights, with a fallback
The dashboard sends a compact digest of the stats (never patient names or phone numbers) to Gemini, using structured output validated by a Zod schema. If no API key is set, the call fails, or the model declines, rule-based insights are returned in the same shape, so the panel always works and says which source wrote it.

### Security
- Passwords hashed with bcrypt. Sessions are HS256 JWTs in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production).
- Every query is scoped by `owner`, so a manager can't read or change another manager's queues: they get a 404, not a 403, so ids can't be probed.
- Public pages (board, tracker) use separate endpoints that return no names or phone numbers. Trackers are addressed by a random 12-character `publicKey`, not the database id.
- Input validated with Zod at the API boundary. Login, registration and demo login are rate-limited per IP.

### Time zones
"Today", daily numbering and the heatmap use `APP_TIMEZONE` (default Asia/Kolkata) via `Intl`, not the server's clock zone, so a Vercel server running in UTC still restarts numbering at local midnight.

## What I'd do next

- Move the rate limiter to Redis (it's per-instance memory today).
- SMS/WhatsApp "you're next" notifications using the optional phone number.
- Staff roles (front desk vs. admin) and multiple clinics per account.
- Appointment slots that merge into the walk-in queue.
- Archive old tokens into daily summary rows so analytics stay fast over years.

## Testing

`npm test` runs:
- `tests/ordering.test.ts`: midpoints, rebalancing threshold, priority insertion, ETA.
- `tests/stats.test.ts`: KPIs, percentiles, the sweep-line queue length, wait buckets.
- `tests/time.test.ts`: local-day boundaries.
- `tests/queue-service.test.ts`: real MongoDB (in-memory replica set). Daily numbering, 25 concurrent adds, 3 concurrent calls, reorder and drag-drop, rebalancing after 80 moves, cancel → undo restores the position, ownership isolation.
