import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { sendIntakeToNourish } from "../lib/nourish";
import { createSession, processTurn } from "../lib/controller";
import { getCase } from "../lib/cases";
import { db } from "../lib/db";
import { EN_SCRIPT, ORG_DEMO, PROVIDER, resetFixtures, runIntake, teardown } from "./fixtures";

// Node 20's lazy fetch getter must be materialized before mock.method replaces it.
assert.equal(typeof globalThis.fetch, "function");

const BASE = "http://127.0.0.1:3003";
const TOKEN = "synthetic-nourish-service-token-not-a-real-credential";
const SOURCE = { caseId: "fixture-case-id", caseNumber: "ML-fixture-001", language: "en" };
const RECEIPT = { intakeId: SOURCE.caseId, shoppingListId: 1, matchedCount: 2 };

function setEnv(context: TestContext, name: string, value: string | undefined) {
  const before = process.env[name];
  context.after(() => { if (before === undefined) delete process.env[name]; else process.env[name] = before; });
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

function configure(context: TestContext, url: string | undefined = BASE, token: string | undefined = TOKEN) {
  setEnv(context, "NOURISH_API_URL", url);
  setEnv(context, "NOURISH_VOICE_API_TOKEN", token);
}

test("MealLine: unconfigured URL remains a no-op", async (context) => {
  configure(context, "", "");
  let requested = false;
  context.mock.method(globalThis, "fetch", async () => { requested = true; throw new Error("unexpected request"); });
  assert.equal(await sendIntakeToNourish({}, SOURCE), null);
  assert.equal(requested, false);
});

test("MealLine: missing service token cannot use Twilio or agent credentials", async (context) => {
  configure(context, BASE, "");
  setEnv(context, "TWILIO_AUTH_TOKEN", "synthetic-twilio-token");
  setEnv(context, "MEALLINE_AGENT_KEY", "synthetic-agent-key");
  let requested = false;
  context.mock.method(globalThis, "fetch", async () => { requested = true; return Response.json(RECEIPT); });
  await assert.rejects(sendIntakeToNourish({}, SOURCE), { message: "nourish_service_token_missing" });
  assert.equal(requested, false);
});

test("MealLine: service token is header-only; existing intake constraints are preserved", async (context) => {
  configure(context, BASE + "/");
  context.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(String(url), BASE + "/api/voice-intakes");
    assert.equal(new Headers(options?.headers).get("x-nourish-voice-token"), TOKEN);
    assert.equal(new Headers(options?.headers).get("Content-Type"), "application/json");
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal instanceof AbortSignal);
    const body = String(options?.body);
    assert.ok(!String(url).includes(TOKEN) && !body.includes(TOKEN));
    const intake = JSON.parse(body).intake;
    assert.equal(intake.id, SOURCE.caseId);
    assert.equal(intake.caseNumber, SOURCE.caseNumber);
    assert.equal(intake.phone, "2025550100");
    assert.deepEqual(intake.dietaryAvoid, ["peanut"]);
    assert.equal(intake.hasStove, false);
    assert.equal(intake.hasFridge, true);
    return Response.json({ ...RECEIPT, items: [] }, { status: 201 });
  });
  assert.deepEqual(await sendIntakeToNourish({ contactPhone: "2025550100", dietaryAvoid: ["peanut"], equipment: { stove: false, fridge: true } }, SOURCE), RECEIPT);
});

test("MealLine: remote HTTPS is accepted, but unsafe URLs never receive a token", async (context) => {
  configure(context, "https://nourish.example.invalid");
  let requests = 0;
  context.mock.method(globalThis, "fetch", async () => { requests++; return Response.json(RECEIPT); });
  assert.deepEqual(await sendIntakeToNourish({}, SOURCE), RECEIPT);
  for (const url of ["http://nourish.example.invalid", "https://user:password@nourish.example.invalid", "https://nourish.example.invalid?key=secret", "https://nourish.example.invalid#fragment", "file:///private/tmp/intake", "invalid"]) {
    process.env.NOURISH_API_URL = url;
    await assert.rejects(sendIntakeToNourish({}, SOURCE), { message: "nourish_invalid_url" });
  }
  assert.equal(requests, 1);
});

test("MealLine: HTTP failures do not expose tokens or caller data", async (context) => {
  configure(context);
  context.mock.method(globalThis, "fetch", async () => new Response("private caller address " + TOKEN, { status: 401 }));
  await assert.rejects(sendIntakeToNourish({}, SOURCE), { message: "nourish_401" });
});

test("MealLine: connection, timeout, and redirect errors are sanitized", async (context) => {
  configure(context);
  context.mock.method(globalThis, "fetch", async () => { throw new Error("private transport diagnostics " + TOKEN); });
  await assert.rejects(sendIntakeToNourish({}, SOURCE), { message: "nourish_unavailable" });
});

test("MealLine: malformed receipts never expose response contents or report success", async (context) => {
  configure(context);
  for (const body of ["private diagnostics " + TOKEN, JSON.stringify({ intakeId: "x" }), JSON.stringify({ ...RECEIPT, shoppingListId: -1 }), JSON.stringify({ ...RECEIPT, matchedCount: -1 })]) {
    const mock = context.mock.method(globalThis, "fetch", async () => new Response(body, { status: 201 }));
    await assert.rejects(sendIntakeToNourish({}, SOURCE), { message: "nourish_invalid_response" });
    mock.mock.restore();
  }
});

test("MealLine: only confirmed intake syncs; the case still requires staff approval", async (context) => {
  configure(context);
  context.after(teardown);
  await resetFixtures();
  const requests: { intake: Record<string, unknown> }[] = [];
  context.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(String(url), BASE + "/api/voice-intakes");
    assert.equal(new Headers(options?.headers).get("x-nourish-voice-token"), TOKEN);
    requests.push(JSON.parse(String(options?.body)));
    return Response.json(RECEIPT, { status: 201 });
  });
  const session = await createSession({ channel: "voice" });
  for (const line of EN_SCRIPT.slice(0, -1)) {
    const partial = await processTurn(session.id, line, { orgId: ORG_DEMO, providerId: PROVIDER });
    assert.equal(partial.done, false);
    assert.equal(requests.length, 0);
  }
  const result = await processTurn(session.id, "yes", { orgId: ORG_DEMO, providerId: PROVIDER });
  assert.equal(result.done, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].intake.id, result.caseId);
  assert.equal(requests[0].intake.caseNumber, result.caseNumber);
  assert.equal(requests[0].intake.householdSize, 4);
  assert.equal(requests[0].intake.hasFridge, true);
  assert.equal((await getCase(result.caseId!))?.status, "needs_review");
  const events = await db().query("SELECT detail FROM case_events WHERE case_id=$1 AND event_type='nourish_intake_created'", [result.caseId]);
  assert.equal(events.rows.length, 1);
  assert.deepEqual(events.rows[0].detail, RECEIPT);
  assert.equal((await db().query("SELECT count(*)::int AS n FROM bookings")).rows[0].n, 0);
});

test("MealLine: rejected sync stays visible without failing intake or auto-approving", async (context) => {
  configure(context);
  context.after(teardown);
  await resetFixtures();
  context.mock.method(globalThis, "fetch", async () => new Response("private caller data " + TOKEN, { status: 401 }));
  const result = await runIntake(EN_SCRIPT, "voice");
  assert.equal(result.last.done, true);
  assert.equal((await getCase(result.caseId!))?.status, "needs_review");
  const events = await db().query("SELECT detail FROM case_events WHERE case_id=$1 AND event_type='nourish_bridge_failed'", [result.caseId]);
  assert.deepEqual(events.rows.map(row => row.detail), [{ error: "nourish_401" }]);
});
