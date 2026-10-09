/** Pipecat is a voice/model adapter, never a replacement for the controller. */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PoolClient } from "pg";
import twilio from "twilio";
import { db } from "./db";
import { getSession, type SessionRow } from "./controller";
import { DraftFieldsSchema } from "./cases";
import { DeterministicModel, HttpModel, type ExtractResult, type ModelPort } from "./model";
import type { DraftFields, IntakeStep } from "./types";
import type { Locale } from "./i18n";

export class AgentError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

const Ticket = z.object({
  v: z.literal(1), sessionId: z.string().regex(/^sess_[a-f0-9]{24}$/),
  callSid: z.string().regex(/^CA[a-fA-F0-9]{32}$/),
  publicBaseUrl: z.string().url().max(400),
  exp: z.number().int(), nonce: z.string().regex(/^[a-f0-9]{24}$/),
}).strict();
export type AgentTicket = z.infer<typeof Ticket>;

function key(): string {
  const secret = process.env.MEALLINE_AGENT_KEY ?? "";
  if (secret.length < 32) throw new AgentError(503, "agent_not_configured");
  return secret;
}
function signature(body: string): Buffer {
  return createHmac("sha256", key()).update(body).digest();
}
function safePublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash
      && (url.pathname === "/" || url.pathname === "")
      && (url.protocol === "https:" || (url.protocol === "http:"
        && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch { return false; }
}

/** Only issued after MealLine has validated the inbound Twilio signature. */
export function issueAgentTicket(session: SessionRow, publicBaseUrl: string): string {
  const claims = Ticket.parse({
    v: 1, sessionId: session.id, callSid: session.provider_call_id,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
    exp: Math.floor(Date.now() / 1000) + 3600, nonce: randomBytes(12).toString("hex"),
  });
  if (!safePublicUrl(claims.publicBaseUrl)) throw new AgentError(503, "invalid_public_url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${signature(body).toString("base64url")}`;
}

export function verifyAgentTicket(token: string): AgentTicket {
  if (token.length > 1500 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new AgentError(401, "invalid_agent_ticket");
  }
  const [body, mac] = token.split(".");
  const received = Buffer.from(mac, "base64url");
  const expected = signature(body);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AgentError(401, "invalid_agent_ticket");
  }
  let claims: AgentTicket;
  try { claims = Ticket.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8"))); }
  catch { throw new AgentError(401, "invalid_agent_ticket"); }
  if (claims.exp <= Date.now() / 1000 || !safePublicUrl(claims.publicBaseUrl)) {
    throw new AgentError(401, "expired_agent_ticket");
  }
  return claims;
}

export async function authenticatedAgentSession(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(header);
  if (!match) throw new AgentError(401, "agent_ticket_required");
  const claims = verifyAgentTicket(match[1]);
  const session = await getSession(claims.sessionId);
  if (!session || session.channel !== "voice" || session.provider_call_id !== claims.callSid) {
    throw new AgentError(401, "invalid_agent_session");
  }
  return { claims, session };
}

export function streamingLanguage(language: Locale): boolean {
  // Preserve Vietnamese on its existing Twilio voice path, not Nova-3 multi.
  return language === "en" || language === "es";
}

export function localAgentUrl(): string {
  const value = process.env.MEALLINE_AGENT_URL ?? "http://127.0.0.1:7860";
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new AgentError(503, "invalid_agent_url");
  }
  return value.replace(/\/$/, "");
}

/** Opt-in; unhealthy or unsupported streaming always leaves Gather available. */
export async function pipecatTwiml(session: SessionRow, base: string): Promise<string | null> {
  if (process.env.MEALLINE_VOICE_TRANSPORT !== "pipecat" || session.status !== "active"
    || session.step === "language" || !streamingLanguage(session.language)) return null;
  try {
    const health = await fetch(`${localAgentUrl()}/agent/health`, { signal: AbortSignal.timeout(1500) });
    if (!health.ok || (await health.json()).status !== "ready") return null;
    const token = issueAgentTicket(session, base);
    const vr = new twilio.twiml.VoiceResponse();
    vr.connect().stream({ url: `${base.replace(/^http/, "ws")}/api/voice/stream/${token}` });
    // Stream failure, language change, completion, and transfer all resume in
    // MealLine. Pipecat never dials a number or promises/approves a delivery.
    vr.redirect({ method: "POST" }, `${base}/api/voice/turn?agentResume=1&agentFallback=1`);
    return vr.toString();
  } catch { return null; }
}

const Proposal = z.object({
  intent: z.enum(["answer", "confirm", "deny", "correct", "repeat", "human", "unsupported_language", "skip"]),
  fields: DraftFieldsSchema,
  unknowns: z.array(z.string().max(100)).max(30),
  languageHint: z.enum(["en", "vi", "es"]).optional(),
  neededLanguage: z.string().max(100).optional(), confidence: z.number().min(0).max(1),
}).strict();
const STEP_FIELDS: Record<IntakeStep, (keyof DraftFields)[]> = {
  language: [], address: ["address"], household: ["household"],
  dietary: ["dietaryAvoid", "dietaryNotes"], equipment: ["equipment"],
  availability: ["availability"], contact: ["contactPreference", "contactPhone", "contactName"],
  accommodation: ["accommodation"], review: [],
};
export function validatedProposal(raw: unknown, step: IntakeStep): ExtractResult {
  const proposal = Proposal.parse(raw);
  const fields = Object.fromEntries(Object.entries(proposal.fields)
    .filter(([name]) => STEP_FIELDS[step].includes(name as keyof DraftFields)));
  return { ...proposal, fields };
}

export function pipecatModel(): ModelPort {
  const det = new DeterministicModel();
  const http = new HttpModel(`${localAgentUrl()}/internal/interpret`, key());
  return {
    name: "pipecat-structured-model-with-deterministic-fallback",
    async interpret(step, input, locale) {
      const fixed = await det.interpret(step, input, locale);
      // Keypad and explicit safety/control intents never depend on the LLM.
      if (/^\d$/.test(input.trim()) || ["human", "repeat", "correct"].includes(fixed.intent)) return fixed;
      try { return validatedProposal(await http.interpret(step, input, locale), step); }
      catch { return fixed; }
    },
  };
}

const active = new Set<string>();
/** Cross-process session serialization; bounded leases leave pool capacity. */
export async function withAgentSessionLock<T>(sessionId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
  if (active.has(sessionId)) throw new AgentError(409, "turn_in_progress");
  if (active.size >= 4) throw new AgentError(429, "agent_busy");
  active.add(sessionId);
  const client = await db().connect().catch((error: unknown) => { active.delete(sessionId); throw error; });
  let locked = false;
  try {
    const result = await client.query(`SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked`, [sessionId]);
    locked = result.rows[0].locked === true;
    if (!locked) throw new AgentError(409, "turn_in_progress");
    return await action(client);
  } finally {
    try { if (locked) await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [sessionId]); }
    finally { client.release(); active.delete(sessionId); }
  }
}
