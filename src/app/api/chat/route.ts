import { NextResponse, type NextRequest } from "next/server";
import { webChat } from "@/lib/agent/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SESSION_RE = /^[a-zA-Z0-9-]{8,64}$/;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { sessionId?: string; text?: string };
  const text = body.text?.trim().slice(0, 1000);
  if (!body.sessionId || !SESSION_RE.test(body.sessionId) || !text) {
    return NextResponse.json({ error: "sessionId and text are required" }, { status: 400 });
  }
  try {
    const replies = await webChat().deliver({ sessionId: body.sessionId, text });
    return NextResponse.json({ replies });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { replies: [{ text: "Sorry, something went wrong on my end. Please try again in a moment." }] },
      { status: 500 },
    );
  }
}
