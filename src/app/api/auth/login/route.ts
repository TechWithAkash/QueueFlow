import { NextResponse } from "next/server";
import { ApiError, handler, parseBody } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";
import { User, type UserDoc } from "@/lib/models";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export const POST = handler(async (req) => {
  rateLimit(req, "login", 20);
  const { email, password } = await parseBody(req, loginSchema);
  const user = await User.findOne({ email }).lean<UserDoc>();
  // Same message for unknown email and wrong password (no account enumeration).
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new ApiError(401, "Incorrect email or password");
  }
  await createSession({ userId: String(user._id), name: user.name, email: user.email, isDemo: user.isDemo });
  return NextResponse.json({ ok: true });
});
