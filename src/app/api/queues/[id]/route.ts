import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { deleteQueue, getSnapshot, updateQueue } from "@/lib/queue-service";
import { queueUpdateSchema } from "@/lib/validation";

type P = { id: string };

export const GET = authed<P>(async (_req, { params, session }) =>
  NextResponse.json(await getSnapshot(session.userId, params.id)),
);

export const PATCH = authed<P>(async (req, { params, session }) => {
  const input = await parseBody(req, queueUpdateSchema);
  await updateQueue(session.userId, params.id, input);
  return NextResponse.json(await getSnapshot(session.userId, params.id));
});

export const DELETE = authed<P>(async (_req, { params, session }) => {
  await deleteQueue(session.userId, params.id);
  return NextResponse.json({ ok: true });
});
