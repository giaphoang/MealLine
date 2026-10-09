/**
 * Scenario 4: silence, recognition failure, "person" / "gặp nhân viên" / 0,
 * hangup, and unanswered transfer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resetFixtures, runIntake, teardown, ORG_DEMO, PROVIDER } from "./fixtures";
import { createSession, processTurn, getSession, abandonSession } from "../lib/controller";
import { dispatchTool } from "../lib/tools";
import { db } from "../lib/db";

const OPTS = { orgId: ORG_DEMO, providerId: PROVIDER };

test("scenario 4: two silences trigger a callback case (text channel)", async () => {
  await resetFixtures();
  const s = await createSession({ channel: "sim" });
  const r0 = await processTurn(s.id, null, OPTS);
  assert.equal(r0.done, false);
  assert.match(r0.reply, /MealLine/); // greeting, not a failed attempt
  const r1 = await processTurn(s.id, null, OPTS);
  assert.equal(r1.done, false);
  assert.match(r1.reply, /did not hear/i);
  const r2 = await processTurn(s.id, null, OPTS);
  assert.equal(r2.done, true);
  assert.deepEqual(r2.handoff, { mode: "callback", reason: "no_input" });
  const after = await getSession(s.id);
  assert.equal(after!.status, "callback");
  await teardown();
});

test("scenario 4: 'person' triggers handoff; voice channel wants transfer", async () => {
  await resetFixtures();
  const s = await createSession({ channel: "voice", providerCallId: "CA_test_person" });
  const r = await processTurn(s.id, "person", OPTS);
  assert.equal(r.done, true);
  assert.deepEqual(r.handoff, { mode: "transfer", reason: "applicant_requested" });
  assert.match(r.reply, /staff member/i);
  await teardown();
});

test("scenario 4: 'gặp nhân viên' triggers handoff in Vietnamese", async () => {
  await resetFixtures();
  const s = await createSession({ channel: "sim" });
  await processTurn(s.id, "tiếng Việt", OPTS);
  const r = await processTurn(s.id, "gặp nhân viên", OPTS);
  assert.equal(r.done, true);
  assert.equal(r.handoff!.mode, "callback"); // non-voice -> callback case
  assert.match(r.reply, /nhân viên/i);
  await teardown();
});

test("scenario 4: keypad 0 triggers handoff", async () => {
  await resetFixtures();
  const s = await createSession({ channel: "voice", providerCallId: "CA_test_zero" });
  const r = await processTurn(s.id, "0", OPTS);
  assert.equal(r.done, true);
  assert.equal(r.handoff!.mode, "transfer");
  await teardown();
});

test("scenario 4: recognition failure twice -> human, not a loop", async () => {
  await resetFixtures();
  const s = await createSession({ channel: "sim" });
  await processTurn(s.id, "English", OPTS); // language ok, now at address
  const r1 = await processTurn(s.id, "blorpt wuzzle ???", OPTS);
  assert.equal(r1.done, false); // re-asked once
  const r2 = await processTurn(s.id, "zqxj vvv ???", OPTS);
  assert.equal(r2.done, true);
  assert.equal(r2.handoff!.reason, "unrecognized_input");
  await teardown();
});

test("scenario 4: hangup mid-flow persists partial intake", async () => {
  await resetFixtures();
  const s = await createSession({ channel: "voice", providerCallId: "CA_test_hangup" });
  await processTurn(s.id, "English", OPTS);
  await processTurn(s.id, "1234 Grand Avenue, Des Moines, 50312", OPTS);
  await abandonSession(s.id); // hangup webhook
  const after = await getSession(s.id);
  assert.equal(after!.status, "abandoned");
  assert.match((after!.draft_fields.address?.raw ?? ""), /Grand Avenue/);
  await teardown();
});

test("scenario 4: request_human creates a visible callback follow-up", async () => {
  await resetFixtures();
  const { caseId } = await runIntake([
    "English",
    "1234 Grand Avenue, Des Moines, 50312",
    "3",
    "none",
    "both",
    "weekday mornings",
    "call me at 5155550142",
    "none",
    "yes",
  ]);
  const before = await db().query(`SELECT status FROM assistance_cases WHERE id = $1`, [caseId]);
  assert.equal((before.rows[0] as { status: string }).status, "needs_review");
  await dispatchTool("request_human", { case_id: caseId, reason: "transfer_unanswered" }, {
    caseId, orgId: ORG_DEMO, actor: "system", channel: "voice",
  });
  const after = await db().query(
    `SELECT status, next_action_at FROM assistance_cases WHERE id = $1`, [caseId]);
  const row = after.rows[0] as { status: string; next_action_at: string };
  assert.equal(row.status, "awaiting_followup");
  assert.ok(new Date(row.next_action_at).getTime() > Date.now());
  await teardown();
});
