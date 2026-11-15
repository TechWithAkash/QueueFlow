import { handler } from "@/lib/api";
import { getDisplay } from "@/lib/queue-service";
import { sseResponse } from "@/lib/realtime";

export const maxDuration = 300;

export const GET = handler<{ id: string }>(async (req, { params }) => {
  await getDisplay(params.id); // 404 for unknown queues
  return sseResponse(req, params.id);
});
