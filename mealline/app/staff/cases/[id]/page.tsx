import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { getStaffSession, STAFF_COOKIE } from "@/lib/auth";
import { getCaseForOrg, getEvents, getRequest, listDeliveryOptions } from "@/lib/cases";
import { getSessionByCaseId, getSessionTurns } from "@/lib/controller";
import { db } from "@/lib/db";
import ApprovePanel from "./ApprovePanel";

function fmtDT(v: string): string {
  try { return new Date(v).toLocaleString(); } catch { return v; }
}

function languageLabel(l: string): string {
  if (l === "vi") return "Vietnamese";
  if (l === "es") return "Spanish";
  return "English";
}

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const staff = await getStaffSession(jar.get(STAFF_COOKIE)?.value);
  if (!staff) redirect("/staff/login");

  const c = await getCaseForOrg(id, staff.orgId);
  if (!c) notFound();

  const [events, request, options] = await Promise.all([
    getEvents(id),
    getRequest(c.request_id),
    listDeliveryOptions(id).catch(() => []),
  ]);
  // Conversation transcript for staff review (best-effort; older cases predate it).
  const voiceSession = await getSessionByCaseId(id).catch(() => null);
  const turns = voiceSession ? await getSessionTurns(voiceSession.id).catch(() => []) : [];
  const bookings = (await db().query(
    `SELECT b.id, b.status, b.idempotency_key, b.created_at, o.label, o.window_start, o.window_end
     FROM bookings b JOIN delivery_options o ON o.id = b.option_id
     WHERE b.case_id = $1 ORDER BY b.created_at DESC`, [id]
  )).rows as Record<string, unknown>[];
  const attempts = (await db().query(
    `SELECT na.channel, na.status, na.error, na.detail, na.created_at
     FROM notification_attempts na JOIN outbox_jobs j ON j.id = na.job_id
     WHERE j.case_id = $1 ORDER BY na.created_at DESC`, [id]
  )).rows as Record<string, unknown>[];

  const f = c.confirmed_fields ?? {};
  const rc = c.rule_check_result as { inServiceArea?: string; notes?: string[] } | null;

  return (
    <>
      <p><a href="/staff">← Back to queue</a></p>
      <h1>Case <span className="mono">{c.case_number}</span>{" "}
        <span className={`status-pill status-${c.status}`}>{c.status.replace(/_/g, " ")}</span>
      </h1>
      <p className="muted">
        Demo provider (synthetic) · version <span className="mono">{c.version}</span> ·{" "}
        {languageLabel(c.preferred_language)} ·{" "}
        opened {fmtDT(c.created_at)}
      </p>

      <section className="card" aria-label="Verified facts">
        <h2>Request details</h2>
        <dl className="kv">
          <dt>Delivery address</dt><dd>{f.address?.raw ?? <em className="muted">unknown</em>}</dd>
          <dt>ZIP</dt><dd>{f.address?.zip ?? <em className="muted">unknown</em>}</dd>
          <dt>Household size</dt><dd>{f.household?.size ?? <em className="muted">unknown</em>}</dd>
          <dt>Availability</dt><dd>{f.availability?.raw ?? <em className="muted">unknown</em>}</dd>
          <dt>Contact preference</dt>
          <dd>{f.contactPreference === "callback"
            ? `Callback${request?.contact_phone ? ` — ${(request.contact_phone as string).replace(/(\d{3})(\d{3})(\d{4})/, "($1) $2-$3")}` : ""}`
            : "Secure status link (no call)"}</dd>
          <dt>Accommodation</dt><dd>{c.accommodation_request ?? "none recorded"}</dd>
          {f.dietaryAvoid && f.dietaryAvoid.length > 0 && (
            <><dt>Foods to avoid</dt><dd>{f.dietaryAvoid.join(", ")}</dd></>
          )}
          {f.equipment && (f.equipment.stove != null || f.equipment.fridge != null || f.equipment.notes) && (
            <><dt>Equipment</dt><dd>
              {[f.equipment.stove ? "stove" : null, f.equipment.fridge ? "fridge" : null, f.equipment.notes]
                .filter(Boolean).join(", ") || "unknown"}
            </dd></>
          )}
          {c.unknowns?.length > 0 && (<><dt>Unknowns</dt><dd>{c.unknowns.join(", ")}</dd></>)}
          {c.original_input && (<><dt>Original wording</dt><dd className="mono">{c.original_input}</dd></>)}
        </dl>
      </section>

      <section className="card" aria-label="Rule check">
        <h2>Program rules &amp; service area</h2>
        <p>
          Service area: <strong>{rc?.inServiceArea ?? "not checked"}</strong>
        </p>
        {rc?.notes?.map((n, i) => <p key={i} className="muted">{n}</p>)}
        <p className="muted">
          Demo policy v1 sets no income, age, disability, or ID requirements.
          Unknowns go to staff review — never automatic rejection.
        </p>
      </section>

      {bookings.length > 0 && (
        <section className="card" aria-label="Bookings">
          <h2>Bookings</h2>
          <ul>
            {bookings.map((b) => (
              <li key={String(b.id)}>
                <strong>{String(b.label)}</strong> — {String(b.status)} ·
                window {fmtDT(String(b.window_start))} – {fmtDT(String(b.window_end))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {attempts.length > 0 && (
        <section className="card" aria-label="Notifications">
          <h2>Notifications (separate from fulfillment)</h2>
          <ul className="timeline">
            {attempts.map((a, i) => (
              <li key={i}>
                {String(a.channel)} — <strong>{String(a.status)}</strong>
                {a.error ? ` (${String(a.error)})` : ""}{" "}
                <span className="muted">{fmtDT(String(a.created_at))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.nourish_managed ? <section className="card" aria-label="MealLine-managed fulfilment"><h2>Review in MealLine</h2>
        <p>This phone request is synchronized to MealLine. Approval, packing, scheduling, changes and delivery completion must be recorded there, not in MealLine’s legacy booking system.</p>
        <p><a href={(process.env.NOURISH_API_URL ?? 'http://127.0.0.1:3003').replace(/\/$/,'')+'/feed/clients'}>Open MealLine household records</a></p>
        {!c.nourish_intake_id&&<p className="muted">Synchronization is pending. The dedicated phone worker must be running; review failed jobs in MealLine → Clients → Phone synchronization.</p>}
      </section> : <ApprovePanel
        caseId={c.id} version={c.version} status={c.status}
        options={options.map((o) => ({
          id: o.id, label: o.label, windowStart: o.window_start, windowEnd: o.window_end,
          remaining: o.capacity_total - o.capacity_reserved,
          capacityTotal: o.capacity_total, note: o.note,
        }))}
        canApprove={staff.role === "coordinator"}
        staffName={staff.role}
      />}

      {c.foodfit_basket && c.foodfit_basket.length > 0 && (
        <section className="card" aria-label="Suggested basket">
          <h2>Suggested basket <span className="muted">(from pantry inventory)</span></h2>
          <p className="muted">
            Matched by FoodFit from the caller's stated needs
            {c.foodfit_visit_code && (
              <> · visit <span className="mono">{c.foodfit_visit_code}</span></>
            )}
          </p>
          <ul>
            {c.foodfit_basket.map((line) => (
              <li key={line.productId}>
                <strong>{line.productName}</strong> — {line.quantity} {line.unit}
              </li>
            ))}
          </ul>
          <p className="muted">
            <small>
              Suggested from live pantry stock; staff review before packing.
              Draft only — nothing reserved.
            </small>
          </p>
        </section>
      )}

      {turns.length > 0 && voiceSession && (
        <section className="card" aria-label="Conversation transcript">
          <h2>Conversation transcript &amp; summary</h2>
          <p className="muted">
            {voiceSession.channel === "voice" ? "Phone call" : voiceSession.channel} in{" "}
            {languageLabel(voiceSession.language)} · {turns.length} turn{turns.length === 1 ? "" : "s"} ·{" "}
            outcome: <strong>{voiceSession.status.replace(/_/g, " ")}</strong>
            {turns.length > 1 && (
              <> · about {Math.max(1, Math.round(
                (new Date(turns[turns.length - 1].created_at).getTime() -
                 new Date(turns[0].created_at).getTime()) / 60000
              ))} min</>
            )}
          </p>
          <ol className="transcript">
            {turns.map((trn) => (
              <li key={trn.turn_index}>
                <div className="muted">
                  <small>{String(trn.step).replace(/_/g, " ")} · {fmtDT(String(trn.created_at))}</small>
                </div>
                {trn.input && (
                  <p><strong>Caller:</strong> {trn.input}</p>
                )}
                <p><strong>MealLine:</strong> {trn.reply}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="card" aria-label="Event history">
        <h2>Event history</h2>
        <ul className="timeline">
          {events.map((e) => (
            <li key={String(e.id)}>
              <strong>{String(e.event_type)}</strong>{" "}
              <span className="muted">by {String(e.actor_type)} · {fmtDT(String(e.created_at))}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
