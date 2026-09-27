import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { hourlyRefresh } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Hourly: refresh the pilot area from JustServe.org, then tag new or changed projects. */
export async function GET(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await hourlyRefresh());
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "refresh failed" }, { status: 500 });
  }
}
