import { NextResponse } from "next/server";
import { z } from "zod";
import { authed } from "@/lib/api";
import { getAnalytics } from "@/lib/analytics-service";

const Range = z.enum(["today", "7d", "30d"]).catch("7d");

export const GET = authed(async (req, { session }) => {
  const url = new URL(req.url);
  const range = Range.parse(url.searchParams.get("range"));
  const queue = url.searchParams.get("queue") || null;
  return NextResponse.json(await getAnalytics(session.userId, range, queue));
});
