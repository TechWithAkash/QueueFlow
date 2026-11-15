import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { Token } from "@/lib/models";
import { getSnapshot, moveToken, tokenAction } from "@/lib/queue-service";
import { tokenPatchSchema } from "@/lib/validation";

export const PATCH = authed<{ id: string }>(async (req, { params, session }) => {
  const body = await parseBody(req, tokenPatchSchema);
  if (body.action === "move") await moveToken(session.userId, params.id, { direction: body.direction });
  else if (body.action === "reorder") await moveToken(session.userId, params.id, { beforeId: body.beforeId });
  else await tokenAction(session.userId, params.id, body.action);
  const t = await Token.findById(params.id).select({ queue: 1 }).lean<{ queue: unknown }>();
  return NextResponse.json({ snapshot: await getSnapshot(session.userId, String(t!.queue)) });
});
