import type { ProjectCard } from "../types";

export interface InboundMessage {
  sessionId: string;
  text: string;
  media?: string[];
}

export interface OutboundReply {
  text: string;
  cards?: ProjectCard[];
  /** True when Justin has ended the conversation (e.g. the user said they're under 18). */
  ended?: boolean;
}

/**
 * Brief §4: every delivery channel sits behind this interface so SMS/iMessage can be added
 * without touching the agent. v0: WebChatChannel. Later: TwilioChannel, SendblueChannel.
 */
export interface MessagingChannel {
  receive(handler: (msg: InboundMessage) => Promise<void>): void;
  send(sessionId: string, reply: OutboundReply): Promise<void>;
}

/** Text channels can't show rich cards, so cards become short text with a link. */
export function cardsAsText(reply: OutboundReply): string {
  if (!reply.cards?.length) return reply.text;
  const lines = reply.cards.map((c) => `• ${c.title}${c.city ? ` (${c.city})` : ""}: ${c.url}`);
  return `${reply.text}\n\n${lines.join("\n")}`;
}
