/**
 * Approval transaction: authorize -> lock case + slot -> recheck capacity ->
 * reserve + booking + outbox job, all in one transaction. Never confirms
 * service before commit. Concurrent approvals cannot overbook the last slot.
 */
import { db } from "./db";
import { newId } from "./ids";
import { recordEvent } from "./cases";
import { t, type Locale } from "./i18n";
import type { StaffRole } from "./types";

export interface StaffIdentity {
  id: string;
  orgId: string;
  role: StaffRole;
  name: string;
}

export interface ApproveInput {
  caseId: string;
  optionId: string;
  expectedVersion: number;
  idempotencyKey: string;
  staff: StaffIdentity;
  checks: { serviceAreaVerified: boolean; rulesVerified: boolean };
}

export type ApproveResult =
  | { ok: true; bookingId: string; caseNumber: string; deduped: boolean }
  | { ok: false; error: string };

/** Idempotent: a repeated approval with the same key returns the booking. */
export async function approveDelivery(input: ApproveInput): Promise<ApproveResult> {
  const { staff } = input;
  if (staff.role !== "coordinator") {
    return { ok: false, error: "forbidden_role" };
  }
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)) {
    return { ok: false, error: "invalid_idempotency_key" };
  }

  // Fast path: already processed this idempotency key.
  const existing = await db().query(
    `SELECT b.id, c.case_number FROM bookings b
     JOIN assistance_cases c ON c.id = b.case_id
     WHERE b.idempotency_key = $1`, [input.idempotencyKey]
  );
  if (existing.rows.length) {
    const row = existing.rows[0] as { id: string; case_number: string };
    return { ok: true, bookingId: row.id, caseNumber: row.case_number, deduped: true };
  }

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    // Re-check the fast path inside the transaction to close the race.
    const dup = await client.query(
      `SELECT b.id FROM bookings b WHERE b.idempotency_key = $1`, [input.idempotencyKey]
    );
    if (dup.rows.length) {
      await client.query("ROLLBACK");
      const row = dup.rows[0] as { id: string };
      return { ok: true, bookingId: row.id, caseNumber: "", deduped: true };
    }

    const cr = await client.query(
      `SELECT * FROM assistance_cases WHERE id = $1 FOR UPDATE`, [input.caseId]
    );
    if (!cr.rows.length) { await client.query("ROLLBACK"); return { ok: false, error: "case_not_found" }; }
    const c = cr.rows[0] as {
      id: string; case_number: string; org_id: string; provider_id: string;
      status: string; version: number; preferred_language: Locale;
      contact_preference: string | null;
      nourish_managed: boolean;
    };
    if (c.org_id !== staff.orgId) { await client.query("ROLLBACK"); return { ok: false, error: "forbidden_org" }; }
    if (c.nourish_managed) { await client.query('ROLLBACK'); return { ok: false, error: 'review_in_nourish' }; }
    if (c.status !== "needs_review" && c.status !== "awaiting_followup") {
      await client.query("ROLLBACK"); return { ok: false, error: "invalid_state" };
    }
    if (c.version !== input.expectedVersion) {
      await client.query("ROLLBACK"); return { ok: false, error: "stale_version" };
    }

    const or = await client.query(
      `SELECT * FROM delivery_options WHERE id = $1 FOR UPDATE`, [input.optionId]
    );
    if (!or.rows.length) { await client.query("ROLLBACK"); return { ok: false, error: "unknown_option" }; }
    const o = or.rows[0] as {
      id: string; provider_id: string; label: string; active: boolean;
      window_start: string; window_end: string;
      capacity_total: number; capacity_reserved: number;
    };
    if (o.provider_id !== c.provider_id || !o.active) {
      await client.query("ROLLBACK"); return { ok: false, error: "unknown_option" };
    }
    if (new Date(o.window_end).getTime() <= Date.now()) {
      await client.query("ROLLBACK"); return { ok: false, error: "option_expired" };
    }
    if (o.capacity_reserved >= o.capacity_total) {
      await client.query("ROLLBACK"); return { ok: false, error: "no_capacity" };
    }

    const proposalId = newId("prop");
    await client.query(
      `INSERT INTO delivery_proposals
        (id, case_id, option_id, option_snapshot, rationale, review_state, proposed_by, approved_by)
       VALUES ($1,$2,$3,$4,$5,'approved',$6,$6)`,
      [proposalId, c.id, o.id, JSON.stringify(o),
       `Approved slot ${o.label}; staff checks: serviceArea=${input.checks.serviceAreaVerified}, rules=${input.checks.rulesVerified}.`,
       staff.id]
    );
    await client.query(
      `UPDATE delivery_options SET capacity_reserved = capacity_reserved + 1, updated_at = now()
       WHERE id = $1`, [o.id]
    );
    const bookingId = newId("book");
    await client.query(
      `INSERT INTO bookings (id, case_id, proposal_id, option_id, idempotency_key, status)
       VALUES ($1,$2,$3,$4,$5,'confirmed')`,
      [bookingId, c.id, proposalId, o.id, input.idempotencyKey]
    );
    await client.query(
      `UPDATE assistance_cases SET status = 'approved', version = version + 1, updated_at = now()
       WHERE id = $1`, [c.id]
    );

    // Notification job: approved template + verified contact preference.
    const channel =
      c.contact_preference === "callback" ? "voice_callback"
      : c.contact_preference === "status_link" ? "status_link" : "none";
    const windowLabel = `${o.label} (${o.window_start} – ${o.window_end})`;
    await client.query(
      `INSERT INTO outbox_jobs (id, job_key, case_id, kind, channel, payload)
       VALUES ($1,$2,$3,'approved_update',$4,$5)`,
      [
        newId("job"), `approved_update:${bookingId}`, c.id, channel,
        JSON.stringify({
          template: "approved_update_voice",
          locale: c.preferred_language,
          // Templated, not model-composed. Voicemail variant carries no
          // address, name, or phone: it only asks for a callback.
          voiceMessage: t(c.preferred_language).approved_update_voice(windowLabel),
          voicemailMessage: t(c.preferred_language).approved_update_voicemail(),
          windowLabel,
        }),
      ]
    );

    await recordEvent(c.id, "staff", "delivery_approved", {
      optionId: o.id, optionLabel: o.label, bookingId,
      checks: input.checks, idempotencyKey: input.idempotencyKey,
    }, staff.id, client);
    await client.query("COMMIT");
    return { ok: true, bookingId, caseNumber: c.case_number, deduped: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** "No capacity" path: keep the case visible with an owner + follow-up time. */
export async function markNoCapacity(
  caseId: string, staff: StaffIdentity, note: string
): Promise<{ ok: boolean; error?: string }> {
  if (staff.role !== "coordinator" && staff.role !== "staff") {
    return { ok: false, error: "forbidden_role" };
  }
  const r = await db().query(
    `UPDATE assistance_cases
     SET status = 'awaiting_followup', owner_id = $1,
         next_action_at = now() + interval '24 hours',
         version = version + 1, updated_at = now()
     WHERE id = $2 AND org_id = $3 AND status IN ('needs_review','awaiting_followup')
     RETURNING id`,
    [staff.id, caseId, staff.orgId]
  );
  if (!r.rows.length) return { ok: false, error: "invalid_state_or_forbidden" };
  await recordEvent(caseId, "staff", "no_capacity_followup",
    { note: note.slice(0, 500) }, staff.id);
  return { ok: true };
}
