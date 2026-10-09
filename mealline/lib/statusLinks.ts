/**
 * Applicant status links: high-entropy, hashed at rest, expiring, revocable.
 * The raw token appears only in the URL the applicant sees; private details
 * never go in the URL and logs only record the token hash.
 */
import { db } from "./db";
import { newId, newToken, hashToken } from "./ids";
import { getCase } from "./cases";
import { phoneCommand } from './nourishPhone';

const LINK_TTL_DAYS = 30;

export async function issueStatusLink(
  caseId: string, publicBaseUrl?: string
): Promise<{ token: string; path: string; url: string }> {
  const token = newToken();
  const expires = new Date(Date.now() + LINK_TTL_DAYS * 86400 * 1000).toISOString();
  await db().query(
    `INSERT INTO status_links (id, case_id, token_hash, expires_at)
     VALUES ($1,$2,$3,$4)`,
    [newId("slink"), caseId, hashToken(token), expires]
  );
  const path = `/status/${token}`;
  const base = (publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  return { token, path, url: base ? `${base}${path}` : path };
}

export async function revokeStatusLink(caseId: string): Promise<void> {
  await db().query(
    `UPDATE status_links SET revoked_at = now() WHERE case_id = $1 AND revoked_at IS NULL`,
    [caseId]
  );
}

export interface StatusView {
  caseNumber: string;
  status: string;
  language: string;
  contactPreference: string | null;
  approvedWindow: { label: string; start: string; end: string } | null;
  nextStep: string;
  updatedAt: string;
  scheduledFor?: string | null;
}

/** Minimal applicant-facing status. Never includes address or phone number. */
export async function resolveStatusLink(token: string): Promise<StatusView> {
  const r = await db().query(
    `SELECT case_id FROM status_links
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(token)]
  );
  if (!r.rows.length) throw new Error("invalid_or_expired_link");
  const c = await getCase((r.rows[0] as { case_id: string }).case_id);
  if (!c) throw new Error("invalid_or_expired_link");
  if(c.nourish_managed){
    let status='staff_review',scheduledFor:string|null=null,updatedAt=c.updated_at;
    try{
      const result=await phoneCommand({id:'status-link',callId:'status-link',kind:'notification_context',clientId:c.nourish_client_id ?? undefined});
      const current=result.notification?.statuses.find(s=>s.intakeId===c.nourish_intake_id || s.caseNumber===c.case_number);
      if(current){status=current.status;scheduledFor=current.scheduledFor;updatedAt=current.updatedAt;}
    }catch{status='status_unavailable';}
    return {caseNumber:c.case_number,status,language:c.preferred_language,contactPreference:c.contact_preference,approvedWindow:null,
      nextStep:status==='delivered'?'delivered':status==='status_unavailable'?'call_for_status':'nourish_staff_review',updatedAt,scheduledFor};
  }

  let approvedWindow: StatusView["approvedWindow"] = null;
  if (c.status === "approved" || c.status === "fulfilled") {
    const b = await db().query(
      `SELECT b.id, o.label, o.window_start, o.window_end
       FROM bookings b JOIN delivery_options o ON o.id = b.option_id
       WHERE b.case_id = $1 AND b.status = 'confirmed'
       ORDER BY b.created_at DESC LIMIT 1`, [c.id]
    );
    const row = b.rows[0] as { label: string; window_start: string; window_end: string } | undefined;
    if (row) {
      approvedWindow = { label: row.label, start: row.window_start, end: row.window_end };
    }
  }

  const nextStep =
    c.status === "draft" ? "intake_in_progress"
    : c.status === "needs_review" ? "staff_review"
    : c.status === "awaiting_followup" ? "staff_followup"
    : c.status === "approved" ? "delivery_scheduled"
    : c.status === "fulfilled" ? "delivered"
    : "closed";

  return {
    caseNumber: c.case_number,
    status: c.status,
    language: c.preferred_language,
    contactPreference: c.contact_preference,
    approvedWindow,
    nextStep,
    updatedAt: c.updated_at,
  };
}
