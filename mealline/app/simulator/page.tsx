"use client";

import { useState, useRef } from "react";

interface Turn {
  you: string | null;
  reply: string;
  meta: string;
}

const PRESETS: { name: string; script: string[] }[] = [
  {
    name: "English first-time request",
    script: [
      "English",
      "1234 Grand Avenue, Des Moines, 50312",
      "4 people",
      "weekday mornings",
      "call me at 515-555-0142",
      "please leave at the door",
      "yes",
    ],
  },
  {
    name: "Vietnamese first-time request (text)",
    script: [
      "tiếng Việt",
      "1234 Grand Avenue, Des Moines, 50312",
      "gia đình 5 người",
      "sáng thứ Bảy",
      "gọi cho tôi số 5155550143",
      "để hàng trước cửa",
      "đúng rồi",
    ],
  },
  {
    name: "Correction flow",
    script: [
      "English",
      "999 Wrong Street, Des Moines, 50309",
      "sửa",
      "1234 Grand Avenue, Des Moines, 50309",
      "2",
      "Saturday afternoon",
      "status link",
      "none",
      "yes",
    ],
  },
  {
    name: "Human handoff (gặp nhân viên)",
    script: ["tiếng Việt", "gặp nhân viên"],
  },
  {
    name: "Two failed inputs → callback case",
    script: ["English", "", "asdf qwer zxcv ???"],
  },
];

export default function SimulatorPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function send(input: string | null): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch("/api/sim/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sessionRef.current, input }),
      });
      const d = await res.json();
      if (d.error) {
        setTurns((t) => [...t, { you: input, reply: `ERROR: ${d.error}`, meta: "" }]);
        return true;
      }
      sessionRef.current = d.sessionId;
      setSessionId(d.sessionId);
      setTurns((t) => [...t, {
        you: input,
        reply: d.reply,
        meta: `step=${d.step} lang=${d.language}${d.caseNumber ? ` case=${d.caseNumber}` : ""}${d.statusLinkPath ? ` link=${d.statusLinkPath}` : ""}${d.handoff ? ` handoff=${d.handoff.mode}` : ""}`,
      }]);
      if (d.done) setDone(true);
      return !!d.done;
    } finally { setBusy(false); }
  }

  async function run(script: string[]) {
    setTurns([]); sessionRef.current = null; setSessionId(null); setDone(false);
    // Prime a fresh session; first send(null) gets the greeting.
    await send(null);
    for (const line of script) {
      if (done) break;
      const finished = await send(line === "" ? null : line);
      if (finished) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  function reset() { setTurns([]); sessionRef.current = null; setSessionId(null); setDone(false); }

  return (
    <>
      <h1>Conversation simulator</h1>
      <div className="alert" role="note">
        <strong>SIMULATED.</strong> This runs the same conversation controller as
        the phone line, but no real telephone network is involved. Labeled
        separately from real telephony throughout.
      </div>

      <div className="card">
        <h2>Scripted scenarios</h2>
        {PRESETS.map((p) => (
          <button key={p.name} type="button" className="secondary"
            disabled={busy} onClick={() => run(p.script)}>{p.name}</button>
        ))}
        <button type="button" className="secondary" disabled={busy} onClick={reset}>Reset</button>
      </div>

      <div className="card">
        <h2>Transcript</h2>
        {turns.length === 0 && <p className="muted">Run a script to see the conversation.</p>}
        <ul className="chat-log" aria-live="polite">
          {turns.map((t, i) => (
            <li key={i}>
              {t.you !== null && <div className="msg user">{t.you === "" ? "(silence)" : t.you}</div>}
              <div className="msg assistant" style={{ marginTop: ".4rem" }}>{t.reply}</div>
              {t.meta && <div className="muted mono" style={{ fontSize: ".75rem" }}>{t.meta}</div>}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
