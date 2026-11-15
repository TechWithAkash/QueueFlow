import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { addToken, getSnapshot } from "@/lib/queue-service";
import { tokenSchema } from "@/lib/validation";

export const POST = authed<{ id: string }>(async (req, { params, session }) => {
  const input = await parseBody(req, tokenSchema);
  const token = await addToken(session.userId, params.id, input);
  return NextResponse.json({ token, snapshot: await getSnapshot(session.userId, params.id) }, { status: 201 });
});
