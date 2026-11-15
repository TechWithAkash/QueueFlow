import { ApiError } from "./api";

/**
 * Minimal fixed-window rate limiter (per instance, per IP) for auth endpoints.
 * Good enough to blunt brute-force attempts in a demo; production would use Redis.
 */
const hits = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 10 * 60 * 1000;

export function rateLimit(req: Request, bucket: string, max: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + WINDOW_MS });
    return;
  }
  entry.count++;
  if (entry.count > max) throw new ApiError(429, "Too many attempts. Please wait a few minutes and try again.");
}
