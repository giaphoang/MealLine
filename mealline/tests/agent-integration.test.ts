import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createSession, getSession, processTurn, explicitConfirmation } from "../lib/controller";
import { issueAgentTicket, verifyAgentTicket, validatedProposal } from "../lib/agent";
import { DeterministicModel, type ModelPort } from "../lib/model";
import { GET as agentSession } from "../app/api/voice/agent/session/route";
import { POST as agentTurn } from "../app/api/voice/agent/turn/route";
import { POST as voiceTurn } from "../app/api/voice/turn/route";
import { POST as inbound } from "../app/api/voice/inbound/route";
import { POST as voiceStatus } from "../app/api/voice/status/route";
import { resetFixtures, teardown, ORG_DEMO, PROVIDER, EN_SCRIPT } from "./fixtures";
import { getCase } from "../lib/cases";
import { db } from "../lib/db";

const TOKEN_KEY = "test-only-agent-key-" + "a".repeat(48);
const AUTH = "test-only-twilio-secret";
const BASE = "https://phone-test.example";
function sid() { return "CA" + randomBytes(16).toString("hex"); }
function request(path: string, ticket?: string, body?: object) {
  return new NextRequest(BASE + path, { method: body ? "POST" : "GET",
    headers: { ...(ticket ? { authorization: `Bearer ${ticket}` } : {}), "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
function signedVoice(path: string, params: Record<string, string>) {
  const text = BASE + path + Object.keys(params).sort().map(k => k + params[k]).join("");
  const signature = createHmac("sha1", AUTH).update(text).digest("base64");
  return new NextRequest(BASE + path, { method: "POST", headers: { host: "phone-test.example", "x-forwarded-proto": "https",
    "x-twilio-signature": signature, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
}
async function setup() {
  process.env.MEALLINE_AGENT_KEY = TOKEN_KEY;
  process.env.TWILIO_AUTH_TOKEN = AUTH;
  await resetFixtures();
}

test("agent: authenticated, scoped, expiring call capabilities", async () => {
  await setup();
  const session = await createSession({ channel: "voice", providerCallId: sid() });
  const ticket = issueAgentTicket(session, BASE);
  assert.equal(verifyAgentTicket(ticket).sessionId, session.id);
  assert.equal((await agentSession(request("/api/voice/agent/session"))).status, 401);
  assert.equal((await agentSession(request("/api/voice/agent/session", ticket))).status, 200);
  const [body] = ticket.split(".");
  assert.throws(() => verifyAgentTicket(body + "." + "a".repeat(43)));
  const claims = { ...verifyAgentTicket(ticket), exp: Math.floor(Date.now() / 1000) - 1 };
  const expiredBody = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const expired = expiredBody + "." + createHmac("sha256", TOKEN_KEY).update(expiredBody).digest("base64url");
  assert.throws(() => verifyAgentTicket(expired));
  await db().query(`UPDATE conversation_sessions SET provider_call_id=$1 WHERE id=$2`, [sid(), session.id]);
  assert.equal((await agentSession(request("/api/voice/agent/session", ticket))).status, 401);
  await teardown();
});

test("agent: replay does not advance twice; changed input and stale step rejected", async () => {
  await setup();
  const session = await createSession({ channel: "voice", providerCallId: sid() });
  const ticket = issueAgentTicket(session, BASE);
  const body = { requestId: randomUUID(), expectedStep: "language", input: "1" };
  const first = await agentTurn(request("/api/voice/agent/turn", ticket, body));
  assert.equal(first.status, 200);
  const original = await first.json();
  assert.equal(original.step, "address");
  const repeated = await agentTurn(request("/api/voice/agent/turn", ticket, body));
  assert.equal(repeated.status, 200);
  assert.deepEqual(await repeated.json(), original);
  assert.equal((await agentTurn(request("/api/voice/agent/turn", ticket, { ...body, input: "2" }))).status, 409);
  assert.equal((await agentTurn(request("/api/voice/agent/turn", ticket, { ...body, requestId: randomUUID() }))).status, 409);
  assert.equal((await db().query(`SELECT count(*)::int AS n FROM conversation_turns WHERE session_id=$1`, [session.id])).rows[0].n, 1);
  await teardown();
});

test("agent: concurrent copies produce one controller turn", async () => {
  await setup();
  const session = await createSession({ channel: "voice", providerCallId: sid() });
  const ticket = issueAgentTicket(session, BASE);
  const body = { requestId: randomUUID(), expectedStep: "language", input: "1" };
  const replies = await Promise.all([agentTurn(request("/api/voice/agent/turn", ticket, body)), agentTurn(request("/api/voice/agent/turn", ticket, body))]);
  assert.ok(replies.some(r => r.status === 200));
  assert.ok(replies.every(r => r.status === 200 || r.status === 409));
  assert.equal((await db().query(`SELECT count(*)::int AS n FROM conversation_turns WHERE session_id=$1`, [session.id])).rows[0].n, 1);
  await teardown();
});

test("agent: untrusted model cannot invent review confirmation or future fields", async () => {
  await setup();
  assert.equal(explicitConfirmation("not yes"), false);
  assert.equal(explicitConfirmation("yes, but the address is wrong"), false);
  assert.equal(explicitConfirmation("yes"), true);
  assert.equal(explicitConfirmation("đúng rồi"), true);
  assert.equal(explicitConfirmation("sí"), true);
  const proposal = validatedProposal({ intent: "answer", fields: { household: { size: 3 }, contactPhone: "5155550123" }, unknowns: [], confidence: 0.9 }, "household");
  assert.deepEqual(proposal.fields, { household: { size: 3 } });
  assert.throws(() => validatedProposal({ intent: "approve_delivery", fields: {}, unknowns: [], confidence: 1 }, "review"));
  const session = await createSession({ channel: "voice", providerCallId: sid() });
  await db().query(`UPDATE conversation_sessions SET step='review' WHERE id=$1`, [session.id]);
  const malicious: ModelPort = { name: "malicious", async interpret() { return { intent: "confirm", fields: {}, unknowns: [], confidence: 1 }; } };
  const result = await processTurn(session.id, "yes, but my address is wrong", { orgId: ORG_DEMO, providerId: PROVIDER }, malicious);
  assert.equal(result.done, false);
  assert.equal((await getSession(session.id))?.case_id, null);
  await teardown();
});

test("agent: phone resume preserves step and does not count a failed input", async () => {
  await setup();
  const callSid = sid();
  const session = await createSession({ channel: "voice", providerCallId: callSid });
  await processTurn(session.id, "1", { orgId: ORG_DEMO, providerId: PROVIDER });
  const response = await voiceTurn(signedVoice("/api/voice/turn?agentResume=1&agentFallback=1", { CallSid: callSid }));
  assert.equal(response.status, 200);
  const xml = await response.text();
  assert.ok(xml.includes("<Gather"));
  assert.ok(xml.includes("agentFallback=1"));
  assert.ok(!xml.includes("<Connect"));
  const saved = await getSession(session.id);
  assert.equal(saved?.step, "address");
  assert.equal(saved?.consecutive_failures, 0);
  await teardown();
});

test("agent: language keypad preserves Vietnamese fallback and Spanish selection", async () => {
  const model = new DeterministicModel();
  assert.equal((await model.interpret("language", "1", "en")).languageHint, "en");
  assert.equal((await model.interpret("language", "2", "en")).languageHint, "vi");
  assert.equal((await model.interpret("language", "9", "en")).languageHint, "es");
});

test("agent: all intake phases use the controller; submission still requires staff approval", async (context) => {
  await setup();
  const model = new DeterministicModel();
  const interpreted: string[] = [];
  context.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    const payload = JSON.parse(String(options?.body));
    interpreted.push(payload.step);
    return Response.json(await model.interpret(payload.step, payload.input, payload.locale));
  });
  const callSid = sid();
  const session = await createSession({ channel: "voice", providerCallId: callSid });
  const ticket = issueAgentTicket(session, BASE);
  let result: { step: string; done: boolean; caseNumber?: string } = { step: "language", done: false };
  for (const input of EN_SCRIPT) {
    const response = await agentTurn(request("/api/voice/agent/turn", ticket, {
      requestId: randomUUID(), expectedStep: result.step, input,
    }));
    assert.equal(response.status, 200);
    result = await response.json();
  }
  assert.ok(result.done);
  const saved = await getSession(session.id);
  assert.equal(saved?.status, "completed");
  const c = await getCase(saved!.case_id!);
  assert.equal(c?.status, "needs_review");
  assert.equal(c?.confirmed_fields.household?.size, 4);
  assert.deepEqual(c?.confirmed_fields.dietaryAvoid, []);
  assert.equal(c?.confirmed_fields.equipment?.fridge, true);
  assert.equal(c?.confirmed_fields.contactPhone, "5155550142");
  assert.ok(interpreted.includes("address") && interpreted.includes("review"));
  assert.equal((await db().query(`SELECT count(*)::int AS n FROM bookings`)).rows[0].n, 0);
  assert.equal((await db().query(`SELECT count(*)::int AS n FROM voice_agent_turns WHERE session_id=$1`, [session.id])).rows[0].n, 9);
  const resumed = await voiceTurn(signedVoice("/api/voice/turn?agentResume=1&agentFallback=1", { CallSid: callSid }));
  const xml = await resumed.text();
  assert.ok(xml.includes("<Hangup") && !xml.includes("<Gather") && !xml.includes("<Dial"));
  await teardown();
});

test("agent: signed language selection enables stream, with Vietnamese and outage fallback", async (context) => {
  await setup();
  process.env.MEALLINE_VOICE_TRANSPORT = "pipecat";
  let ready = true;
  context.mock.method(globalThis, "fetch", async () => Response.json({ status: ready ? "ready" : "configuration_required" }, { status: ready ? 200 : 503 }));
  try {
    const unsigned = new NextRequest(BASE + "/api/voice/inbound", { method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ CallSid: sid() }) });
    assert.equal((await inbound(unsigned)).status, 403);
    const en = await createSession({ channel: "voice", providerCallId: sid() });
    const response = await voiceTurn(signedVoice("/api/voice/turn", { CallSid: en.provider_call_id!, Digits: "1" }));
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.ok(xml.includes("<Connect>") && xml.includes("wss://phone-test.example/api/voice/stream/"));
    const token = xml.match(/\/api\/voice\/stream\/([^" ]+)/)?.[1];
    assert.equal(verifyAgentTicket(token!).callSid, en.provider_call_id);
    assert.ok(xml.includes("agentResume=1&amp;agentFallback=1"));
    const vi = await createSession({ channel: "voice", providerCallId: sid() });
    const viXml = await (await voiceTurn(signedVoice("/api/voice/turn", { CallSid: vi.provider_call_id!, Digits: "2" }))).text();
    assert.ok(viXml.includes("<Gather") && !viXml.includes("<Connect"));
    ready = false;
    const es = await createSession({ channel: "voice", providerCallId: sid() });
    const esXml = await (await voiceTurn(signedVoice("/api/voice/turn", { CallSid: es.provider_call_id!, Digits: "9" }))).text();
    assert.ok(esXml.includes("<Gather") && !esXml.includes("<Connect"));
  } finally {
    process.env.MEALLINE_VOICE_TRANSPORT = "twiml";
    await teardown();
  }
});

test("agent: keypad human handoff resumes original Dial and hangup saves a draft", async () => {
  await setup();
  const callSid = sid();
  const session = await createSession({ channel: "voice", providerCallId: callSid });
  const ticket = issueAgentTicket(session, BASE);
  const response = await agentTurn(request("/api/voice/agent/turn", ticket, {
    requestId: randomUUID(), expectedStep: "language", input: "0",
  }));
  assert.equal((await response.json()).handoff?.mode, "transfer");
  const xml = await (await voiceTurn(signedVoice("/api/voice/turn?agentResume=1&agentFallback=1", { CallSid: callSid }))).text();
  assert.ok(xml.includes("<Dial") && xml.includes("+15550100199"));
  const interrupted = await createSession({ channel: "voice", providerCallId: sid() });
  await processTurn(interrupted.id, "1", { orgId: ORG_DEMO, providerId: PROVIDER });
  await voiceStatus(signedVoice("/api/voice/status", { CallSid: interrupted.provider_call_id!, CallStatus: "completed" }));
  assert.equal((await getSession(interrupted.id))?.status, "abandoned");
  await teardown();
});

test("agent: model outage preserves deterministic intake instead of failing the call", async (context) => {
  await setup();
  context.mock.method(globalThis, "fetch", async () => Response.json({ error: "model_unavailable" }, { status: 503 }));
  const session = await createSession({ channel: "voice", providerCallId: sid() });
  await processTurn(session.id, "1", { orgId: ORG_DEMO, providerId: PROVIDER });
  const response = await agentTurn(request("/api/voice/agent/turn", issueAgentTicket(session, BASE), {
    requestId: randomUUID(), expectedStep: "address", input: "1234 Grand Avenue, Des Moines, 50312",
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).step, "household");
  assert.equal((await getSession(session.id))?.draft_fields.address?.zip, "50312");
  await teardown();
});
