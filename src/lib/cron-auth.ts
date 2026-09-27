import crypto from "node:crypto";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET, cron routes stay closed. */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
