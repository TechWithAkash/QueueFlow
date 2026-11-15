# QueueFlow

Token queues for busy clinic front desks. A manager runs the queue from one screen, the waiting room watches a TV board that calls tokens out loud, and every patient can follow their place in line on their phone from a QR code.

**Live demo:** _add your Vercel URL here_ · click **Open the demo clinic** to try it with 30 days of realistic history, no sign-up.

## What it does

| Assignment requirement | Where it lives |
| --- | --- |
| Manager logs in | Email/password accounts (bcrypt + signed HTTP-only JWT cookie), plus one-click demo login |
| Create queues with a name | Queues page: name, token prefix (A, L, P…) and number of counters |
| Add a person → token | Console sidebar: name, optional phone/note, priority. Issues `A-001`, `A-002`… restarting every day |
| List of waiting tokens | Console, live-updating across every open screen |
| Move tokens up and down | Arrow buttons, keyboard, or drag and drop |
| Assign the top token for service | "Call next" per counter. Two counters calling at once never get the same token |
| Cancel a token | Cancel with an **Undo** toast that puts it back in the same place |
| Dashboard: wait times, queue length trends | KPIs vs the previous period, queue length over time, wait trend, arrivals vs served, wait distribution, busiest-times heatmap, per-queue table, CSV export |

Beyond the brief:

- **Waiting-room display** (`/display/:id`): full-screen board for a TV, with a chime and a spoken announcement ("Token A 0 4 3, please go to counter 2") when a token is called.
- **Patient tracker** (`/t/:key`): scan the QR on a token to see how many people are ahead and an estimated wait. The phone vibrates when it's your turn. Shows no personal data.
- **Multiple counters** per queue, with recall and no-show, and per-counter service timers.
- **Priority tokens** (elderly, emergencies) join behind other priority tokens but ahead of everyone else.
- **"What to act on"**: the dashboard turns the numbers into a short list of recommendations (e.g. "Open 1 more counter for Lab & Diagnostics during peak hours"). With `GEMINI_API_KEY` set, Gemini writes them from the aggregated stats; without it, built-in rules do.
- **Real time** over Server-Sent Events, backed by MongoDB change streams, so it keeps working across several server instances.
- Keyboard shortcuts in the console: <kbd>N</kbd> new token, <kbd>C</kbd> call next.
- Light and dark themes, responsive down to phone width, respects reduced motion.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Open the demo clinic**.

`npm run dev` starts a local MongoDB replica set on port 27018 (data kept in `.data/`) alongside Next.js, so no database setup is needed. To use your own database instead, set `MONGODB_URI` in `.env.local`.

### Environment variables

See [`.env.example`](.env.example).

| Variable | Needed for | Notes |
| --- | --- | --- |
| `MONGODB_URI` | Production | Must be a replica set (any MongoDB Atlas cluster is) for change streams |
| `JWT_SECRET` | Production | Long random string, e.g. `openssl rand -base64 32` |
| `GEMINI_API_KEY` | Optional | Turns on Gemini-written dashboard insights |
| `APP_TIMEZONE` | Optional | Defaults to `Asia/Kolkata`. Controls "today", daily numbering and the heatmap |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local MongoDB + Next.js dev server |
| `npm test` | Unit tests (ordering, statistics, time zones) and integration tests against an in-memory MongoDB (concurrent calls, daily numbering, reorder, undo) |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |

## Deploy (Vercel + MongoDB Atlas)

1. Create a free MongoDB Atlas cluster, add a database user, allow access from anywhere (`0.0.0.0/0`), and copy the connection string.
2. Import this repository in Vercel.
3. Add `MONGODB_URI` and `JWT_SECRET` (and optionally `GEMINI_API_KEY`) in the project's environment variables, then deploy.

## Tech

Next.js 16 (App Router, React 19, Cache Components) · TypeScript · Tailwind CSS 4 · MongoDB with Mongoose · Zod · dnd-kit · Recharts · Google Gen AI SDK (Gemini) · Vitest.

How it works, and why it's built this way: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
