import { z } from "zod";
import { authed } from "@/lib/api";
import { exportTokens } from "@/lib/analytics-service";

const Range = z.enum(["today", "7d", "30d"]).catch("7d");

function csvCell(v: unknown) {
  const s = String(v ?? "");
  // Quote when needed; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const GET = authed(async (req, { session }) => {
  const url = new URL(req.url);
  const range = Range.parse(url.searchParams.get("range"));
  const rows = await exportTokens(session.userId, range, url.searchParams.get("queue") || null);
  const header = Object.keys(rows[0] ?? { queue: "", token: "" });
  const csv = [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h as keyof typeof r])).join(","))].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="queueflow-${range}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
