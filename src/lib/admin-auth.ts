import crypto from "node:crypto";

export const ADMIN_COOKIE = "justin_admin";

/** Cookie value derived from ADMIN_PASSWORD; changing the password signs everyone out. */
export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return crypto.createHmac("sha256", pw).update("justin-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function passwordMatches(candidate: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return Boolean(pw) && safeEqual(candidate, pw!);
}

export function isAdminToken(value: string | undefined): boolean {
  const token = adminToken();
  return Boolean(token && value && safeEqual(value, token));
}
