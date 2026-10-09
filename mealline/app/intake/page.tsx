"use client";

import { useEffect, useRef, useState } from "react";

interface Msg { from: "assistant" | "user" | "system"; text: string }
interface TurnResponse {
  step: string; language: string; reply: string; done: boolean;
  handoff: { mode: string; reason: string } | null;
  caseNumber?: string; statusLinkPath?: string; error?: string;
}

export default function IntakePage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [statusLink, setStatusLink] = useState<string | null>(null);
  const [caseNumber, setCaseNumber] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  async function send(text: string | null) {
    setBusy(true);
    try {
      const res = await fetch("/api/intake/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text }),
      });
      const data = (await res.json()) as TurnResponse;
      if (data.error) {
        setMessages((m) => [...m, { from: "system", text: `Error: ${data.error}. Please reload to start over.` }]);
        setDone(true);
        return;
      }
      if (text !== null) setMessages((m) => [...m, { from: "user", text }]);
      setMessages((m) => [...m, { from: "assistant", text: data.reply }]);
      if (data.handoff) {
        setMessages((m) => [...m, {
          from: "system",
          text: data.handoff!.mode === "transfer"
            ? "A staff member will join (voice calls only)."
            : "A staff member will follow up with you.",
        }]);
      }
      if (data.done) {
        setDone(true);
        if (data.caseNumber) setCaseNumber(data.caseNumber);
        if (data.statusLinkPath) setStatusLink(data.statusLinkPath);
      }
    } finally {
      setBusy(false);
      setInput("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  useEffect(() => {
    // Open a draft session, then ask the first question.
    fetch("/api/intake/session", { method: "POST" })
      .then(() => send(null))
      .catch(() => setMessages([{ from: "system", text: "Could not start. Please reload." }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h1>Request pantry delivery</h1>
      <p className="muted">
        Answer one question at a time. You can type in English or Vietnamese.
        Type <strong>person</strong> (or <strong>gặp nhân viên</strong>) at any
        time to reach a staff member. Nothing here creates a delivery until
        staff review and approve it.
      </p>

      <div className="card">
        <div aria-live="polite" aria-atomic="false" ref={liveRef}>
          <ul className="chat-log">
            {messages.map((m, i) => (
              <li key={i} className={`msg ${m.from}`}>{m.text}</li>
            ))}
            {messages.length === 0 && (
              <li className="msg assistant">Starting…</li>
            )}
          </ul>
        </div>

        {!done ? (
          <form
            onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) send(input.trim()); }}
          >
            <label htmlFor="intake-input">Your answer</label>
            <input
              id="intake-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoComplete="off"
              maxLength={2000}
              disabled={busy}
              aria-describedby="intake-hint"
            />
            <p id="intake-hint" className="muted">
              Press Enter to send. Say “repeat” to hear the question again,
              “correct” to change an answer.
            </p>
            <button type="submit" disabled={busy || !input.trim()}>
              {busy ? "Sending…" : "Send"}
            </button>
          </form>
        ) : (
          <div className="notice" role="status">
            <p><strong>Request received{caseNumber ? ` — ${caseNumber}` : ""}.</strong></p>
            {statusLink ? (
              <p>
                Your secure status link (keep it private):<br />
                <a className="mono" href={statusLink}>{statusLink}</a>
              </p>
            ) : (
              <p>We will contact you with next steps using your chosen method.</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
