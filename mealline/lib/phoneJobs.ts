/** Dedicated outbox. Never claims legacy outbox_jobs or makes fulfilment decisions. */
import twilio from 'twilio';
import { z } from 'zod';
import { db, inTransaction } from './db';
import { phoneCommand, phoneRequest, phoneEnabled } from './nourishPhone';
import { verificationPort, verificationRow, type VerificationPort } from './phoneVerification';
import { phoneText, spokenStatus } from './phonePrompts';
import { sayOptions } from './voice';
import { recordEvent } from './cases';
import type { PhoneCommand, PhoneCommandResult } from '../../packages/core/src/clients';
import type { Locale } from './i18n';

export interface PhoneJob {
  id: string; session_id: string | null; kind: 'sync' | 'notification' | 'verify_callback';
  payload: Record<string, unknown>; status: string; attempts: number; provider_sid: string | null;
}
export interface PhoneNotificationPort {
  send(phone: string, channel: 'sms' | 'voice_callback', message: string, locale: Locale): Promise<string>;
}
export interface PhoneJobPorts {
  command?: typeof phoneCommand;
  events?: (after: number) => Promise<unknown>;
  verification?: VerificationPort;
  notifications?: PhoneNotificationPort;
}
function notificationPort(): PhoneNotificationPort {
  const account = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!account || !token || !from) throw new Error('phone_notification_not_configured');
  const client = twilio(account, token);
  return { async send(to, channel, message, locale) {
    try {
      if (channel === 'sms') return (await client.messages.create({ to, from, body: message })).sid;
      const response = new twilio.twiml.VoiceResponse();
      response.pause({ length: 1 });
      response.say(sayOptions(locale), message);
      response.hangup();
      // Always generic, including when a machine answers. No personal details,
      // recordings, or claim of recipient acknowledgement.
      return (await client.calls.create({ to, from, twiml: response.toString(), timeout: 20 })).sid;
    } catch { throw new Error('phone_notification_uncertain'); }
  } };
}
const EventFeed = z.object({ cursor: z.number().int().nonnegative(), reset: z.boolean(), events: z.array(z.object({
  id: z.number().int().positive(), eventId: z.string().uuid(), clientId: z.string(), intakeId: z.string().nullable(), kind: z.string(), createdAt: z.string(),
})) });
const Notification = z.object({ phone: z.string().regex(/^\+1\d{10}$/), language: z.enum(['en','es','vi']),
  consent: z.object({ enabled: z.boolean(), channel: z.enum(['sms','voice_callback','none']), at: z.string() }),
  statuses: z.array(z.object({ intakeId: z.string(), caseNumber: z.string(), status: z.enum(['staff_review','approved','packed','scheduled','out_for_delivery','delivered','cancelled','needs_followup']),
    scheduledFor: z.string().nullable(), updatedAt: z.string(), reviewHold: z.boolean(), timeZone: z.string().optional() })) });

export async function collectPhoneEvents(ports: PhoneJobPorts = {}) {
  if (!phoneEnabled()) return 0;
  await db().query(`INSERT INTO nourish_phone_cursor(id) VALUES ('nourish') ON CONFLICT DO NOTHING`);
  const current = await db().query(`SELECT cursor FROM nourish_phone_cursor WHERE id='nourish'`);
  const after = current.rows[0].cursor as number;
  const feed = EventFeed.parse(await (ports.events ?? (cursor => phoneRequest('/events?after='+cursor)))(after));
  return inTransaction(async () => {
    const locked = await db().query(`SELECT cursor FROM nourish_phone_cursor WHERE id='nourish' FOR UPDATE`);
    if (locked.rows[0].cursor !== after) return 0;
    let added = 0;
    for (const event of feed.events) {
      const created = await db().query(`INSERT INTO nourish_phone_jobs(id,kind,payload)
        VALUES ($1,'notification',$2::jsonb) ON CONFLICT DO NOTHING`, ['event:'+event.eventId, JSON.stringify(event)]);
      added += created.rowCount ?? 0;
    }
    await db().query(`UPDATE nourish_phone_cursor SET cursor=$1 WHERE id='nourish'`,[feed.cursor]);
    return added;
  });
}
export async function claimPhoneJobs(limit = 10): Promise<PhoneJob[]> {
  if (!phoneEnabled()) return [];
  return inTransaction(async () => {
    // External sends with an expired lease might already have succeeded.
    // Only idempotent MealLine commands can be automatically replayed.
    await db().query(`UPDATE nourish_phone_jobs SET status='review',last_error='send_outcome_unknown',leased_until=NULL,updated_at=now()
      WHERE status='leased' AND leased_until<now() AND kind<>'sync'`);
    const result = await db().query(`WITH due AS (
      SELECT id FROM nourish_phone_jobs WHERE (status='pending' AND due_at<=now())
        OR (status='leased' AND leased_until<now() AND kind='sync') ORDER BY created_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE nourish_phone_jobs j SET status='leased',attempts=attempts+1,leased_until=now()+interval '2 minutes',updated_at=now()
      FROM due WHERE j.id=due.id RETURNING j.*`,[Math.min(Math.max(limit,1),50)]);
    return result.rows as PhoneJob[];
  });
}
async function mark(job: PhoneJob, status: 'sent' | 'pending' | 'failed' | 'review', error: string | null = null, providerSid?: string, delaySeconds = 0) {
  await db().query(`UPDATE nourish_phone_jobs SET status=$2,last_error=$3,provider_sid=COALESCE($4,provider_sid),leased_until=NULL,
    due_at=now()+($5*interval '1 second'),updated_at=now() WHERE id=$1 AND status='leased'`,[job.id,status,error,providerSid ?? null,delaySeconds]);
}
async function reconcile(job: PhoneJob, command: PhoneCommand, result: PhoneCommandResult) {
  await inTransaction(async () => {
    if (job.session_id && (result.client || result.intakeId)) {
      // JSON field updates preserve any newer conversation progress.
      await db().query(`UPDATE conversation_sessions SET phone_state=phone_state || $2::jsonb WHERE id=$1 AND phone_state IS NOT NULL`,
        [job.session_id,JSON.stringify({ ...(result.client ? { clientId:result.client.id,isNew:false,version:result.client.version } : {}),
          ...(result.intakeId ? { linkedIntakeId:result.intakeId } : {}) })]);
      const updated = await db().query(`UPDATE assistance_cases SET nourish_client_id=COALESCE($2,nourish_client_id),
        nourish_intake_id=COALESCE($3,nourish_intake_id) WHERE id=(SELECT case_id FROM conversation_sessions WHERE id=$1) RETURNING id`,
        [job.session_id,result.client?.id ?? null,result.intakeId ?? null]);
      if (updated.rows[0]) await recordEvent(updated.rows[0].id,'worker','nourish_synchronized',{ commandId:command.id,intakeId:result.intakeId ?? null,requiresReview:result.queuedForReview ?? false });
    }
    await mark(job,result.queuedForReview ? 'review' : 'sent',result.queuedForReview ? 'staff_review_required' : null);
  });
}
export async function processPhoneJob(job: PhoneJob, ports: PhoneJobPorts = {}) {
  if (!phoneEnabled() || job.status !== 'leased') return;
  const command = ports.command ?? phoneCommand;
  try {
    if (job.kind === 'sync') {
      const outgoing = job.payload as unknown as PhoneCommand;
      await reconcile(job,outgoing,await command(outgoing));
    } else if (job.kind === 'verify_callback') {
      const payload = z.object({ verificationId:z.string().uuid(),locale:z.enum(['en','es','vi']) }).parse(job.payload);
      const row = await verificationRow(payload.verificationId);
      if (!row || row.verified_at || row.provider_sid) { await mark(job,'sent','challenge_already_closed');return; }
      if (new Date(row.expires_at).getTime() <= Date.now()) { await mark(job,'review','verification_callback_expired');return; }
      const session = await db().query(`SELECT phone_state FROM conversation_sessions WHERE id=$1`,[job.session_id]);
      if (!session.rows[0]?.phone_state?.callEndedAt) {
        // Only a signature-checked parent CallStatus can allow the callback.
        // A missing callback remains visible after fifteen minutes.
        await mark(job,job.attempts>=60 ? 'review' : 'pending','waiting_for_call_end',undefined,15);return;
      }
      const sid = await (ports.verification ?? verificationPort()).start(row.phone,'call',payload.locale);
      await inTransaction(async () => {
        await db().query(`UPDATE nourish_phone_verifications SET provider_sid=$2,expires_at=now()+interval '10 minutes',last_sent_at=now() WHERE id=$1`,[row.id,sid]);
        await mark(job,'sent',null,sid);
      });
    } else {
      const payload = z.object({ clientId:z.string(),intakeId:z.string().nullable(),eventId:z.string().uuid(),createdAt:z.string() }).passthrough().parse(job.payload);
      if (Date.now()-Date.parse(payload.createdAt)>30*86400000) { await mark(job,'sent','expired_update_suppressed');return; }
      const response = await command({id:job.id,callId:'notification-worker',kind:'notification_context',clientId:payload.clientId});
      if (!response.notification) { await mark(job,'sent','unverified_or_merged_contact');return; }
      const context = Notification.parse(response.notification), preference = context.consent;
      if (!preference.enabled || preference.channel==='none' || Date.parse(preference.at)>Date.parse(payload.createdAt)) {
        await mark(job,'sent','consent_not_applicable');return;
      }
      const status = context.statuses.find(item => item.intakeId===payload.intakeId);
      if (!status) { await mark(job,'sent','no_current_request');return; }
      const message = preference.channel==='voice_callback' ? phoneText(context.language,'reminder')
        : phoneText(context.language,'notification',{caseNumber:status.caseNumber,status:spokenStatus(status,context.language)});
      // A long backlog sends the latest status once rather than stale updates.
      const newer = await db().query(`SELECT id FROM nourish_phone_jobs WHERE kind='notification' AND id<>$1
        AND payload->>'intakeId'=$2 AND status IN ('pending','leased','sent') AND (
          (payload->>'createdAt')::timestamptz > $3::timestamptz OR
          ((payload->>'createdAt')::timestamptz = $3::timestamptz AND COALESCE((payload->>'id')::bigint,0) > $4)
        ) LIMIT 1`,[job.id,payload.intakeId,payload.createdAt,Number(job.payload.id ?? 0)]);
      if (newer.rows.length) { await mark(job,'sent','superseded_update');return; }
      const sid = await (ports.notifications ?? notificationPort()).send(context.phone,preference.channel,message,context.language);
      await mark(job,'sent',null,sid);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (job.kind==='sync' && (message==='nourish_phone_unavailable' || message==='nourish_phone_429' || /^nourish_phone_5\d\d$/.test(message))) {
      const delays = [60,300,900,3600,14400];
      await mark(job,job.attempts>=5 ? 'failed' : 'pending','nourish_unavailable',undefined,delays[Math.min(job.attempts-1,4)]);
    } else {
      // Never persist provider error bodies, submitted profile contents, keys,
      // codes, or a bearer capability in a diagnostic field.
      const safe = /^nourish_phone_(400|401|403|404|409|503)$/.test(message) ? message
        : message==='phone_notification_not_configured' || message==='phone_verification_not_configured' ? 'provider_not_configured'
        : job.kind==='sync' ? 'sync_rejected' : 'send_outcome_unknown';
      await mark(job,'review',safe);
    }
  }
}
export async function phoneJobSummaries() {
  const result = await db().query(`SELECT id,session_id,kind,status,attempts,due_at,last_error,created_at,updated_at
    FROM nourish_phone_jobs WHERE status IN ('pending','leased','failed','review') ORDER BY created_at DESC LIMIT 200`);
  return result.rows;
}
export async function retryPhoneJob(id: string) {
  const result = await db().query(`UPDATE nourish_phone_jobs SET status='pending',due_at=now(),attempts=0,last_error=NULL,updated_at=now()
    WHERE id=$1 AND kind='sync' AND status IN ('failed','review') AND last_error NOT IN ('staff_review_required','call_text_retention_expired') RETURNING id`,[id]);
  if (!result.rows.length) throw new Error('job_not_retryable');
}
export async function purgePhoneText() {
  await db().query(`UPDATE nourish_phone_jobs SET payload=jsonb_set(payload,'{call,transcript}','[]'::jsonb),
    status=CASE WHEN status IN ('pending','leased','failed') THEN 'review' ELSE status END,
    last_error=CASE WHEN status IN ('pending','leased','failed') THEN 'call_text_retention_expired' ELSE last_error END
    WHERE kind='sync' AND created_at<now()-interval '30 days' AND jsonb_typeof(payload->'call')='object'`);
  await db().query(`DELETE FROM conversation_turns WHERE session_id IN (SELECT id FROM conversation_sessions WHERE phone_state IS NOT NULL AND created_at<now()-interval '30 days')`);
  await db().query(`DELETE FROM voice_agent_turns WHERE session_id IN (SELECT id FROM conversation_sessions WHERE phone_state IS NOT NULL AND created_at<now()-interval '30 days')`);
  // Persistent capabilities/challenge phone numbers are operational secrets,
  // not household history. Keep counters through their rate-limit window only.
  await db().query(`DELETE FROM nourish_phone_verifications WHERE created_at<now()-interval '1 day'`);
  await db().query(`UPDATE nourish_phone_jobs SET payload='{}'::jsonb WHERE kind='sync' AND status='sent' AND created_at<now()-interval '30 days' AND payload<>'{}'::jsonb`);
  await db().query(`UPDATE conversation_sessions SET phone_state=phone_state-'grant'-'newPhoneGrant' WHERE phone_state IS NOT NULL AND created_at<now()-interval '1 day' AND (phone_state ? 'grant' OR phone_state ? 'newPhoneGrant')`);
}
