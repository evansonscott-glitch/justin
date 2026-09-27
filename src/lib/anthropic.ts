import Anthropic from "@anthropic-ai/sdk";

export const FAST_MODEL = process.env.FAST_MODEL || "claude-haiku-4-5";
export const CHAT_MODEL = process.env.CHAT_MODEL || "claude-opus-5";

let client: Anthropic | null = null;

/** True when the app can call Claude. Without a key, search falls back to keyword parsing and chat is disabled. */
export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}
