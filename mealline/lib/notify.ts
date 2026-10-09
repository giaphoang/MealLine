/**
 * Notification worker logic (used by scripts/worker.ts and by tests).
 * Claims due outbox jobs with leases, sends via the voice port, records
 * every attempt. Notification state stays separate from case/fulfillment.
 * Retries use bounded backoff; exhausted retries become visible follow-up work.
 */
import { db } from "./db";
import { newId } from "./ids";
import { getVoicePort, type VoicePort } from "./voice";
import { getSmsPort } from "./sms";
import { recordEvent, setNextAction } from "./cases";

const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 15, 60, 240];

export interface JobRow {
  id: string; job_key: string; case_id: string; kind: string;
  channel: string; payload: Record<string, unknown>;
  status: string; attempts: number;
}

export async function claimDueJobs(limit = 10): Promise<JobRow[]> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT * FROM outbox_jobs
       WHERE status = 'pending' AND next_attempt_at <= now()
       ORDER BY next_attempt_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    const jobs = r.rows as unknown as JobRow[];
    const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
    for (const j of jobs) {
      await client.query(
        `UPDATE outbox_jobs SET status = 'leased', lease_expires_at = $1 WHERE id = $2`,
        [leaseUntil, j.id]
      );
    }
    await client.query("COMMIT");
    return jobs;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

async function recordAttempt(
  jobId: string, channel: string,
  status: "attempted" | "acknowledged" | "failed",
  detail: Record<string, unknown>,
  providerIdentifier?: string, error?: string
): Promise<void> {
  await db().query(
    `INSERT INTO notification_attempts
      (id, job_id, channel, status, provider_identifier, error, detail, acknowledged_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [newId("natt"), jobId, channel, status, providerIdentifier ?? null,
     error ?? null, JSON.stringify(detail),
     status === "acknowledged" ? new Date().toISOString() : null]
  );
}

async function finishJob(
  job: JobRow, ok: boolean, error?: string
): Promise<void> {
  if (ok) {
    await db().query(`UPDATE outbox_jobs SET status = 'done' WHERE id = $1`, [job.id]);
    return;
  }
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db().query(
      `UPDATE outbox_jobs SET status = 'failed', attempts = $1, last_error = $2 WHERE id = $3`,
      [attempts, error ?? "unknown", job.id]
    );
    // Exhausted retries -> visible follow-up work with an owner-needed flag.
    await setNextAction(job.case_id,
      new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
      "awaiting_followup", undefined, "notification_failed");
    await recordEvent(job.case_id, "worker", "notification_failed",
      { jobId: job.id, kind: job.kind, error: error ?? "unknown" });
  } else {
    const backoffMin = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
    await db().query(
      `UPDATE outbox_jobs
       SET status = 'pending', attempts = $1, last_error = $2,
           next_attempt_at = now() + ($3 || ' minutes')::interval,
           lease_expires_at = NULL
       WHERE id = $4`,
      [attempts, error ?? "unknown", String(backoffMin), job.id]
    );
  }
}

function applicantPhoneFor(caseId: string): Promise<string | null> {
  return db().query(
    `SELECT sr.contact_phone FROM assistance_cases c
     JOIN service_requests sr ON sr.id = c.request_id WHERE c.id = $1`,
    [caseId]
  ).then((r) => (r.rows[0] as { contact_phone: string | null } | undefined)?.contact_phone ?? null);
}

export async function processJob(job: JobRow, voice: VoicePort = getVoicePort()): Promise<void> {
  const p = job.payload;
  try {
    if (job.kind === "approved_update") {
      if (job.channel === "status_link" || job.channel === "none") {
        // Nothing to dial; the applicant uses their secure link. Record the
        // decision so the timeline shows the notification path truthfully.
        await recordAttempt(job.id, job.channel, "acknowledged", {
          note: "no outbound call needed; applicant uses secure status link",
          voicePort: voice.label,
        });
        await recordEvent(job.case_id, "worker", "notification_acknowledged",
          { channel: job.channel, note: "status_link" });
        await finishJob(job, true);
        return;
      }
      const to = await applicantPhoneFor(job.case_id);
      if (!to) {
        await recordAttempt(job.id, job.channel, "failed", { reason: "no_phone_on_file" });
        await finishJob(job, false, "no_phone_on_file");
        return;
      }
      const outcome = await voice.placeCall({
        to: `+1${to}`,
        message: String(p.voiceMessage ?? ""),
        voicemailMessage: p.voicemailMessage ? String(p.voicemailMessage) : undefined,
        kind: "approved_update",
      });
      if (outcome.status === "failed") {
        await recordAttempt(job.id, job.channel, "failed",
          { voicePort: voice.label }, undefined, outcome.error);
        await finishJob(job, false, outcome.error);
        return;
      }
      // A connected call is NOT recipient acknowledgement, and voicemail is
      // never treated as acknowledgement. Record truthfully.
      const ack = outcome.status === "voicemail" ? "attempted" : "attempted";
      await recordAttempt(job.id, job.channel, ack as "attempted",
        {
          voicePort: voice.label,
          voicemail: outcome.status === "voicemail",
          // Voicemail bodies must carry no sensitive case details.
          messageSent: outcome.status === "voicemail" ? p.voicemailMessage : p.voiceMessage,
        },
        outcome.providerCallSid);
      await recordEvent(job.case_id, "worker", "notification_attempted",
        {
          channel: job.channel,
          voicemail: outcome.status === "voicemail",
          providerCallSid: outcome.providerCallSid,
        });
      // Job done = message handed to the voice port. Acknowledgement and
      // fulfillment are tracked separately (status callbacks / staff outcome).
      await finishJob(job, true);
      return;
    }
    if (job.kind === "followup_reminder") {
      await recordEvent(job.case_id, "worker", "followup_reminder_due",
        { note: String(p.note ?? "follow-up due") });
      await finishJob(job, true);
      return;
    }
    if (job.kind === "sms_receipt") {
      // Text receipt after intake: case number + secure status link.
      // Body is pre-composed in the applicant's language at enqueue time.
      const to = String(p.to ?? "");
      const body = String(p.body ?? "");
      if (!to || !body) {
        await recordAttempt(job.id, "sms", "failed", { reason: "missing_to_or_body" });
        await finishJob(job, false, "missing_to_or_body");
        return;
      }
      const sms = getSmsPort();
      const outcome = await sms.sendSms(to, body);
      if (outcome.status === "failed") {
        await recordAttempt(job.id, "sms", "failed",
          { smsPort: sms.label }, undefined, outcome.error);
        await finishJob(job, false, outcome.error);
        return;
      }
      await recordAttempt(job.id, "sms", "attempted",
        { smsPort: sms.label, bodyPreview: body.slice(0, 80) },
        outcome.sid);
      await recordEvent(job.case_id, "worker", "sms_receipt_sent", {
        // Never log the full phone number in events.
        toLast4: to.slice(-4),
        providerSid: outcome.sid ?? null,
      });
      await finishJob(job, true);
      return;
    }
    await finishJob(job, false, `unknown_job_kind:${job.kind}`);
  } catch (e) {
    await finishJob(job, false, e instanceof Error ? e.message : "worker_error");
  }
}

/** Flag overdue follow-ups so unowned cases stay visible. */
export async function flagOverdueFollowups(): Promise<number> {
  const r = await db().query(
    `SELECT id FROM assistance_cases
     WHERE status = 'awaiting_followup' AND next_action_at < now() AND owner_id IS NULL`
  );
  for (const row of r.rows as { id: string }[]) {
    await recordEvent(row.id, "worker", "followup_overdue_unowned", {});
  }
  return r.rows.length;
}
