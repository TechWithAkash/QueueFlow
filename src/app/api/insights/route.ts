import { NextResponse } from "next/server";
import { z } from "zod";
import { authed, parseBody } from "@/lib/api";
import { getAnalytics } from "@/lib/analytics-service";
import { aiInsights } from "@/lib/insights";

export const maxDuration = 60;

const Body = z.object({ range: z.enum(["today", "7d", "30d"]).default("7d"), queue: z.string().nullable().optional() });

export const POST = authed(async (req, { session }) => {
  const { range, queue } = await parseBody(req, Body);
  const analytics = await getAnalytics(session.userId, range, queue ?? null);
  return NextResponse.json(await aiInsights(analytics));
});
