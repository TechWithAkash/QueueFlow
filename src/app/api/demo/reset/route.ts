import { NextResponse } from "next/server";
import { ApiError, authed } from "@/lib/api";
import { resetDemo } from "@/lib/seed";

/** Lets reviewers restore the demo account to its original state. */
export const POST = authed(async (_req, { session }) => {
  if (!session.isDemo) throw new ApiError(403, "Only the demo account can be reset");
  await resetDemo(session.userId);
  return NextResponse.json({ ok: true });
});
