import { NextResponse, type NextRequest } from "next/server";
import { searchProjects } from "@/lib/search/search";

export const dynamic = "force-dynamic";

function num(v: string | null): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** GET /api/search?q=&lat=&lng=&date_from=&date_to=&tags=&group=&session= (brief §3, Milestone 3) */
export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams;
  try {
    const result = await searchProjects({
      q: s.get("q") ?? "",
      lat: num(s.get("lat")),
      lng: num(s.get("lng")),
      dateFrom: s.get("date_from") || undefined,
      dateTo: s.get("date_to") || undefined,
      tags: s.get("tags")?.split(",").filter(Boolean),
      groupSize: num(s.get("group")),
      sessionId: s.get("session") || undefined,
      channel: "finder",
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
