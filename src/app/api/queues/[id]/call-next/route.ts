import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { callNext, getSnapshot } from "@/lib/queue-service";
import { callNextSchema } from "@/lib/validation";

export const POST = authed<{ id: string }>(async (req, { params, session }) => {
  const { counter } = await parseBody(req, callNextSchema);
  const token = await callNext(session.userId, params.id, counter);
  return NextResponse.json({ token, snapshot: await getSnapshot(session.userId, params.id) });
});
