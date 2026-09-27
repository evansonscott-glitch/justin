import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";

/** Records which result a finder user opened, on their most recent search. */
export async function POST(req: NextRequest) {
  const { sessionId, projectId } = (await req.json()) as { sessionId?: string; projectId?: string };
  if (!sessionId || !projectId) return NextResponse.json({ ok: false }, { status: 400 });
  await db().query(
    `update search_log set clicked_id = $2
     where id = (select id from search_log where session_id = $1 order by created_at desc limit 1)`,
    [sessionId, projectId],
  );
  return NextResponse.json({ ok: true });
}
