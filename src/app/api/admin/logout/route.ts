import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/admin", req.url), 303);
  res.cookies.delete(ADMIN_COOKIE);
  return res;
}
