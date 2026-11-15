import { authed } from "@/lib/api";
import { getSnapshot } from "@/lib/queue-service";
import { sseResponse } from "@/lib/realtime";

export const maxDuration = 300;

export const GET = authed<{ id: string }>(async (req, { params, session }) => {
  await getSnapshot(session.userId, params.id); // ownership check
  return sseResponse(req, params.id);
});
