import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { ensureDemoAccount } from "@/lib/seed";

/** One-click demo login. Creates the demo account (with 30 days of realistic history) on first use. */
export const POST = handler(async (req) => {
  rateLimit(req, "demo", 30);
  const user = await ensureDemoAccount();
  await createSession({ userId: String(user._id), name: user.name, email: user.email, isDemo: true });
  return NextResponse.json({ ok: true });
});
