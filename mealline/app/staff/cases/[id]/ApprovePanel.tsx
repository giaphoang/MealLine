"use client";

import { useState } from "react";

interface Option { id: string; label: string; windowStart: string; windowEnd: string; remaining: number; capacityTotal: number; note: string | null }

export default function ApprovePanel(props: {
  caseId: string; version: number; status: string;
  options: Option[]; canApprove: boolean; staffName: string;
}) {
  const [optionId, setOptionId] = useState(props.options[0]?.id ?? "");
  const [areaOk, setAreaOk] = useState(false);
  const [rulesOk, setRulesOk] = useState(false);
  const [idemKey] = useState(() => `key_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState("fulfilled");
  const [reason, setReason] = useState("");

  async function post(path: string, body: unknown) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch(path, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg({ kind: "ok", text: `Done. ${data.bookingId ? `Booking ${data.bookingId.slice(0, 18)}…` : ""}${data.deduped ? " (duplicate suppressed)" : ""}` });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        const hint = data.error === "stale_version"
          ? " Someone changed this case — reload to see the latest version."
          : data.error === "no_capacity" ? " That slot just filled. Pick another option or mark no-capacity." : "";
        setMsg({ kind: "err", text: `Failed: ${data.error}.${hint}` });
      }
    } finally { setBusy(false); }
  }

  const claim = () => post(`/api/staff/cases/${props.caseId}/claim`, {});
  const approve = () => post(`/api/staff/cases/${props.caseId}/approve`, {
    optionId, expectedVersion: props.version, idempotencyKey: idemKey,
    checks: { serviceAreaVerified: areaOk, rulesVerified: rulesOk },
  });
  const noCapacity = async () => {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/staff/cases/${props.caseId}/approve`, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "No suitable slot available." }),
    });
    setBusy(false);
    if (res.ok) { setMsg({ kind: "ok", text: "Marked for follow-up. Case stays visible." }); setTimeout(() => window.location.reload(), 1200); }
    else setMsg({ kind: "err", text: "Could not update the case." });
  };
  const recordOutcome = () => post(`/api/staff/cases/${props.caseId}/outcome`, { outcome, reason });

  return (
    <section className="card" aria-label="Staff actions">
      <h2>Staff actions</h2>
      {msg && <div className={msg.kind === "ok" ? "notice" : "alert"} role="status">{msg.text}</div>}

      <button type="button" className="secondary" onClick={claim} disabled={busy}>Claim case</button>

      {props.canApprove && (props.status === "needs_review" || props.status === "awaiting_followup") && (
        <>
          <h3>Approve a delivery option</h3>
          <p className="muted">
            Case version <strong className="mono">{props.version}</strong>. Approval rechecks
            capacity and saves the booking atomically. Your idempotency key:{" "}
            <span className="mono">{idemKey}</span>
          </p>
          <label htmlFor="opt">Delivery option</label>
          <select id="opt" value={optionId} onChange={(e) => setOptionId(e.target.value)} disabled={busy}>
            {props.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} — {o.remaining}/{o.capacityTotal} left{o.remaining === 0 ? " (FULL)" : ""}
              </option>
            ))}
          </select>
          {props.options.length === 0 && (
            <p className="alert">No delivery option available. Use “No capacity” below — the case stays visible.</p>
          )}
          <div className="checkbox-row">
            <input id="chk-area" type="checkbox" checked={areaOk} onChange={(e) => setAreaOk(e.target.checked)} />
            <label htmlFor="chk-area">I verified the address is in the service area.</label>
          </div>
          <div className="checkbox-row">
            <input id="chk-rules" type="checkbox" checked={rulesOk} onChange={(e) => setRulesOk(e.target.checked)} />
            <label htmlFor="chk-rules">I verified the program rules for this request.</label>
          </div>
          <button type="button" onClick={approve}
            disabled={busy || !optionId || !areaOk || !rulesOk}>
            {busy ? "Approving…" : "Approve option"}
          </button>
          <button type="button" className="secondary" onClick={noCapacity} disabled={busy}>
            No capacity — schedule follow-up
          </button>
        </>
      )}
      {!props.canApprove && (
        <p className="muted">Your role ({props.staffName}) can view and claim cases. Only coordinators approve.</p>
      )}

      {(props.status === "approved" || props.status === "awaiting_followup") && (
        <>
          <h3>Record outcome</h3>
          <p className="muted">Approval is not fulfillment. Record the actual outcome explicitly.</p>
          <label htmlFor="outcome">Outcome</label>
          <select id="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="fulfilled">Fulfilled — food delivered</option>
            <option value="closed_without_service">Closed without service</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <label htmlFor="reason">Reason / note</label>
          <input id="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <button type="button" className="secondary" onClick={recordOutcome} disabled={busy}>Record outcome</button>
        </>
      )}
    </section>
  );
}
