import "server-only";
import { connection, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z, ZodError } from "zod";
import { connectDB } from "./db";
import { getSession, type Session } from "./auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new ApiError(404, `${what} not found`);

export function toObjectId(id: string, what = "Resource"): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw notFound(what);
  return new Types.ObjectId(id);
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
  return schema.parse(body);
}

function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const field = first?.path.join(".");
    return NextResponse.json(
      { error: first?.message ?? "Invalid input", field: field || undefined },
      { status: 400 },
    );
  }
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: connects the DB and turns thrown errors into JSON responses. */
export function handler<P = Record<string, string>>(
  fn: (req: Request, ctx: { params: P }) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    // API responses are always per-request; never prerender them at build time.
    // (Called outside the try so Next's prerender bail-out isn't turned into a 500.)
    await connection();
    try {
      await connectDB();
      return await fn(req, { params: await ctx.params });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Like `handler`, but rejects unauthenticated requests with 401. */
export function authed<P = Record<string, string>>(
  fn: (req: Request, ctx: { params: P; session: Session }) => Promise<Response>,
) {
  return handler<P>(async (req, ctx) => {
    const session = await getSession();
    if (!session) throw new ApiError(401, "Please log in to continue");
    return fn(req, { ...ctx, session });
  });
}
