import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { getDisplay } from "@/lib/queue-service";


export const GET = handler<{ id: string }>(async (_req, { params }) => NextResponse.json(await getDisplay(params.id)));
