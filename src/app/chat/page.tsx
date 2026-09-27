"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { getSessionId, resetSessionId } from "@/components/session";
import { GREETING } from "@/lib/copy";
import type { ProjectCard as Card } from "@/lib/types";

interface Msg {
  from: "me" | "justin";
  text: string;
  cards?: Card[];
}

const URL_RE = /(https?:\/\/[^\s)]+)/g;

function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([{ from: "justin", text: GREETING }]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const sessionRef = useRef("");
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Each visit to the chat starts a fresh conversation with a new random session id.
    sessionRef.current = resetSessionId("justin-chat-session");
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy || ended) return;
    setDraft("");
    setMessages((m) => [...m, { from: "me", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionRef.current || getSessionId("justin-chat-session"), text }),
      });
      const data = (await res.json()) as { replies: { text: string; cards?: Card[]; ended?: boolean }[] };
      setMessages((m) => [...m, ...data.replies.map((r) => ({ from: "justin" as const, text: r.text, cards: r.cards }))]);
      if (data.replies.some((r) => r.ended)) setEnded(true);
    } catch {
      setMessages((m) => [...m, { from: "justin", text: "Sorry, I couldn't reach the server. Please try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat">
      <div className="thread" ref={threadRef}>
        {messages.map((m, i) => (
          <Fragment key={i}>
            <div className={`row ${m.from}`}>
              {m.from === "justin" && <span className="avatar">J</span>}
              <div className="bubble">
                <Linkified text={m.text} />
              </div>
            </div>
            {m.cards && m.cards.length > 0 && (
              <div className="link-cards">
                {m.cards.map((c) => (
                  <ProjectCard key={c.id} project={c} />
                ))}
              </div>
            )}
          </Fragment>
        ))}
        {busy && <div className="typing">Justin is typing…</div>}
      </div>
      {ended ? (
        <div className="ended">This conversation has ended.</div>
      ) : (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Text Justin"
            aria-label="Message"
            maxLength={1000}
            enterKeyHint="send"
          />
          <button className="btn" type="submit" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}
