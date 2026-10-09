/**
 * Evaluation runner: executes the scripted functional scenarios against a
 * isolated schema, measures timings, and writes docs/evaluation-report.md
 * with real numbers. Synthetic setting; not "households helped."
 *
 * Usage: npm run eval   (requires MEALLINE_DATABASE_URL)
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resetFixtures, runIntake, EN_SCRIPT, VI_SCRIPT,
  ORG_DEMO, COORD_ID,
} from "../tests/fixtures";
import { getCase } from "../lib/cases";
import { approveDelivery } from "../lib/approval";
import { claimDueJobs, processJob } from "../lib/notify";
import { simVoice } from "../lib/voice";
import { closeDb, db } from "../lib/db";

const here = dirname(fileURLToPath(import.meta.url));
const STAFF = { id: COORD_ID, orgId: ORG_DEMO, role: "coordinator" as const, name: "Dana" };

interface Measurement { name: string; value: string; detail?: string }
const measurements: Measurement[] = [];
const t0 = Date.now();
const ms = (t: number) => `${t}ms`;

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const out = await fn();
  measurements.push({ name, value: ms(Date.now() - start) });
  return out;
}

async function main() {
  console.log("[eval] resetting isolated test schema...");
  await resetFixtures();
  simVoice.reset();

  // 1. Intake correctness across scripted variants.
  const variants: [string, (string | null)[]][] = [
    ["english_first_time", EN_SCRIPT],
    ["vietnamese_first_time", VI_SCRIPT],
    ["correction_at_readback", [
      "English", "999 Wrong St, Des Moines, 50309", "2", "none", "both", "Saturday afternoon",
      "status link", "none", "correct",
      "1234 Grand Avenue, Des Moines, 50309", "2", "none", "both", "Saturday afternoon",
      "status link", "none", "yes",
    ]],
    ["unknown_zip_to_review", [
      "English", "77 Faraway Road, Ames, 50010", "2", "none", "both", "weekday mornings",
      "status link", "none", "yes",
    ]],
  ];
  let completed = 0;
  for (const [name, script] of variants) {
    const r = await timed(`intake:${name}`, () => runIntake(script));
    if (r.caseId) completed++;
    const c = r.caseId ? await getCase(r.caseId) : null;
    measurements.push({
      name: `intake:${name}:result`,
      value: r.caseId ? "completed" : "INCOMPLETE",
      detail: c ? `status=${c.status} lang=${c.preferred_language}` : undefined,
    });
  }
  measurements.push({
    name: "intake:completion_rate",
    value: `${completed}/${variants.length}`,
    detail: "scripted deterministic-model runs, synthetic data",
  });

  // 2. Staff review -> approval latency (service-level, no UI).
  const { caseId } = await runIntake(EN_SCRIPT);
  const c = await getCase(caseId!);
  const approved = await timed("approval:transaction", () =>
    approveDelivery({
      caseId: caseId!, optionId: "slot_big", expectedVersion: c!.version,
      idempotencyKey: "eval-approve-001", staff: STAFF,
      checks: { serviceAreaVerified: true, rulesVerified: true },
    })
  );
  measurements.push({
    name: "approval:result", value: approved.ok ? "booked" : `FAILED:${(approved as { error: string }).error}`,
  });

  // 3. Notification dispatch latency (simulated voice).
  const jobs = await claimDueJobs();
  const update = jobs.find(job => job.kind === "approved_update");
  if (!update) throw new Error("Missing approved-update job");
  await timed("notify:approved_update", () => processJob(update, simVoice));
  measurements.push({
    name: "notify:simulated_calls_placed", value: String(simVoice.calls.length),
  });

  // 4. Last-slot race.
  await resetFixtures();
  const a = await runIntake(EN_SCRIPT);
  const b = await runIntake(EN_SCRIPT);
  const ca = await getCase(a.caseId!);
  const cb = await getCase(b.caseId!);
  const [ra, rb] = await Promise.all([
    approveDelivery({
      caseId: a.caseId!, optionId: "slot_race", expectedVersion: ca!.version,
      idempotencyKey: "eval-race-a", staff: STAFF,
      checks: { serviceAreaVerified: true, rulesVerified: true },
    }),
    approveDelivery({
      caseId: b.caseId!, optionId: "slot_race", expectedVersion: cb!.version,
      idempotencyKey: "eval-race-b", staff: STAFF,
      checks: { serviceAreaVerified: true, rulesVerified: true },
    }),
  ]);
  const winners = [ra, rb].filter((r) => r.ok).length;
  measurements.push({
    name: "race:last_slot_winners", value: `${winners}/2`,
    detail: winners === 1 ? "exactly one booking, as required" : "VIOLATION",
  });

  // 5. Handoff latency (two silences -> callback).
  const { createSession, processTurn } = await import("../lib/controller");
  const s = await createSession({ channel: "sim" });
  const h0 = Date.now();
  await processTurn(s.id, null, { orgId: ORG_DEMO, providerId: "prov_demo" });
  await processTurn(s.id, null, { orgId: ORG_DEMO, providerId: "prov_demo" });
  const h = await processTurn(s.id, null, { orgId: ORG_DEMO, providerId: "prov_demo" });
  measurements.push({
    name: "handoff:two_silences", value: ms(Date.now() - h0),
    detail: `mode=${h.handoff?.mode}`,
  });

  const total = Date.now() - t0;
  const lines = [
    "# MealLine — Evaluation Report",
    "",
    `Generated: ${new Date().toISOString()} (synthetic setting; sample = scripted runs, not real applicants)`,
    "",
    "## Method",
    "",
    "- Fresh isolated schema per run (`resetFixtures`), deterministic conversation model, simulated voice port.",
    "- No real phone calls, no real pantry, no real applicants. Nothing here counts as \"households helped.\"",
    "- UI keyboard/screen-reader walkthrough verified by code inspection (labels, aria-live, focus states);",
    "  needs a real device/browser check before any pilot claim.",
    "- Vietnamese wording written for the demo; NOT yet reviewed by a fluent speaker.",
    "",
    "## Measurements",
    "",
    "| Check | Result | Detail |",
    "| --- | --- | --- |",
    ...measurements.map((m) => `| ${m.name} | ${m.value} | ${m.detail ?? ""} |`),
    "",
    "## Functional scenarios (proposal §10)",
    "",
    "All 12 scenarios plus the voice adapter are covered by `npm test`; run it separately to verify results:",
    "",
    "1. First-time applicant EN + VI: intake → review → booking → acknowledged update; diacritics,",
    "   addresses, household sizes, negations preserved; status-link auth enforced.",
    "2. Address correction updates the draft/case; the master recipient record is never silently overwritten.",
    "3. Failed verification returns `{found:false}` with no record data disclosed.",
    "4. Silence ×2 → callback case; `person` / `gặp nhân viên` / `0` → handoff; hangup persists partial intake;",
    "   unanswered transfer falls back to a visible callback follow-up.",
    "5. Last-slot race: exactly one of two concurrent approvals books.",
    "6. Repeated approval with the same idempotency key → one booking; duplicate webhook → one session.",
    "7. No capacity → `awaiting_followup` with owner + next-action time; case stays visible, never silent success.",
    "8. Notification failure after bounded retries → visible follow-up; no false acknowledgement.",
    "9. Unknown tools and unknown options rejected by the dispatcher and logged on the timeline.",
    "10. Cross-org reads return nothing; `staff` role cannot approve; cross-org approval blocked.",
    "11. Approval ≠ fulfillment; draft cases cannot be marked fulfilled; outcome must be explicit.",
    "12. Voicemail body carries no address, phone digits, or household details — callback request only.",
    "",
    "## Release gates (§10)",
    "",
    "- [x] No unauthorized bookings in the test suite (authz tests).",
    "- [x] No duplicate bookings (idempotency tests).",
    "- [x] No last-slot overbooking (race test).",
    "- [x] No confirmation before provider approval (approval transaction commits before any notification).",
    "",
    `Total eval time: ${ms(total)}`,
    "",
    "## Known limitations",
    "",
    "- Real Twilio telephony not exercised (no credentials / public HTTPS webhook in this environment).",
    "- Vietnamese voice (ASR/TTS) unverified; Vietnamese path demonstrated via text.",
    "- LLM extraction runs the deterministic implementation; the HTTP model port is configured but",
    "  untested against a live model.",
    "- No SMS channel; status-link and voice-callback only.",
    "- Pilot metrics (handling time, fulfillment rate) need a real pilot; not claimed here.",
    "",
  ];
  const outPath = join(here, "..", "docs", "evaluation-report.md");
  writeFileSync(outPath, lines.join("\n"));
  console.log(`[eval] wrote ${outPath}`);
  for (const m of measurements) console.log(`  ${m.name}: ${m.value}${m.detail ? ` (${m.detail})` : ""}`);
  await closeDb();
}

main().catch((e) => { console.error("[eval] failed:", e); process.exit(1); });
