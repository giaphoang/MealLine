/**
 * Scenario 5: two cases compete for the last slot — at most one booking.
 * Scenario 6: duplicate webhook + repeated approval -> one case/booking/action.
 * Scenario 7: no capacity or stale slot -> visible follow-up case.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resetFixtures, runIntake, teardown, EN_SCRIPT, ORG_DEMO, COORD_ID,
} from "./fixtures";
import { approveDelivery, markNoCapacity } from "../lib/approval";
import { getCase, listCases } from "../lib/cases";
import { createSession } from "../lib/controller";
import { db } from "../lib/db";

const STAFF = { id: COORD_ID, orgId: ORG_DEMO, role: "coordinator" as const, name: "Dana" };

test("scenario 5: last-slot race allows exactly one booking", async () => {
  await resetFixtures();
  const a = await runIntake(EN_SCRIPT);
  const b = await runIntake(EN_SCRIPT);
  const ca = await getCase(a.caseId!);
  const cb = await getCase(b.caseId!);

  // Concurrent approvals for the single-capacity slot.
  const [ra, rb] = await Promise.all([
    approveDelivery({
      caseId: a.caseId!, optionId: "slot_race", expectedVersion: ca!.version,
      idempotencyKey: "race-a-001", staff: STAFF,
      checks: { serviceAreaVerified: true, rulesVerified: true },
    }),
    approveDelivery({
      caseId: b.caseId!, optionId: "slot_race", expectedVersion: cb!.version,
      idempotencyKey: "race-b-001", staff: STAFF,
      checks: { serviceAreaVerified: true, rulesVerified: true },
    }),
  ]);
  const oks = [ra, rb].filter((r) => r.ok);
  const conflicts = [ra, rb].filter((r) => !r.ok);
  assert.equal(oks.length, 1, "exactly one approval succeeds");
  assert.equal(conflicts.length, 1);
  assert.equal((conflicts[0] as { error: string }).error, "no_capacity");

  const count = await db().query(
    `SELECT count(*)::int AS n FROM bookings WHERE option_id = 'slot_race' AND status = 'confirmed'`);
  assert.equal((count.rows[0] as { n: number }).n, 1);
  const opt = await db().query(`SELECT capacity_reserved FROM delivery_options WHERE id = 'slot_race'`);
  assert.equal((opt.rows[0] as { capacity_reserved: number }).capacity_reserved, 1);
  await teardown();
});

test("scenario 6: repeated approval with same idempotency key -> one booking", async () => {
  await resetFixtures();
  const { caseId } = await runIntake(EN_SCRIPT);
  const c = await getCase(caseId!);
  const input = {
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
    idempotencyKey: "dup-key-007", staff: STAFF,
    checks: { serviceAreaVerified: true, rulesVerified: true },
  };
  const r1 = await approveDelivery(input);
  assert.equal(r1.ok, true);
  assert.equal((r1 as { deduped: boolean }).deduped, false);
  // Simulate a retried approval (double-click / webhook replay).
  const r2 = await approveDelivery({ ...input });
  assert.equal(r2.ok, true);
  assert.equal((r2 as { deduped: boolean }).deduped, true);
  assert.equal((r2 as { bookingId: string }).bookingId, (r1 as { bookingId: string }).bookingId);

  const n = await db().query(
    `SELECT count(*)::int AS n FROM bookings WHERE idempotency_key = 'dup-key-007'`);
  assert.equal((n.rows[0] as { n: number }).n, 1);
  await teardown();
});

test("scenario 6: duplicate inbound webhook reuses one session", async () => {
  await resetFixtures();
  const s1 = await createSession({ channel: "voice", providerCallId: "CA_dup_1" });
  const s2 = await createSession({ channel: "voice", providerCallId: "CA_dup_1" });
  assert.equal(s1.id, s2.id, "same CallSid -> same session, no duplicate intake");
  await teardown();
});

test("scenario 7: no capacity leaves a visible follow-up, never silent success", async () => {
  await resetFixtures();
  // Fill the only slot via one approval, then try another case.
  const a = await runIntake(EN_SCRIPT);
  const ca = await getCase(a.caseId!);
  await approveDelivery({
    caseId: a.caseId!, optionId: "slot_race", expectedVersion: ca!.version,
    idempotencyKey: "fill-001", staff: STAFF,
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });

  const b = await runIntake(EN_SCRIPT);
  const cb = await getCase(b.caseId!);
  const denied = await approveDelivery({
    caseId: b.caseId!, optionId: "slot_race", expectedVersion: cb!.version,
    idempotencyKey: "denied-001", staff: STAFF,
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });
  assert.equal(denied.ok, false);
  assert.equal((denied as { error: string }).error, "no_capacity");

  // Staff marks no-capacity: case stays visible with owner + follow-up time.
  const marked = await markNoCapacity(b.caseId!, STAFF, "Slot filled; will re-check Thursday.");
  assert.equal(marked.ok, true);
  const after = await getCase(b.caseId!);
  assert.equal(after!.status, "awaiting_followup");
  assert.equal(after!.owner_id, COORD_ID);
  assert.ok(new Date(after!.next_action_at!).getTime() > Date.now());

  // It shows up in the staff queue — not hidden, not fulfilled.
  const queue = await listCases(ORG_DEMO, ["awaiting_followup"]);
  assert.ok(queue.some((k) => k.id === b.caseId));
  assert.notEqual(after!.status, "fulfilled");
  await teardown();
});

test("scenario 7: stale version rejected on approval", async () => {
  await resetFixtures();
  const { caseId } = await runIntake(EN_SCRIPT);
  const c = await getCase(caseId!);
  const stale = await approveDelivery({
    caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version - 1,
    idempotencyKey: "stale-001", staff: STAFF,
    checks: { serviceAreaVerified: true, rulesVerified: true },
  });
  assert.equal(stale.ok, false);
  assert.equal((stale as { error: string }).error, "stale_version");
  await teardown();
});
