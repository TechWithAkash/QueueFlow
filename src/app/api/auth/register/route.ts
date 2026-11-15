import { NextResponse } from "next/server";
import { ApiError, handler, parseBody } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { User } from "@/lib/models";
import { rateLimit } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validation";

export const POST = handler(async (req) => {
  rateLimit(req, "register", 10);
  const { name, email, password } = await parseBody(req, registerSchema);
  if (await User.exists({ email })) throw new ApiError(409, "An account with this email already exists");
  const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
  await createSession({ userId: String(user._id), name, email, isDemo: false });
  return NextResponse.json({ ok: true }, { status: 201 });
});
