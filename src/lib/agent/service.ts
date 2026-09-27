import { db } from "../db";
import { WebChatChannel } from "../messaging/webchat";
import { runJustin, type HistoryTurn } from "./justin";

const HISTORY_TURNS = 12;

async function loadHistory(sessionId: string): Promise<HistoryTurn[]> {
  const { rows } = await db().query<{ role: "user" | "assistant"; text: string }>(
    `select role, text from (
       select role, text, created_at from chat_messages
       where session_id = $1 and role in ('user', 'assistant') and created_at > now() - interval '90 days'
       order by created_at desc limit $2
     ) recent order by created_at asc`,
    [sessionId, HISTORY_TURNS],
  );
  // History must start with a user turn.
  while (rows.length && rows[0].role !== "user") rows.shift();
  return rows;
}

async function saveMessage(sessionId: string, role: string, text: string, toolCalls: unknown = null) {
  await db().query(`insert into chat_messages (session_id, role, text, tool_calls) values ($1, $2, $3, $4)`, [
    sessionId,
    role,
    text,
    toolCalls ? JSON.stringify(toolCalls) : null,
  ]);
}

/** Wires the web chat channel to the Justin agent. A future TwilioChannel wires up the same way. */
function createWebChat(): WebChatChannel {
  const channel = new WebChatChannel();
  channel.receive(async ({ sessionId, text }) => {
    const history = await loadHistory(sessionId);
    const { reply, toolCalls } = await runJustin(sessionId, history, text);
    await saveMessage(sessionId, "user", text);
    await saveMessage(sessionId, "assistant", reply.text, toolCalls);
    await channel.send(sessionId, reply);
  });
  return channel;
}

const g = globalThis as unknown as { justinWebChat?: WebChatChannel };
export function webChat(): WebChatChannel {
  if (!g.justinWebChat) g.justinWebChat = createWebChat();
  return g.justinWebChat;
}
