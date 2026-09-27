import type { InboundMessage, MessagingChannel, OutboundReply } from "./channel";

/**
 * Web chat: each HTTP request delivers one inbound message and collects whatever the handler
 * sends back for that session during the request.
 */
export class WebChatChannel implements MessagingChannel {
  private handler: ((msg: InboundMessage) => Promise<void>) | null = null;
  private outbox = new Map<string, OutboundReply[]>();

  receive(handler: (msg: InboundMessage) => Promise<void>): void {
    this.handler = handler;
  }

  async send(sessionId: string, reply: OutboundReply): Promise<void> {
    const queue = this.outbox.get(sessionId) ?? [];
    queue.push(reply);
    this.outbox.set(sessionId, queue);
  }

  async deliver(msg: InboundMessage): Promise<OutboundReply[]> {
    if (!this.handler) throw new Error("WebChatChannel has no handler; call receive() first");
    this.outbox.set(msg.sessionId, []);
    try {
      await this.handler(msg);
      return this.outbox.get(msg.sessionId) ?? [];
    } finally {
      this.outbox.delete(msg.sessionId);
    }
  }
}
