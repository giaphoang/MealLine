import { createHmac, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CallerGrant, ClientProfile, PhoneCommand, PhoneCommandResult, PhoneCallRecord } from '../../packages/core/src/clients';
import type { DraftFields } from './types';
import { db } from './db';

export const phoneEnabled = () => process.env.NOURISH_CLIENT_PHONE_ENABLED === 'true';
function connection() {
  const secret = process.env.NOURISH_AGENT_API_TOKEN ?? '', base = (process.env.NOURISH_API_URL ?? '').replace(/\/$/, '');
  if (secret.length < 32 || !base) throw new Error('nourish_phone_not_configured');
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)
      || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw new Error('invalid');
  } catch { throw new Error('nourish_phone_invalid_url'); }
  return { secret, base };
}
export async function phoneRequest(path: string, body?: PhoneCommand): Promise<unknown> {
  const { secret, base } = connection();
  let response: Response;
  try { response = await fetch(base + '/api/voice-agent' + path, { method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-nourish-agent-token': secret },
    redirect: 'error', signal: AbortSignal.timeout(5000), body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('nourish_phone_unavailable'); }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error('nourish_phone_' + response.status); }
  try { return await response.json(); } catch { throw new Error('nourish_phone_invalid_response'); }
}
export async function phoneCommand(command: PhoneCommand): Promise<PhoneCommandResult> {
  const result = await phoneRequest('/commands', command);
  // Never trust text/HTML error bodies as receipts or let unexpected arrays advance the call.
  return z.object({ client: z.object({ id: z.string(), reference: z.string(), version: z.number().int().positive(), profile: z.record(z.unknown()),
    phone: z.string().nullable(), consent: z.object({ enabled: z.boolean(), channel: z.enum(['sms','voice_callback','none']), at: z.string() }) }).passthrough().optional(),
    target: z.object({ clientId: z.string(), phone: z.string(), reference: z.string() }).optional(),
    referenceRequired: z.boolean().optional(),
    statuses: z.array(z.object({ intakeId: z.string(), caseNumber: z.string(), status: z.enum(['staff_review','approved','packed','scheduled','out_for_delivery','delivered','cancelled','needs_followup']),
      scheduledFor: z.string().nullable(), updatedAt: z.string(), reviewHold: z.boolean(), timeZone: z.string().optional() })).optional(),
    intakeId: z.string().optional(), shoppingListId: z.number().optional(), matchedCount: z.number().optional(), changeId: z.string().optional(),
    queuedForReview: z.boolean().optional(), notification: z.unknown().optional() }).parse(result) as unknown as PhoneCommandResult;
}
export function issueCallerGrant(clientId: string, callId: string, phone: string, verifiedAt = new Date().toISOString()): CallerGrant {
  const { secret } = connection();
  const claims = { clientId, callId, phone, verifiedAt, expiresAt: new Date(Date.parse(verifiedAt) + 600000).toISOString() };
  return { ...claims, signature: createHmac('sha256', secret).update(JSON.stringify(claims)).digest('base64url') };
}
export function profileFromDraft(d: DraftFields, language: 'en' | 'es' | 'vi'): ClientProfile {
  return { name: d.contactName ?? null, phone: d.contactPhone ? '+1' + d.contactPhone : null, language,
    addressRaw: d.address?.raw ?? null, addressStreet: d.address?.street ?? null, addressCity: d.address?.city ?? null, addressZip: d.address?.zip ?? null,
    householdSize: d.household?.size ?? null, dietaryAvoid: d.dietaryAvoid ?? [], dietaryNotes: d.dietaryNotes ?? null,
    hasStove: d.equipment?.stove ?? null, hasFridge: d.equipment?.fridge ?? null,
    availabilityRaw: d.availability?.raw ?? null, availabilityDays: d.availability?.days ?? [], availabilityTimes: d.availability?.times ?? [],
    contactPreference: d.contactPreference ?? null, accommodation: d.accommodation ?? null };
}
export function draftFromProfile(profile: ClientProfile): DraftFields {
  return { ...(profile.name ? { contactName: profile.name } : {}), ...(profile.phone ? { contactPhone: profile.phone.replace(/\D/g,'').slice(-10) } : {}),
    ...(profile.addressRaw ? { address: { raw: profile.addressRaw, street: profile.addressStreet ?? undefined, city: profile.addressCity ?? undefined, zip: profile.addressZip ?? undefined } } : {}),
    ...(profile.householdSize ? { household: { size: profile.householdSize } } : {}),
    ...(profile.availabilityRaw ? { availability: { raw: profile.availabilityRaw, days: profile.availabilityDays ?? [], times: profile.availabilityTimes ?? [] } } : {}),
    dietaryAvoid: profile.dietaryAvoid, dietaryNotes: profile.dietaryNotes ?? undefined,
    equipment: { stove: profile.hasStove ?? undefined, fridge: profile.hasFridge ?? undefined },
    contactPreference: profile.contactPreference ?? undefined, accommodation: profile.accommodation ?? undefined };
}
export async function queuePhoneCommand(command: PhoneCommand, sessionId?: string) {
  await db().query(`INSERT INTO nourish_phone_jobs (id,session_id,kind,payload) VALUES ($1,$2,'sync',$3::jsonb) ON CONFLICT(id) DO NOTHING`,
    [command.id, sessionId ?? null, JSON.stringify(command)]);
}
export async function callSnapshot(session: { id: string; provider_call_id: string | null; language: 'en' | 'es' | 'vi'; draft_fields: DraftFields; last_input_at: string | null }, status: PhoneCallRecord['status'], summary: string): Promise<PhoneCallRecord> {
  const turns = await db().query(`SELECT step,input,reply,created_at FROM conversation_turns WHERE session_id=$1 ORDER BY turn_index ASC`, [session.id]);
  return { id: session.id, callSid: session.provider_call_id, language: session.language, status, summary,
    profile: profileFromDraft(session.draft_fields, session.language), observedAt: new Date().toISOString(),
    transcript: turns.rows.filter(row => !/verif|otp|code|pin/i.test(row.step)).map(row => ({ step: row.step, input: row.input, reply: row.reply, at: new Date(row.created_at).toISOString() })) };
}
export const commandId = () => randomUUID();
