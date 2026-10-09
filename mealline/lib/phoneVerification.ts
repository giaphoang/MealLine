/** Verification never passes a code to a model, transcript, URL, or error log. */
import twilio from 'twilio';
import { createHash, randomUUID } from 'node:crypto';
import { db,inTransaction } from './db';
import type { Locale } from './i18n';

export interface VerificationPort {
  start(phone: string, channel: 'sms' | 'call', locale: Locale): Promise<string>;
  check(phone: string, code: string): Promise<boolean>;
}
export function verificationPort(): VerificationPort {
  const account = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, service = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!account || !token || !service) throw new Error('phone_verification_not_configured');
  const verify = twilio(account, token).verify.v2.services(service);
  return {
    async start(to, channel, locale) {
      try { return (await verify.verifications.create({ to, channel, locale })).sid; }
      catch { throw new Error('phone_verification_unavailable'); }
    },
    async check(to, code) {
      try { return (await verify.verificationChecks.create({ to, code })).status === 'approved'; }
      catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 400 || status === 404 || status === 429) return false;
        throw new Error('phone_verification_unavailable');
      }
    },
  };
}
export const phoneHash = (phone: string) => createHash('sha256').update(phone).digest('hex');
export function usPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? '+1' + digits : digits.length === 11 && digits.startsWith('1') ? '+' + digits : null;
}
export interface VerificationRow {
  id: string; phone: string; client_id: string; session_id: string; channel: 'sms' | 'call';
  provider_sid: string | null; failed_entries: number; locked_until: string | null;
  expires_at: string; verified_at: string | null;
}
export async function beginVerification(phone: string, clientId: string, sessionId: string, channel: 'sms' | 'call', locale: Locale, port?: VerificationPort) {
  const hash = phoneHash(phone);
  // Serialize limits across simultaneous calls from the same contact number.
  await db().query('SELECT pg_advisory_xact_lock(hashtextextended($1, 1))', [hash]);
  const recent = await db().query(`SELECT locked_until, last_sent_at FROM nourish_phone_verifications WHERE phone_hash=$1 AND created_at>now()-interval '1 hour' ORDER BY created_at DESC`, [hash]);
  if (recent.rows.some(row => row.locked_until && new Date(row.locked_until).getTime() > Date.now())) throw new Error('verification_locked');
  if (recent.rows.length >= 5 || (recent.rows[0]?.last_sent_at && Date.now() - new Date(recent.rows[0].last_sent_at).getTime() < 60000)) throw new Error('verification_cooldown');
  const id = randomUUID();
  const result = await db().query(`INSERT INTO nourish_phone_verifications (id,phone_hash,client_id,session_id,phone,channel,expires_at,last_sent_at)
    VALUES ($1,$2,$3,$4,$5,$6,now()+interval '10 minutes',now()) RETURNING *`, [id, hash, clientId, sessionId, phone, channel]);
  if (channel === 'sms') {
    const sid = await (port ?? verificationPort()).start(phone, channel, locale);
    await db().query('UPDATE nourish_phone_verifications SET provider_sid=$2 WHERE id=$1', [id, sid]);
  } else {
    await db().query(`INSERT INTO nourish_phone_jobs (id,session_id,kind,payload) VALUES ($1,$2,'verify_callback',$3::jsonb)`,
      ['verify:' + id, sessionId, JSON.stringify({ verificationId: id, locale })]);
  }
  return result.rows[0] as VerificationRow;
}
export async function verificationRow(id: string): Promise<VerificationRow | null> {
  const result = await db().query('SELECT * FROM nourish_phone_verifications WHERE id=$1', [id]);
  return result.rows[0] as VerificationRow ?? null;
}
export async function checkVerification(id: string, input: string, port?: VerificationPort): Promise<VerificationRow | null> {
  return inTransaction(async()=>{
  let row = await verificationRow(id);
  if(row)await db().query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[phoneHash(row.phone)]);
  row=await verificationRow(id);
  if (!row || row.verified_at || !row.provider_sid || new Date(row.expires_at).getTime() <= Date.now()
    || (row.locked_until && new Date(row.locked_until).getTime() > Date.now())) return null;
  const digits = input.replace(/[ -]/g, '');
  if (/^\d{6}$/.test(digits) && await (port ?? verificationPort()).check(row.phone, digits)) {
    const updated = await db().query('UPDATE nourish_phone_verifications SET verified_at=now() WHERE id=$1 AND verified_at IS NULL RETURNING *', [id]);
    return updated.rows[0] as VerificationRow ?? null;
  }
  await db().query(`UPDATE nourish_phone_verifications SET failed_entries=failed_entries+1,
    locked_until=CASE WHEN failed_entries+1>=3 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=$1`, [id]);
  const hash=phoneHash(row.phone);
  const failures=await db().query(`SELECT COALESCE(sum(failed_entries),0)::int n FROM nourish_phone_verifications WHERE phone_hash=$1 AND created_at>now()-interval '15 minutes'`,[hash]);
  if(failures.rows[0].n>=3)await db().query(`UPDATE nourish_phone_verifications SET locked_until=now()+interval '15 minutes' WHERE phone_hash=$1 AND created_at>now()-interval '1 hour'`,[hash]);
  return null;
  });
}
