import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { getTracker } from "@/lib/queue-service";


export const GET = handler<{ key: string }>(async (_req, { params }) => NextResponse.json(await getTracker(params.key)));
