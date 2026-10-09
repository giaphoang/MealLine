/**
 * Scenario 1: first-time applicant, no account or reference, completes
 * intake -> staff review -> booking -> acknowledged update.
 * Covers: EN + VI scripts, diacritics, address/household/date/negation
 * preservation, language/contact/accommodation persistence, status-link
 * auth, and rejection of guessed links.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resetFixtures, runIntake, teardown, EN_SCRIPT, VI_SCRIPT, ORG_DEMO,
} from "./fixtures";
import { getCase } from "../lib/cases";
import { resolveStatusLink, revokeStatusLink } from "../lib/statusLinks";
import { approveDelivery } from "../lib/approval";
import { claimDueJobs, processJob } from "../lib/notify";
import { simVoice } from "../lib/voice";
import { db } from "../lib/db";

test("scenario 1: english full flow intake -> review -> booking -> update", async () => {
  await resetFixtures();
  simVoice.reset();

  const { caseId, caseNumber, last } = await runIntake(EN_SCRIPT);
  assert.ok(caseId, "intake should create a case");
  assert.ok(caseNumber?.startsWith("ML-"), "case number issued");
  assert.ok(last.done);

  const c = await getCase(caseId!);
  assert.equal(c!.status, "needs_review");
  assert.equal(c!.preferred_language, "en");
  // Facts preserved exactly as reported.
  assert.match(c!.confirmed_fields.address!.raw, /1234 Grand Avenue/);
  assert.equal(c!.confirmed_fields.address!.zip, "50312");
  assert.equal(c!.confirmed_fields.household!.size, 4);
  assert.equal(c!.confirmed_fields.contactPreference, "callback");
  assert.equal(c!.confirmed_fields.contactPhone, "5155550142");
  assert.match(c!.confirmed_fields.accommodation!, /door/);
  assert.deepEqual(c!.confirmed_fields.availability!.days,
    ["monday", "tuesday", "wednesday", "thursday", "friday"]);
  // Rule check: in service area, no invented eligibility rules.
  const rc = c!.rule_check_result as { inServiceArea: string };
  assert.equal(rc.inServiceArea, "pass");

  // Staff approves; worker sends the approved update (simulated voice).
  const approved = await approveDelivery({
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
    idempotencyKey: "sc1-key-001",
    staff: { id: "user_coord", orgId: ORG_DEMO, role: "coordinator", name: "Dana" },
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });
  assert.equal(approved.ok, true);

  const jobs = await claimDueJobs();
  assert.equal(jobs.filter(j => j.kind === "sms_receipt").length, 1);
  const update = jobs.filter(j => j.kind === "approved_update");
  assert.equal(update.length, 1);
  assert.equal(update[0].channel, "voice_callback");
  for (const job of jobs) await processJob(job, simVoice);
  assert.equal(simVoice.calls.length, 1);
  assert.match(simVoice.calls[0].message, /delivery is scheduled/i);

  // Case is approved, NOT fulfilled: fulfillment needs an explicit outcome.
  const after = await getCase(caseId!);
  assert.equal(after!.status, "approved");
  await teardown();
});

test("scenario 1: vietnamese flow preserves diacritics and language", async () => {
  await resetFixtures();
  const { caseId, statusLinkPath, last } = await runIntake(VI_SCRIPT);
  assert.ok(caseId);
  assert.ok(statusLinkPath, "text-channel intake issues a status link");
  const c = await getCase(caseId!);
  assert.equal(c!.preferred_language, "vi");
  // Diacritics preserved verbatim; English street name kept, not translated.
  assert.match(c!.confirmed_fields.address!.raw, /Đường Grand/);
  assert.equal(c!.confirmed_fields.household!.size, 5);
  assert.equal(c!.confirmed_fields.contactPhone, "5155550143");
  // Read-back was in Vietnamese.
  assert.match(last.reply, /Cảm ơn/);

  // Status link works; minimal view has no address or phone.
  const token = statusLinkPath!.split("/").pop()!;
  const view = await resolveStatusLink(token);
  assert.equal(view.caseNumber, c!.case_number);
  assert.equal(view.language, "vi");
  assert.equal(view.status, "needs_review");
  assert.ok(!("address" in view));

  // Guessed links are rejected without revealing anything.
  await assert.rejects(resolveStatusLink("guessed-token-that-is-long-enough-123"),
    /invalid_or_expired_link/);
  // Revoked links are rejected.
  await revokeStatusLink(caseId!);
  await assert.rejects(resolveStatusLink(token), /invalid_or_expired_link/);
  await teardown();
});

test("scenario 1: unknown ZIP goes to staff review, not auto-rejection", async () => {
  await resetFixtures();
  const { caseId } = await runIntake([
    "English",
    "77 Faraway Road, Ames, 50010",
    "2",
    "none",
    "both",
    "weekday mornings",
    "status link",
    "none",
    "yes",
  ]);
  const c = await getCase(caseId!);
  assert.equal(c!.status, "needs_review");
  const rc = c!.rule_check_result as { inServiceArea: string; notes: string[] };
  assert.equal(rc.inServiceArea, "fail");
  assert.ok(rc.notes.some((n) => n.includes("50010")));
  assert.ok(c!.unknowns.includes("address") === false); // address known, area failed -> staff decides
  await teardown();
});

test("scenario 1: negation preserved (no accommodation)", async () => {
  await resetFixtures();
  const { caseId } = await runIntake([
    "English",
    "1234 Grand Avenue, Des Moines, 50309",
    "1",
    "none",
    "both",
    "Saturday afternoon",
    "status link",
    "none",
    "yes",
  ]);
  const c = await getCase(caseId!);
  assert.equal(c!.confirmed_fields.accommodation, "none");
  assert.equal(c!.accommodation_request, null);
  await teardown();
});

test("scenario 1: handoff language persists across the case", async () => {
  await resetFixtures();
  const { createSession, processTurn } = await import("../lib/controller");
  const { ORG_DEMO: O, PROVIDER: P } = await import("./fixtures");
  const s = await createSession({ channel: "sim" });
  await processTurn(s.id, "tiếng Việt", { orgId: O, providerId: P });
  const mid = await (await import("../lib/controller")).getSession(s.id);
  assert.equal(mid!.language, "vi");
  await teardown();
});
void db;
