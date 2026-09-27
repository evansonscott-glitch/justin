import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { nightly } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Nightly: listing-health report and the 90-day chat purge. */
export async function GET(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await nightly());
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "nightly failed" }, { status: 500 });
  }
}
