import { NextResponse } from "next/server";
import { claimDueJobs, processJob, flagOverdueFollowups } from "@/lib/notify";
import { db } from "@/lib/db";

/**
 * DEMO SCAFFOLDING (2026-10-07): runs one outbox-worker poll cycle on demand.
 * The background worker (`npm run worker`) could not be started on the demo
 * Mac (no remote shell access), so after approving a case in /staff, hit this
 * endpoint to process the approved_update job and place the callback call.
 * Remove after the phone demo. Do not ship.
 */
export async function POST(req: Request) {
  try {
    // DEMO ONLY: ?action=migrate applies pending DDL (idempotent).
    // The Mac has no remote shell, so the demo migration runs here.
    // Remove after the phone demo. Do not ship.
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "migrate") {
      const statements = [
        `ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_preferred_language_check`,
        `ALTER TABLE service_requests ADD CONSTRAINT service_requests_preferred_language_check CHECK (preferred_language IN ('en','vi','es'))`,
        `ALTER TABLE assistance_cases DROP CONSTRAINT IF EXISTS assistance_cases_preferred_language_check`,
        `ALTER TABLE assistance_cases ADD CONSTRAINT assistance_cases_preferred_language_check CHECK (preferred_language IN ('en','vi','es'))`,
        `ALTER TABLE conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_language_check`,
        `ALTER TABLE conversation_sessions ADD CONSTRAINT conversation_sessions_language_check CHECK (language IN ('en','vi','es'))`,
        `CREATE TABLE IF NOT EXISTS conversation_turns (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE, turn_index INTEGER NOT NULL, step TEXT NOT NULL, input TEXT, reply TEXT NOT NULL, language TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
        `CREATE INDEX IF NOT EXISTS idx_conversation_turns_session ON conversation_turns(session_id, turn_index)`,
        `ALTER TABLE outbox_jobs DROP CONSTRAINT IF EXISTS outbox_jobs_kind_check`,
        `ALTER TABLE outbox_jobs ADD CONSTRAINT outbox_jobs_kind_check CHECK (kind IN ('approved_update','followup_reminder','sms_receipt'))`,
        `ALTER TABLE outbox_jobs DROP CONSTRAINT IF EXISTS outbox_jobs_channel_check`,
        `ALTER TABLE outbox_jobs ADD CONSTRAINT outbox_jobs_channel_check CHECK (channel IN ('voice_callback','status_link','none','sms'))`,
        `INSERT INTO schema_migrations (version) VALUES ('002_spanish_and_transcripts') ON CONFLICT (version) DO NOTHING`,
        `ALTER TABLE assistance_cases ADD COLUMN IF NOT EXISTS foodfit_visit_id TEXT`,
        `ALTER TABLE assistance_cases ADD COLUMN IF NOT EXISTS foodfit_visit_code TEXT`,
        `ALTER TABLE assistance_cases ADD COLUMN IF NOT EXISTS foodfit_basket JSONB`,
        `INSERT INTO schema_migrations (version) VALUES ('003_foodfit_link') ON CONFLICT (version) DO NOTHING`,
      ];
      const applied: string[] = [];
      for (const sql of statements) {
        await db().query(sql);
        applied.push(sql.slice(0, 60));
      }
      return NextResponse.json({ ok: true, migrated: true, applied: applied.length });
    }
    const jobs = await claimDueJobs(10);
    const processed: Array<{ kind: string; job_key: string }> = [];
    for (const job of jobs) {
      await processJob(job);
      processed.push({ kind: job.kind, job_key: job.job_key });
    }
    const overdue = await flagOverdueFollowups();
    return NextResponse.json({ ok: true, processed, overdue });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "worker_tick_failed" },
      { status: 500 }
    );
  }
}

/**
 * DEMO SCAFFOLDING: GET returns the latest case with its session + transcript.
 * Lets the demo operator verify a live call without opening /staff.
 * Remove after the phone demo. Do not ship.
 */
export async function GET() {
  try {
    const c = await db().query(
      `SELECT id, case_number, status, preferred_language, contact_preference,
              confirmed_fields, unknowns, created_at
       FROM assistance_cases ORDER BY created_at DESC LIMIT 1`
    );
    if (!c.rows.length) return NextResponse.json({ ok: true, case: null });
    const kase = c.rows[0] as Record<string, unknown>;
    const s = await db().query(
      `SELECT id, channel, step, language, status AS session_status
       FROM conversation_sessions WHERE case_id = $1
       ORDER BY created_at DESC LIMIT 1`, [kase.id]
    );
    const sess = (s.rows[0] as Record<string, unknown> | undefined) ?? null;
    let turns: unknown[] = [];
    if (sess) {
      try {
        const t = await db().query(
          `SELECT turn_index, step, input, reply, language, created_at
           FROM conversation_turns WHERE session_id = $1 ORDER BY turn_index ASC`,
          [sess.id]
        );
        turns = t.rows;
      } catch {
        turns = [{ note: "conversation_turns table missing — run npm run migrate" }];
      }
    }
    const jobs = await db().query(
      `SELECT kind, channel, status, attempts, created_at FROM outbox_jobs
       WHERE case_id = $1 ORDER BY created_at ASC`, [kase.id]
    );
    return NextResponse.json({
      ok: true, case: kase, session: sess, turns, jobs: jobs.rows,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
