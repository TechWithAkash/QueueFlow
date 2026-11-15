import { handler } from "@/lib/api";
import { getTracker } from "@/lib/queue-service";
import { sseResponse } from "@/lib/realtime";

export const maxDuration = 300;

export const GET = handler<{ key: string }>(async (req, { params }) => {
  const t = await getTracker(params.key);
  return sseResponse(req, t.queueId);
});
