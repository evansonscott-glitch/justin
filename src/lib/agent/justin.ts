import Anthropic from "@anthropic-ai/sdk";
import { anthropic, CHAT_MODEL, hasAnthropicCredentials } from "../anthropic";
import type { OutboundReply } from "../messaging/channel";
import type { ProjectCard } from "../types";
import { systemPrompt } from "./prompt";
import { runTool, TOOLS, type ToolContext } from "./tools";

const MAX_TOOL_ROUNDS = 6;
const CHAT_EFFORT = (process.env.CHAT_EFFORT as "low" | "medium" | "high" | undefined) ?? "medium";

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface JustinTurn {
  reply: OutboundReply;
  toolCalls: { name: string; input: unknown; isError: boolean }[];
  /** Raw tool results for this turn, used by the eval's fact check. Not stored. */
  toolOutputs: string[];
}

/** One conversational turn: runs the tool loop and returns Justin's reply plus the tool calls it made. */
export async function runJustin(
  sessionId: string,
  history: HistoryTurn[],
  userText: string,
  opts: { channel?: "chat" | "eval" } = {},
): Promise<JustinTurn> {
  if (!hasAnthropicCredentials()) {
    return {
      reply: { text: "Justin's chat isn't connected yet (no Anthropic API key is set). The finder still works." },
      toolCalls: [],
      toolOutputs: [],
    };
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.text })),
    { role: "user", content: userText },
  ];
  const ctx: ToolContext = { sessionId, seenProjects: new Map(), ended: false, channel: opts.channel ?? "chat" };
  const toolCalls: JustinTurn["toolCalls"] = [];
  const toolOutputs: string[] = [];
  let finalText = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await anthropic().beta.messages.create({
      model: CHAT_MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
      output_config: { effort: CHAT_EFFORT },
      // Server-side refusal fallback, routed by refusal category.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      finalText = "Sorry, I can't help with that one. I can help you find a service project on JustServe.org, though.";
      break;
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      finalText = text;
      break;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (tu) => {
        try {
          const out = JSON.stringify(await runTool(tu.name, tu.input, ctx));
          toolCalls.push({ name: tu.name, input: tu.input, isError: false });
          toolOutputs.push(out);
          return { type: "tool_result" as const, tool_use_id: tu.id, content: out };
        } catch (err) {
          toolCalls.push({ name: tu.name, input: tu.input, isError: true });
          return {
            type: "tool_result" as const,
            tool_use_id: tu.id,
            is_error: true,
            content: err instanceof Error ? err.message : "Tool failed",
          };
        }
      }),
    );
    messages.push({ role: "user", content: results });
    if (text) finalText = text;
  }

  if (!finalText) finalText = "Sorry, I got stuck on that one. Could you try asking another way?";
  return { reply: { text: finalText, cards: cardsMentioned(finalText, ctx.seenProjects), ended: ctx.ended }, toolCalls, toolOutputs };
}

/** Show rich cards only for projects whose link or id Justin actually used in the reply (max 3). */
function cardsMentioned(text: string, seen: Map<string, ProjectCard>): ProjectCard[] {
  return [...seen.values()].filter((p) => text.includes(p.url) || text.includes(p.id)).slice(0, 3);
}
