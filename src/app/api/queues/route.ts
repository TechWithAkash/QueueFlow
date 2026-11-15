import { NextResponse } from "next/server";
import { authed, parseBody } from "@/lib/api";
import { createQueue, listQueues } from "@/lib/queue-service";
import { queueSchema } from "@/lib/validation";

export const GET = authed(async (_req, { session }) => NextResponse.json(await listQueues(session.userId)));

export const POST = authed(async (req, { session }) => {
  const input = await parseBody(req, queueSchema);
  return NextResponse.json(await createQueue(session.userId, input), { status: 201 });
});
