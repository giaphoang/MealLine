/**
 * Scenario 8: notification failure stays visible; no false acknowledgement.
 * Scenario 9: unknown tools/options are rejected by the dispatcher.
 * Scenario 10: unauthorized staff cannot view another org or approve.
 * Scenario 11: fulfillment requires an explicit outcome; approval != fulfilled.
 * Scenario 12: callback voicemail carries no sensitive case details.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resetFixtures, runIntake, teardown, EN_SCRIPT, ORG_DEMO, ORG_OTHER, PROVIDER,
  COORD_ID, STAFF_ID, RIVER_ID,
} from "./fixtures";
import { approveDelivery } from "../lib/approval";
import { claimDueJobs, processJob } from "../lib/notify";
import { dispatchTool, ToolRejectedError } from "../lib/tools";
import { simVoice } from "../lib/voice";
import { getCase, getCaseForOrg, recordOutcome } from "../lib/cases";
import { db } from "../lib/db";

const STAFF = { id: COORD_ID, orgId: ORG_DEMO, role: "coordinator" as const, name: "Dana" };

test("scenario 8: notification failure is visible; nothing falsely acknowledged", async () => {
  await resetFixtures();
  simVoice.reset();
  simVoice.script.fail = true;
  simVoice.script.failError = "line unreachable";

  const { caseId } = await runIntake(EN_SCRIPT); // callback contact
  const c = await getCase(caseId!);
  await approveDelivery({
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
    idempotencyKey: "sc8-key-0001", staff: STAFF,
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });

  // Drive all retries to exhaustion (bounded backoff, max 5 attempts).
  for (let i = 0; i < 6; i++) {
    const jobs = await db().query(
      `UPDATE outbox_jobs SET next_attempt_at = now() WHERE status = 'pending' RETURNING *`);
    for (const j of jobs.rows) await processJob(j as never, simVoice);
  }
  const job = await db().query(`SELECT status, attempts FROM outbox_jobs WHERE case_id = $1 AND kind='approved_update'`, [caseId]);
  assert.equal((job.rows[0] as { status: string }).status, "failed");
  assert.equal((job.rows[0] as { attempts: number }).attempts, 5);

  // Attempts recorded as failed; none acknowledged.
  const atts = await db().query(
    `SELECT na.status FROM notification_attempts na JOIN outbox_jobs j ON j.id = na.job_id
     WHERE j.case_id = $1 AND j.kind='approved_update'`, [caseId]);
  assert.ok(atts.rows.length > 0);
  assert.ok(atts.rows.every((r) => (r as { status: string }).status !== "acknowledged"));

  // Visible follow-up work exists; case is NOT marked fulfilled.
  const after = await getCase(caseId!);
  assert.equal(after!.status, "awaiting_followup");
  assert.notEqual(after!.status, "fulfilled");
  const evts = await db().query(
    `SELECT event_type FROM case_events WHERE case_id = $1 AND event_type = 'notification_failed'`, [caseId]);
  assert.equal(evts.rows.length, 1);
  await teardown();
});

test("scenario 9: unknown tool rejected; unknown option rejected", async () => {
  await resetFixtures();
  const { caseId } = await runIntake(EN_SCRIPT);
  const ctx = { caseId, orgId: ORG_DEMO, actor: "applicant" as const, channel: "sim" as const };

  await assert.rejects(
    dispatchTool("delete_everything", {}, ctx),
    (e: unknown) => e instanceof ToolRejectedError && e.code === "unknown_tool"
  );
  await assert.rejects(
    dispatchTool("approve_delivery", { case_id: caseId }, ctx), // staff-only, not in allow-list
    (e: unknown) => e instanceof ToolRejectedError && e.code === "unknown_tool"
  );
  await assert.rejects(
    dispatchTool("propose_delivery", { case_id: caseId, option_id: "slot_nope" }, ctx),
    (e: unknown) => e instanceof ToolRejectedError && (e as ToolRejectedError).code === "unknown_option"
  );
  // Rejection is recorded on the timeline.
  const evts = await db().query(
    `SELECT event_type FROM case_events WHERE case_id = $1 AND event_type = 'tool_rejected'`, [caseId]);
  assert.ok(evts.rows.length >= 1);
  await teardown();
});

test("scenario 10: cross-org access and wrong-role approval blocked", async () => {
  await resetFixtures();
  const { caseId } = await runIntake(EN_SCRIPT);

  // Another org's coordinator cannot read the case.
  const other = await getCaseForOrg(caseId!, ORG_OTHER);
  assert.equal(other, null);

  // Staff role (non-coordinator) cannot approve.
  const c = await getCase(caseId!);
  const staffAttempt = await approveDelivery({
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
    idempotencyKey: "sc10-staff", staff: { id: STAFF_ID, orgId: ORG_DEMO, role: "staff", name: "Sam" },
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });
  assert.equal(staffAttempt.ok, false);
  assert.equal((staffAttempt as { error: string }).error, "forbidden_role");

  // Coordinator of another org cannot approve this org's case.
  const crossAttempt = await approveDelivery({
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
    idempotencyKey: "sc10-cross", staff: { id: RIVER_ID, orgId: ORG_OTHER, role: "coordinator", name: "Rae" },
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });
  assert.equal(crossAttempt.ok, false);
  assert.equal((crossAttempt as { error: string }).error, "forbidden_org");

  // No booking was created by the blocked attempts.
  const n = await db().query(`SELECT count(*)::int AS n FROM bookings WHERE case_id = $1`, [caseId]);
  assert.equal((n.rows[0] as { n: number }).n, 0);
  await teardown();
});

test("scenario 11: approval is not fulfillment; outcome must be explicit", async () => {
  await resetFixtures();
  const { caseId } = await runIntake(EN_SCRIPT);
  const c = await getCase(caseId!);
  await approveDelivery({
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
    idempotencyKey: "sc11-key", staff: STAFF,
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });
  const approved = await getCase(caseId!);
  assert.equal(approved!.status, "approved");
  assert.notEqual(approved!.status, "fulfilled");

  // A case still in draft cannot be marked fulfilled.
  const { createCaseFromDraft } = await import("../lib/cases");
  const draft = await createCaseFromDraft({
    orgId: ORG_DEMO, providerId: PROVIDER, type: "new_delivery", channel: "sim",
    language: "en",
    draft: {
      address: { raw: "1 Draft Way, Des Moines, 50309", zip: "50309" },
      household: { size: 1 },
      contactPreference: "status_link",
    },
  });
  assert.equal(draft.status, "draft");
  await assert.rejects(
    recordOutcome(draft.id, "fulfilled", COORD_ID, ORG_DEMO),
    /invalid_state_or_forbidden/
  );

  // Explicit staff/provider outcome completes the lifecycle.
  const done = await recordOutcome(caseId!, "fulfilled", COORD_ID, ORG_DEMO, "Driver confirmed drop-off.");
  assert.equal(done.status, "fulfilled");
  await teardown();
});

test("scenario 12: voicemail carries no sensitive details", async () => {
  await resetFixtures();
  simVoice.reset();
  simVoice.script.voicemail = true;

  const { caseId } = await runIntake(EN_SCRIPT); // callback contact
  const c = await getCase(caseId!);
  await approveDelivery({
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
    idempotencyKey: "sc12-key", staff: STAFF,
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });
  const jobs = await claimDueJobs();
  const update = jobs.find(j => j.kind === "approved_update");
  assert.ok(update);
  await processJob(update, simVoice);

  const atts = await db().query(
    `SELECT detail FROM notification_attempts na JOIN outbox_jobs j ON j.id = na.job_id
     WHERE j.case_id = $1 AND j.kind='approved_update'`, [caseId]);
  assert.equal(atts.rows.length, 1);
  const detail = (atts.rows[0] as { detail: { voicemail: boolean; messageSent: string } }).detail;
  assert.equal(detail.voicemail, true);
  const body: string = detail.messageSent;
  // No address, no phone digits, no household info in the voicemail body.
  assert.ok(!/\d{3}/.test(body), `voicemail body must not contain digit runs: ${body}`);
  assert.ok(!/grand|avenue|des moines/i.test(body));
  assert.match(body, /call us back/i);
  await teardown();
});
