/**
 * Conversation controller: one question at a time, step enforced server-side.
 * Shared by the voice webhook, the accessible text form, and the simulator.
 * The model proposes interpretations; the controller validates and dispatches
 * only allow-listed tools.
 */
import { db, inTransaction } from "./db";
import { phoneEnabled, queuePhoneCommand, callSnapshot, commandId } from './nourishPhone';
import { newPhoneState, phonePrompt, processPhoneTurn, type PhoneState, type PhonePorts } from './phoneFlow';
import { newId } from "./ids";
import { t, type Locale } from "./i18n";
import { defaultModel, type ModelPort } from "./model";
import { dispatchTool } from "./tools";
import {
  createCaseFromDraft, recordEvent,
  type CaseRow,
} from "./cases";
import {
  INTAKE_STEPS, nextStep, prevStep,
  type Channel, type DraftFields, type IntakeStep,
} from "./types";
import { issueStatusLink } from "./statusLinks";

export interface SessionRow {
  phone_state?: PhoneState | null;
  id: string;
  provider_call_id: string | null;
  channel: Channel;
  case_id: string | null;
  step: IntakeStep;
  language: Locale;
  draft_fields: DraftFields;
  consecutive_failures: number;
  last_input_at: string | null;
  status: "active" | "transferred" | "callback" | "completed" | "abandoned";
}

function toSession(r: Record<string, unknown>): SessionRow {
  return {
    phone_state: (r.phone_state as PhoneState | null) ?? null,
    id: r.id as string,
    provider_call_id: (r.provider_call_id as string) ?? null,
    channel: r.channel as Channel,
    case_id: (r.case_id as string) ?? null,
    step: r.step as IntakeStep,
    language: r.language as Locale,
    draft_fields: (r.draft_fields as DraftFields) ?? {},
    consecutive_failures: r.consecutive_failures as number,
    last_input_at: (r.last_input_at as string) ?? null,
    status: r.status as SessionRow["status"],
  };
}

export async function createSession(opts: {
  channel: Channel; providerCallId?: string;
}): Promise<SessionRow> {
  const r = await db().query(
    `INSERT INTO conversation_sessions (id, provider_call_id, channel, step, language, draft_fields, phone_state)
     VALUES ($1,$2,$3,'language','en','{}'::jsonb,$4::jsonb)
     ON CONFLICT (provider_call_id) DO UPDATE SET updated_at = now()
     RETURNING *`,
    [newId("sess"), opts.providerCallId ?? null, opts.channel, opts.channel === 'voice' && phoneEnabled() ? JSON.stringify(newPhoneState()) : null]
  );
  return toSession(r.rows[0] as Record<string, unknown>);
}

export async function getSession(id: string): Promise<SessionRow | null> {
  const r = await db().query(`SELECT * FROM conversation_sessions WHERE id = $1`, [id]);
  return r.rows.length ? toSession(r.rows[0] as Record<string, unknown>) : null;
}

export async function getSessionByCallId(callId: string): Promise<SessionRow | null> {
  const r = await db().query(
    `SELECT * FROM conversation_sessions WHERE provider_call_id = $1`, [callId]
  );
  return r.rows.length ? toSession(r.rows[0] as Record<string, unknown>) : null;
}

export async function getSessionByCaseId(caseId: string): Promise<SessionRow | null> {
  const r = await db().query(
    `SELECT * FROM conversation_sessions WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [caseId]
  );
  return r.rows.length ? toSession(r.rows[0] as Record<string, unknown>) : null;
}

export interface TurnLogRow {
  turn_index: number; step: string; input: string | null;
  reply: string; language: Locale; created_at: string;
}

/** Persist one conversation turn for the staff transcript view (best-effort). */
async function logTurn(
  sessionId: string, step: string, input: string | null,
  reply: string, language: Locale
): Promise<void> {
  const r = await db().query(
    `SELECT count(*)::int AS n FROM conversation_turns WHERE session_id = $1`,
    [sessionId]
  );
  const idx = (r.rows[0] as { n: number }).n;
  await db().query(
    `INSERT INTO conversation_turns (id, session_id, turn_index, step, input, reply, language)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [newId("turn"), sessionId, idx, step, input, reply, language]
  );
}

export async function getSessionTurns(sessionId: string): Promise<TurnLogRow[]> {
  const r = await db().query(
    `SELECT t.turn_index,t.step,t.input,t.reply,t.language,t.created_at
     FROM conversation_turns t JOIN conversation_sessions s ON s.id=t.session_id
     WHERE t.session_id=$1 AND (s.phone_state IS NULL OR s.created_at>=now()-interval '30 days') ORDER BY t.turn_index ASC`,
    [sessionId]
  );
  return r.rows as unknown as TurnLogRow[];
}

async function saveSession(s: SessionRow): Promise<void> {
  await db().query(
    `UPDATE conversation_sessions
     SET step = $1, language = $2, draft_fields = $3::jsonb,
         consecutive_failures = $4, status = $5, case_id = $6,
         last_input_at = now(), updated_at = now(), phone_state = $8::jsonb
     WHERE id = $7`,
    [s.step, s.language, JSON.stringify(s.draft_fields), s.consecutive_failures,
     s.status, s.case_id, s.id, s.phone_state ? JSON.stringify(s.phone_state) : null]
  );
}

export function promptFor(step: IntakeStep, locale: Locale): string {
  const S = t(locale);
  switch (step) {
    case "language": return S.ask_language;
    case "address": return S.ask_address;
    case "household": return S.ask_household;
    case "dietary": return S.ask_dietary;
    case "equipment": return S.ask_equipment;
    case "availability": return S.ask_availability;
    case "contact": return S.ask_contact;
    case "accommodation": return S.ask_accommodation;
    case "review": throw new Error("use buildReadback for the review step");
  }
}

/** Read back critical details in the selected language. Never translates proper names. */
export function buildReadback(session: SessionRow, locale: Locale): string {
  const S = t(locale);
  const d = session.draft_fields;
  const lines: string[] = [S.readback_intro];
  if (d.address?.raw) lines.push(S.readback_address(d.address.raw));
  if (d.household?.size != null) lines.push(S.readback_household(d.household.size));
  if (d.availability) {
    const days = d.availability.days.map((k) =>
      S.day_names[["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].indexOf(k)] ?? k
    ).join(", ");
    const times = d.availability.times.map((k) => S.time_names[k] ?? k).join(", ");
    const bits = [days, times].filter(Boolean).join("; ");
    lines.push(S.readback_availability(bits || d.availability.raw));
  }
  if (d.contactPreference === "callback" && d.contactPhone)
    lines.push(S.readback_contact_call(d.contactPhone));
  else if (d.contactPreference === "status_link")
    lines.push(S.readback_contact_link());
  if (d.accommodation && d.accommodation !== "none")
    lines.push(S.readback_accommodation(d.accommodation));
  if (d.dietaryAvoid?.length)
    lines.push(S.readback_dietary(d.dietaryAvoid.join(", ")));
  else if (d.dietaryNotes)
    lines.push(S.readback_dietary(d.dietaryNotes));
  if (d.equipment) {
    const bits: string[] = [];
    if (d.equipment.stove) bits.push("stove");
    if (d.equipment.fridge) bits.push("fridge");
    if (d.equipment.notes) bits.push(d.equipment.notes);
    if (bits.length) lines.push(S.readback_equipment(bits.join(", ")));
  }
  lines.push(S.confirm_question);
  return lines.join(" ");
}

export interface TurnResult {
  reply: string;
  done: boolean;
  handoff: { mode: "transfer" | "callback"; reason: string } | null;
  caseId?: string;
  caseNumber?: string;
  statusLinkPath?: string;
  session: SessionRow;
}

export interface TurnOptions {
  phonePorts?: PhonePorts;
  orgId: string;
  providerId: string;
  publicBaseUrl?: string;
}

const STEP_FIELD: Record<IntakeStep, keyof DraftFields | null> = {
  language: null, address: "address", household: "household",
  dietary: "dietaryAvoid", equipment: "equipment",
  availability: "availability", contact: null, accommodation: "accommodation",
  review: null,
};

function clearStepField(draft: DraftFields, step: IntakeStep): DraftFields {
  const f = STEP_FIELD[step];
  if (!f) {
    if (step === "contact") {
      const { contactPreference, contactPhone, ...rest } = draft;
      return rest;
    }
    return draft;
  }
  if (step === "dietary") {
    const { dietaryAvoid, dietaryNotes, ...rest } = draft;
    return rest;
  }
  const next = { ...draft };
  delete next[f];
  return next;
}

export async function processTurn(
  sessionId: string,
  rawInput: string | null,
  opts: TurnOptions,
  model: ModelPort = defaultModel()
): Promise<TurnResult> {
  return inTransaction(async () => {
    await db().query('SELECT id FROM conversation_sessions WHERE id=$1 FOR UPDATE', [sessionId]);
    return processTurnLocked(sessionId,rawInput,opts,model);
  });
}
async function processTurnLocked(sessionId: string, rawInput: string | null, opts: TurnOptions, model: ModelPort): Promise<TurnResult> {
  let session = await getSession(sessionId);
  if (!session) throw new Error("session_not_found");
  const S = () => t(session.language);
  const input = (rawInput ?? "").trim();
  const originalStep = session.phone_state ? session.phone_state.phase === 'intake' ? session.step : session.phone_state.phase : session.step;
  const logInput = originalStep === 'verify' || (session.phone_state && /^\d{6}$/.test(input.replace(/[ -]/g,''))) ? '[verification entry redacted]'
    : session.phone_state && !session.phone_state.privacy ? originalStep==='privacy'?'[privacy choice]':'' : input;
  const finish = async (partial: Partial<TurnResult>): Promise<TurnResult> => {
    const result: TurnResult = { reply: "", done: false, handoff: null, session, ...partial };
    // Best-effort transcript logging for the staff review view.
    if(session.phone_state)await logTurn(session.id,originalStep,logInput || null,result.reply,session.language);
    else await logTurn(session.id, originalStep, logInput || null, result.reply, session.language).catch(() => undefined);
    return result;
  };

  if (session.status !== "active") {
    return finish({ reply: S().hangup_saved, done: true });
  }
  if (session.phone_state) {
    session.last_input_at=new Date().toISOString();
    const result = await processPhoneTurn(session, rawInput, opts, model, s => buildReadback(s,s.language), opts.phonePorts);
    await saveSession(session);
    await finish(result);
    if (session.phone_state.privacy) {
      const awaitingCallback=session.phone_state.phase==='callback_wait';
      const call = await callSnapshot(session, awaitingCallback ? 'draft' : result.session.status === 'completed' ? 'confirmed' : result.session.status === 'active' ? 'draft' : 'needs_followup',
        awaitingCallback?'Awaiting a verified return call; food request not yet submitted.':result.session.status === 'active' ? 'Phone intake in progress; not a confirmed delivery.' : 'Call saved; MealLine staff retain fulfilment approval.');
      call.caseNumber = session.phone_state.caseNumber;
      const live = session.phone_state.grant && Date.parse(session.phone_state.grant.expiresAt)>Date.now() && !session.phone_state.isNew;
      await queuePhoneCommand({ id: commandId(), callId: session.id, kind: 'save_draft', call,
        clientId: live ? session.phone_state.clientId : undefined, grant: live ? session.phone_state.grant : undefined,
        confirmedAt: live ? new Date().toISOString() : undefined }, session.id);
    }
    return result;
  }

  // Fresh session, no input yet: greet instead of counting a failed attempt.
  // (The text form and simulator open with an empty first turn. Voice
  // already greeted via TwiML in /api/voice/inbound, so this is text/sim only.)
  // Gated on last_input_at so it fires exactly once.
  if (!input && session.channel !== "voice" && session.last_input_at == null) {
    const S0 = t(session.language);
    session.last_input_at = new Date().toISOString();
    await saveSession(session);
    return finish({ reply: `${S0.greeting} ${promptForStep(session)}` });
  }

  // Silence / empty input counts as a failed attempt.
  if (!input) {
    session.consecutive_failures += 1;
    if (session.consecutive_failures >= 2) {
      return await handoff(session, opts, "no_input", finish, S);
    }
    await saveSession(session);
    return finish({ reply: S().no_input });
  }

  let extracted;
  try {
    extracted = await model.interpret(session.step, input, session.language);
  } catch {
    // Model failure -> fixed question fallback.
    session.consecutive_failures += 1;
    if (session.consecutive_failures >= 2) {
      return await handoff(session, opts, "model_failure", finish, S);
    }
    await saveSession(session);
    return finish({ reply: `${S().model_unavailable} ${promptForStep(session)}` });
  }

  // Language switch applies immediately, mid-flow.
  if (extracted.languageHint && extracted.languageHint !== session.language) {
    session.language = extracted.languageHint;
  }

  const ctx = {
    sessionId: session.id, caseId: session.case_id ?? undefined,
    orgId: opts.orgId, actor: "applicant" as const, channel: session.channel,
  };

  switch (extracted.intent) {
    case "human":
      return await handoff(session, opts, "applicant_requested", finish, S);
    case "repeat":
      await saveSession(session);
      return finish({ reply: `${S().repeat_offer}${promptForStep(session)}` });
    case "unsupported_language": {
      const needed = extracted.neededLanguage ?? input.slice(0, 40);
      await dispatchTool("request_human", {
        case_id: session.case_id ?? undefined,
        reason: "unsupported_language",
        needed_language: needed,
      }, { ...ctx, caseId: session.case_id ?? undefined }).catch(() => undefined);
      // Record on the session draft even before a case exists.
      session.status = session.channel === "voice" ? "transferred" : "callback";
      await saveSession(session);
      if (session.case_id) {
        await recordEvent(session.case_id, "system", "unsupported_language",
          { neededLanguage: needed });
      }
      return finish({
        reply: S().unsupported_language, done: true,
        handoff: { mode: session.channel === "voice" ? "transfer" : "callback", reason: "unsupported_language" },
      });
    }
    case "confirm":
    case "deny":
    case "correct":
      if (session.step === "review") {
        if (extracted.intent === "confirm") {
          // A model must never turn ambiguous speech into consent.
          if (!explicitConfirmation(input)) return finish({ reply: buildReadback(session, session.language) });
          return await finalize(session, opts, input, finish, S);
        }
        // Deny/correct at read-back: restart at the address step so the
        // caller can fix whatever was wrong.
        session.step = "address";
        session.draft_fields = clearStepField(session.draft_fields, "address");
        await saveSession(session);
        return finish({ reply: promptForStep(session) });
      }
      if (extracted.intent === "correct") {
        const prev = prevStep(session.step) ?? "address";
        session.draft_fields = clearStepField(session.draft_fields, prev);
        session.step = prev;
        session.consecutive_failures = 0;
        await saveSession(session);
        return finish({ reply: promptForStep(session) });
      }
      break;
    case "answer":
    case "skip":
      break;
  }

  // Normal answer: persist what the model extracted.
  if (Object.keys(extracted.fields).length > 0 || extracted.unknowns.length > 0) {
    await dispatchTool("capture_intake", {
      fields: extracted.fields, unknowns: extracted.unknowns,
    }, ctx);
    session.draft_fields = { ...session.draft_fields, ...extracted.fields };
  }

  // Missing critical detail -> re-ask (counts toward the two-attempt handoff).
  if (extracted.unknowns.length > 0 && extracted.confidence < 0.7) {
    session.consecutive_failures += 1;
    if (session.consecutive_failures >= 2) {
      return await handoff(session, opts, "unrecognized_input", finish, S);
    }
    await saveSession(session);
    return finish({ reply: `${S().no_input} ${promptForStep(session)}` });
  }

  session.consecutive_failures = 0;
  // Callback chosen but no phone yet (e.g. pressed 1): stay on contact
  // and ask for the number specifically.
  if (session.step === "contact" &&
      session.draft_fields.contactPreference === "callback" &&
      !session.draft_fields.contactPhone) {
    await saveSession(session);
    return finish({ reply: S().ask_phone });
  }
  const next = nextStep(session.step);
  if (next) {
    session.step = next;
    await saveSession(session);
    return finish({ reply: promptForStep(session) });
  }

  // No fallback, skip, or model classification may manufacture consent.
  return finish({ reply: buildReadback(session, session.language) });
}

function promptForStep(session: SessionRow): string {
  if (session.phone_state) return phonePrompt(session, s => buildReadback(s,s.language));
  if (session.step === "review") return buildReadback(session, session.language);
  return promptFor(session.step, session.language);
}

export function promptForSession(session: SessionRow): string { return promptForStep(session); }

export function explicitConfirmation(input: string): boolean {
  const value = input.trim().toLowerCase().normalize("NFC").replace(/[.!?]+$/, "");
  return ["1", "yes", "yes please", "yes, please", "yeah", "yep", "confirm", "ok", "okay",
    "that's right", "that is right", "that's correct", "that is correct", "yes that's right",
    "yes, that's right", "yes that is right", "yes that's correct", "yes, that's correct",
    "đúng", "đúng rồi", "vâng", "xác nhận", "đồng ý", "sí", "si", "correcto", "sí, correcto"].includes(value);
}

async function handoff(
  session: SessionRow,
  opts: TurnOptions,
  reason: string,
  finish: (p: Partial<TurnResult>) => Promise<TurnResult>,
  S: () => ReturnType<typeof t>
): Promise<TurnResult> {
  const mode = session.channel === "voice" ? "transfer" : "callback";
  await dispatchTool("request_human", { reason }, {
    sessionId: session.id, caseId: session.case_id ?? undefined,
    orgId: opts.orgId, actor: "system", channel: session.channel,
  }).catch(() => undefined);
  session.status = mode === "transfer" ? "transferred" : "callback";
  await saveSession(session);
  const reply = mode === "transfer" ? S().transfer_to_human : S().callback_saved;
  return finish({ reply, done: true, handoff: { mode, reason } });
}

async function finalize(
  session: SessionRow,
  opts: TurnOptions,
  lastInput: string,
  finish: (p: Partial<TurnResult>) => Promise<TurnResult>,
  S: () => ReturnType<typeof t>
): Promise<TurnResult> {
  const originalInput = [lastInput].join(" ").slice(0, 4000);
  const c: CaseRow = await createCaseFromDraft({
    orgId: opts.orgId, providerId: opts.providerId,
    type: "new_delivery", channel: session.channel,
    language: session.language, draft: session.draft_fields,
    originalInput,
  });
  session.case_id = c.id;
  await saveSession(session);

  const toolCtx = {
    sessionId: session.id, caseId: c.id, orgId: opts.orgId,
    actor: "system" as const, channel: session.channel,
  };
  // Rule check + submit for review. Unknowns go to staff, never auto-reject.
  await dispatchTool("check_service_rules", { case_id: c.id }, toolCtx);
  await dispatchTool("submit_for_review", { case_id: c.id }, toolCtx);

  const link = await issueStatusLink(c.id, opts.publicBaseUrl);
  session.status = "completed";
  await saveSession(session);

  // FoodFit bridge: send the voice-captured household constraints to the
  // pantry system, which creates a visit and suggests a compatible basket
  // from live inventory. Best-effort: never blocks the intake receipt.
  try {
    const { createFoodFitVisit } = await import("./foodfit");
    const ff = await createFoodFitVisit(session.draft_fields, {
      caseId: c.id, caseNumber: c.case_number,
    });
    if (ff) {
      await db().query(
        `UPDATE assistance_cases
         SET foodfit_visit_id = $1, foodfit_visit_code = $2, foodfit_basket = $3::jsonb,
             updated_at = now()
         WHERE id = $4`,
        [ff.visit.id, ff.visit.visitCode, JSON.stringify(ff.basket), c.id]
      );
      await recordEvent(c.id, "system", "foodfit_visit_created", {
        visitId: ff.visit.id,
        visitCode: ff.visit.visitCode,
        basketLines: ff.basket.length,
        suggestionEmpty: ff.suggestionEmpty,
      });
    }
  } catch (e) {
    await recordEvent(c.id, "system", "foodfit_bridge_failed",
      { error: e instanceof Error ? e.message : "unknown" }).catch(() => undefined);
  }

  // MealLine bridge: send the voice-captured intake to MealLine,
  // which stores it, runs dietary/equipment matching, and generates
  // a shopping list in MealLine's staff interface.
  // Best-effort: never blocks the intake receipt.
  try {
    const { sendIntakeToNourish } = await import("./nourish");
    const nourish = await sendIntakeToNourish(session.draft_fields, {
      caseId: c.id, caseNumber: c.case_number, language: session.language,
    });
    if (nourish) {
      await recordEvent(c.id, "system", "nourish_intake_created", {
        intakeId: nourish.intakeId,
        shoppingListId: nourish.shoppingListId,
        matchedCount: nourish.matchedCount,
      });
    }
  } catch (e) {
    await recordEvent(c.id, "system", "nourish_bridge_failed",
      { error: e instanceof Error ? e.message : "unknown" }).catch(() => undefined);
  }

  // FEED bridge: send the voice-captured household to FEED pantry system,
  // which creates a shopping list with dietary/equipment-aware matching.
  // Best-effort: never blocks the intake receipt.
  try {
    const { createFeedShoppingList } = await import("./feed");
    const feed = await createFeedShoppingList(session.draft_fields, {
      caseId: c.id, caseNumber: c.case_number,
    });
    if (feed) {
      await recordEvent(c.id, "system", "feed_shopping_list_created", {
        shoppingListId: feed.instance.id,
        title: feed.instance.title,
      });
    }
  } catch (e) {
    await recordEvent(c.id, "system", "feed_bridge_failed",
      { error: e instanceof Error ? e.message : "unknown" }).catch(() => undefined);
  }

  // SMS receipt: text the case number + secure status link to the caller's
  // phone, in their language. Queued via the outbox so failures retry and
  // stay visible (never silently dropped). Best-effort: a missing migration
  // or DB hiccup must never break the live call.
  const phone = session.draft_fields.contactPhone;
  if (phone) {
    try {
      const smsBody = S().sms_receipt(c.case_number, link.url);
      await db().query(
        `INSERT INTO outbox_jobs (id, job_key, case_id, kind, channel, payload)
         VALUES ($1,$2,$3,'sms_receipt','sms',$4)
         ON CONFLICT (job_key) DO NOTHING`,
        [newId("job"), `sms_receipt:${c.id}`, c.id,
         JSON.stringify({ to: `+1${phone}`, body: smsBody, locale: session.language })]
      );
      await recordEvent(c.id, "system", "sms_receipt_queued", { channel: "sms" });
    } catch (e) {
      await recordEvent(c.id, "system", "sms_receipt_failed",
        { error: e instanceof Error ? e.message : "unknown" }).catch(() => undefined);
    }
  }

  let reply = S().thanks_submitted;
  let statusLinkPath: string | undefined;
  if (session.channel !== "voice") {
    reply += ` ${S().status_link_issued}`;
    statusLinkPath = link.path;
  }
  return finish({ reply, done: true, caseId: c.id, caseNumber: c.case_number, statusLinkPath });
}

/** Persist partial intake when the caller hangs up mid-flow. */
export async function abandonSession(sessionId: string): Promise<void> {
  return inTransaction(async()=>{
  await db().query('SELECT id FROM conversation_sessions WHERE id=$1 FOR UPDATE',[sessionId]);
  const session = await getSession(sessionId);
  if (!session || session.status !== "active") return;
  session.status = "abandoned";
  await saveSession(session);
  if (session.phone_state?.privacy) {
    const call = await callSnapshot(session,'abandoned','Caller disconnected before completion; staff follow-up may be needed.');
    await queuePhoneCommand({ id: commandId(),callId:session.id,kind:'save_draft',call },session.id);
  }
  if (session.case_id) {
    await recordEvent(session.case_id, "system", "session_abandoned", { step: session.step });
  }
  });
}
