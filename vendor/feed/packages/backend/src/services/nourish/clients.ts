import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { Prisma, type NourishClient } from '@prisma/client';
import { z } from 'zod';
import type { CallerGrant, ClientProfile, ClientAnalytics, PhoneCommand, PhoneCommandResult, PhoneStatus } from '@mealline/core';
import prisma from '../../db';
import { operationError, submitIntakeInTransaction } from './index';
import { projectFoodItem } from './index';
import { matchItemsForIntake,buildShoppingListItems,type ShoppingListItem } from '@mealline/core';
import { getOperatingHoursSettings } from '../operating-hours';
import { localDateOf, resolveRange, type AnalyticsRangePreset } from '../inventory-analytics/timezone';

const nullableText = z.string().trim().max(2000).nullable().optional();
export const clientProfileSchema = z.object({
  name: z.string().trim().min(1).max(200).nullable().optional(), phone: nullableText,
  language: z.enum(['en', 'es', 'vi']).nullable().optional(), addressRaw: nullableText,
  addressStreet: nullableText, addressCity: nullableText, addressZip: nullableText,
  householdSize: z.number().int().min(1).max(100).nullable().optional(),
  dietaryAvoid: z.array(z.string().trim().min(1).max(100)).max(100).optional(), dietaryNotes: nullableText,
  hasStove: z.boolean().nullable().optional(), hasFridge: z.boolean().nullable().optional(),
  availabilityRaw: nullableText, availabilityDays: z.array(z.string().max(30)).max(7).optional(),
  availabilityTimes: z.array(z.string().max(30)).max(10).optional(),
  contactPreference: z.enum(['callback', 'status_link']).nullable().optional(), accommodation: nullableText,
}).strict();
const consentSchema = z.object({ enabled: z.boolean(), channel: z.enum(['sms', 'voice_callback', 'none']), at: z.string().datetime() }).strict();
const grantSchema = z.object({ clientId: z.string().max(128), callId: z.string().max(128), phone: z.string().max(20),
  verifiedAt: z.string().datetime(), expiresAt: z.string().datetime(), signature: z.string().max(128) }).strict();
const transcriptSchema = z.array(z.object({ step: z.string().max(80), input: z.string().max(2000).nullable(), reply: z.string().max(4000), at: z.string().datetime() }).strict()).max(250);
const callSchema = z.object({ id: z.string().min(1).max(128), clientId: z.string().nullable().optional(), callSid: z.string().max(128).nullable().optional(),
  caseNumber: z.string().max(128).nullable().optional(), language: z.enum(['en', 'es', 'vi']),
  status: z.enum(['draft', 'confirmed', 'abandoned', 'needs_followup']), profile: clientProfileSchema,
  summary: z.string().max(2000), transcript: transcriptSchema, observedAt: z.string().datetime().optional() }).strict();
export const phoneCommandSchema = z.object({
  id: z.string().min(1).max(128), callId: z.string().min(1).max(128),
  kind: z.enum(['resolve_client', 'read_client', 'save_draft', 'submit_request', 'update_client', 'get_status', 'request_change', 'report_missed_delivery', 'request_human', 'notification_context']),
  clientId: z.string().max(128).optional(), grant: grantSchema.optional(), newPhoneGrant: grantSchema.optional(), expectedVersion: z.number().int().positive().optional(),
  confirmedAt: z.string().datetime().optional(), phoneVerifiedAt: z.string().datetime().optional(),
  profile: clientProfileSchema.optional(), consent: consentSchema.optional(), call: callSchema.optional(),
  caseNumber: z.string().min(1).max(128).optional(), intakeId: z.string().max(128).optional(),
  reference: z.string().max(128).optional(), phone: z.string().max(30).optional(), reason: z.string().max(2000).optional(),
  changeType: z.enum(['delivery_change', 'cancellation', 'safety_review']).optional(),
}).strict();
const json = (value: unknown) => value as Prisma.InputJsonValue;
export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  throw operationError('Provide a ten-digit US phone number.');
}
export function phoneFeatureEnabled() { return process.env.NOURISH_CLIENT_PHONE_ENABLED === 'true'; }
export function checkGrant(grant: CallerGrant | undefined, clientId: string, callId: string, confirmedAt?: string) {
  const secret = process.env.NOURISH_AGENT_API_TOKEN ?? '';
  if (!grant || secret.length < 32 || grant.clientId !== clientId || grant.callId !== callId) throw operationError('Verification required.', 401);
  const { signature, ...claims } = grant;
  const expected = createHmac('sha256', secret).update(JSON.stringify(claims)).digest('base64url');
  const a = Buffer.from(expected), b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw operationError('Verification required.', 401);
  const start = Date.parse(grant.verifiedAt), end = Date.parse(grant.expiresAt);
  // A durable, immutable confirmed command can arrive after an outage. Reads
  // always need a live grant; writes must have been confirmed during its lease.
  const at = confirmedAt ? Date.parse(confirmedAt) : Date.now();
  if (end - start > 600001 || end <= start || start > Date.now() + 5000 || at < start || at >= end || at > Date.now() + 5000
    || Date.now() - at > 30 * 86400000) throw operationError('Verification expired.', 401);
}
function publicClient(client: NourishClient) {
  return { ...client, profile: client.profile as unknown as ClientProfile, consent: client.consent,
    phoneVerifiedAt: client.phoneVerifiedAt?.toISOString() ?? null, createdAt: client.createdAt.toISOString(), updatedAt: client.updatedAt.toISOString() };
}
async function requireClient(tx: Prisma.TransactionClient, command: PhoneCommand) {
  if (!command.clientId) throw operationError('Verification required.', 401);
  checkGrant(command.grant, command.clientId, command.callId, command.confirmedAt);
  const client = await tx.nourishClient.findUnique({ where: { id: command.clientId } });
  if (!client || client.mergedIntoId || client.phone !== command.grant?.phone) throw operationError('Verification required.', 401);
  if (!client.phoneVerifiedAt && new Date(command.grant!.verifiedAt) < client.updatedAt) throw operationError('Fresh phone verification required.', 401);
  return client.phoneVerifiedAt ? client : tx.nourishClient.update({ where: { id: client.id }, data: { phoneVerifiedAt: new Date(command.grant!.verifiedAt) } });
}
function requireConfirmation(command: PhoneCommand) {
  if (!command.confirmedAt || !Number.isFinite(Date.parse(command.confirmedAt)) || Date.parse(command.confirmedAt) > Date.now() + 5000) throw operationError('Explicit confirmation required.');
}
async function revision(tx: Prisma.TransactionClient, client: NourishClient, actor: string, callId?: string) {
  await tx.nourishClientRevision.create({ data: { clientId: client.id, version: client.version, profile: json(client.profile), consent: json(client.consent), actor, callId } });
}
async function saveCall(tx: Prisma.TransactionClient, call: NonNullable<PhoneCommand['call']>, clientId?: string) {
  const observed = new Date(call.observedAt ?? Date.now());
  if (observed.getTime()>Date.now()+5000) throw operationError('Invalid call observation time.');
  const expiresAt = new Date(observed.getTime() + 30 * 86400000);
  // Verification inputs are never legal transcript entries, even from adapters.
  const transcript = expiresAt>new Date() ? call.transcript.filter(entry => !/verif|otp|code|pin/i.test(entry.step)) : [];
  const { id, clientId: _callerSelectedId, observedAt, ...fields } = call;
  const data = { ...fields, profile: json(call.profile), transcript: json(transcript), expiresAt, updatedAt: new Date(observedAt ?? Date.now()), ...(clientId ? { clientId } : {}) };
  const previous = await tx.nourishPhoneCall.findUnique({ where: { id } });
  if (previous && previous.updatedAt > data.updatedAt) return;
  if (previous?.status === 'confirmed' && call.status === 'draft') return;
  await tx.nourishPhoneCall.upsert({ where: { id }, create: { id, ...data }, update: data });
}
export async function statusesForClient(tx: Prisma.TransactionClient, clientId: string): Promise<PhoneStatus[]> {
  const { timezone: timeZone } = await getOperatingHoursSettings();
  const intakes = await tx.nourishIntake.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' }, take: 20,
    include: { baskets: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 }, deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  return intakes.map(intake => {
    const basket = intake.baskets[0], delivery = intake.deliveries[0];
    const status: PhoneStatus['status'] = intake.status === 'cancelled' ? 'cancelled'
      : delivery?.status === 'delivered' ? 'delivered'
      : intake.reviewHold || delivery?.status === 'failed' ? 'needs_followup'
      : delivery?.status === 'in_transit' ? 'out_for_delivery'
      : delivery?.scheduledFor && basket?.status !== 'draft' ? 'scheduled'
      : basket?.status === 'packed' ? 'packed' : basket?.status === 'approved' ? 'approved' : 'staff_review';
    return { intakeId: intake.id, caseNumber: intake.caseNumber, status, scheduledFor: delivery?.scheduledFor?.toISOString() ?? null,
      reviewHold: intake.reviewHold, timeZone, updatedAt: new Date(Math.max(intake.updatedAt.getTime(), delivery?.updatedAt.getTime() ?? 0, basket?.updatedAt.getTime() ?? 0)).toISOString() };
  });
}
export async function executePhoneCommand(raw: unknown): Promise<PhoneCommandResult> {
  const command: PhoneCommand = phoneCommandSchema.parse(raw);
  // Capability signatures are renewed on retries; immutable command contents are not.
  const { grant: _grant, newPhoneGrant: _newGrant, ...immutable } = command;
  const hash = createHash('sha256').update(JSON.stringify(immutable)).digest('hex');
  return prisma.$transaction(async tx => {
    const previous = await tx.nourishAgentReceipt.findUnique({ where: { id: command.id } });
    const read = ['resolve_client', 'read_client', 'get_status', 'notification_context'].includes(command.kind);
    if (previous && !read) {
      if (previous.hash !== hash) throw operationError('Command ID was reused with different contents.', 409);
      return previous.result as unknown as PhoneCommandResult;
    }
    let result: PhoneCommandResult = {};
    if (command.kind === 'resolve_client') {
      if (!command.phone && !command.reference) throw operationError('Contact or client reference required.');
      const phone = normalizePhone(command.phone);
      const candidates = await tx.nourishClient.findMany({ where: { mergedIntoId: null, ...(command.reference ? { reference: command.reference } : { phone }) }, take: 2 });
      // Only a private, service-authenticated controller sees the target. The
      // caller receives the same generic prompt for zero/multiple candidates.
      const candidate = candidates.length === 1 ? candidates[0] : null;
      result.referenceRequired = candidates.length > 1;
      if (candidate?.phone && (!phone || phone === candidate.phone)) result.target = { clientId: candidate.id, phone: candidate.phone, reference: candidate.reference };
    } else if (command.kind === 'save_draft' || (command.kind === 'request_human' && !command.clientId)) {
      if (!command.call || command.call.id !== command.callId) throw operationError('Call draft required.');
      const client = command.clientId ? await requireClient(tx, command) : null;
      await saveCall(tx, command.call, client?.id);
      if (command.kind === 'request_human') await tx.nourishChangeRequest.upsert({ where: { id: command.id }, create: { id: command.id, kind: 'human', reason: command.reason ?? 'Phone follow-up requested.' }, update: {} });
    } else if (command.kind === 'notification_context') {
      const client = command.clientId ? await tx.nourishClient.findUnique({ where: { id: command.clientId } }) : null;
      if (client?.phoneVerifiedAt && client.phone && !client.mergedIntoId) result.notification = { phone: client.phone,
        language: (client.profile as unknown as ClientProfile).language ?? 'en', consent: client.consent as unknown as NonNullable<PhoneCommand['consent']>, statuses: await statusesForClient(tx, client.id) };
      else result.notification = null;
    } else if (command.kind === 'submit_request') {
      requireConfirmation(command);
      if (!command.profile?.name || !command.profile.addressRaw || !command.profile.householdSize || !command.caseNumber || !command.clientId) throw operationError('Name, address, household size, and request reference required.');
      const existingIntake=await tx.nourishIntake.findUnique({where:{caseNumber:command.caseNumber}});
      if(existingIntake && existingIntake.clientId!==command.clientId)throw operationError('Request reference is already in use.',409);
      let client = await tx.nourishClient.findUnique({ where: { id: command.clientId } });
      let consentConflict=false;
      if (client) {
        client = await requireClient(tx, command);
        if(command.consent && JSON.stringify(command.consent)!==JSON.stringify(client.consent)) {
          // Revocation wins immediately; opt-in must not overwrite a newer
          // staff/caller choice made while this request was being gathered.
          if(!command.consent.enabled || command.expectedVersion===client.version){
            client=await tx.nourishClient.update({where:{id:client.id},data:{consent:json(command.consent),version:{increment:1}}});
            await revision(tx,client,'phone',command.callId);
          } else {
            consentConflict=true;
            await tx.nourishChangeRequest.create({data:{id:command.id,clientId:client.id,kind:'version_conflict',
              reason:'Notification preference changed during a new request. Review the current consent before enabling updates.'}});
          }
        }
      }
      else {
        if(command.reference && !/^\d{10}$/.test(command.reference))throw operationError('A ten-digit household reference is required.');
        if(command.reference && await tx.nourishClient.findUnique({where:{reference:command.reference}}))throw operationError('Household reference is already in use; staff review is required.',409);
        const phone = normalizePhone(command.profile.phone);
        let phoneVerifiedAt: Date | null = null;
        if (command.grant && phone) {
          checkGrant(command.grant, command.clientId, command.callId, command.confirmedAt);
          if (command.grant.phone !== phone) throw operationError('Phone verification mismatch.', 401);
          phoneVerifiedAt = new Date(command.grant.verifiedAt);
        }
        client = await tx.nourishClient.create({ data: { id: command.clientId, reference: command.reference ?? String(randomInt(1000000000, 10000000000)),
          profile: json(command.profile), phone, phoneVerifiedAt,
          consent: json(command.consent ?? { enabled: false, channel: 'none', at: command.confirmedAt }) } });
        await revision(tx, client, 'phone', command.callId);
      }
      const { name: _name, phone, language, ...fields } = command.profile;
      const existingBasket=existingIntake?await tx.nourishBasket.findFirst({where:{intakeId:existingIntake.id},orderBy:[{createdAt:'desc'},{id:'desc'}]}):null;
      const receipt = existingIntake && existingBasket ? {intakeId:existingIntake.id,shoppingListId:existingBasket.id,
        matchedCount:(existingBasket.items as unknown[]).length,items:existingBasket.items} : await submitIntakeInTransaction(tx, { ...fields, language: language ?? undefined, phone: normalizePhone(phone), caseNumber: command.caseNumber }, command.call?.transcript.filter(entry => !/verif|otp|code|pin/i.test(entry.step)));
      await tx.nourishIntake.update({ where: { id: receipt.intakeId }, data: { clientId: client.id } });
      if (command.call) await saveCall(tx, command.call, client.id);
      if(!existingIntake)await tx.nourishDeliveryEvent.create({ data: { eventId: randomUUID(), clientId: client.id, intakeId: receipt.intakeId, kind: 'request.received' } });
      result = { client: publicClient(client) as unknown as NonNullable<PhoneCommandResult['client']>, ...receipt,
        ...(consentConflict ? {queuedForReview:true,changeId:command.id}: {}) };
    } else {
      const client = await requireClient(tx, command);
      if (command.kind === 'read_client') result.client = publicClient(client) as unknown as NonNullable<PhoneCommandResult['client']>;
      else if (command.kind === 'get_status') result.statuses = await statusesForClient(tx, client.id);
      else if (command.kind === 'update_client') {
        requireConfirmation(command);
        if (!command.expectedVersion || !command.profile) throw operationError('Profile version and patch required.');
        if (command.expectedVersion !== client.version) {
          await tx.nourishChangeRequest.create({ data: { id: command.id, clientId: client.id, kind: 'version_conflict', patch: json(command.profile), reason: 'Client profile changed while this call was in progress. Review rather than overwrite.' } });
          result = { queuedForReview: true, changeId: command.id };
        } else {
          const profile = { ...(client.profile as unknown as ClientProfile), ...command.profile };
          const phone = normalizePhone(profile.phone);
          if (phone !== client.phone) {
            checkGrant(command.newPhoneGrant, client.id, command.callId, command.confirmedAt);
            if (command.newPhoneGrant?.phone !== phone) throw operationError('Verify the new phone number first.', 401);
          }
          const updated = await tx.nourishClient.update({ where: { id: client.id }, data: { profile: json(profile), phone,
            phoneVerifiedAt: phone !== client.phone ? new Date(command.newPhoneGrant!.verifiedAt) : client.phoneVerifiedAt,
            consent: command.consent ? json(command.consent) : undefined, version: { increment: 1 } } });
          await revision(tx, updated, 'phone', command.callId);
          const safety = ['dietaryAvoid', 'dietaryNotes', 'hasStove', 'hasFridge'].some(key => Object.hasOwn(command.profile!, key) && JSON.stringify(profile[key as keyof ClientProfile]) !== JSON.stringify((client.profile as unknown as ClientProfile)[key as keyof ClientProfile]));
          if (safety) {
            const active = await tx.nourishIntake.findMany({ where: { clientId: client.id, status: { notIn: ['delivered', 'cancelled'] } } });
            for (const intake of active) {
              await tx.nourishIntake.update({ where: { id: intake.id }, data: { reviewHold: true } });
              await tx.nourishChangeRequest.create({ data: { id: randomUUID(), clientId: client.id, intakeId: intake.id, kind: 'safety_review', patch: json(command.profile), reason: 'Dietary or kitchen information changed. Staff must review the current basket before dispatch.' } });
            }
          }
          result.client = publicClient(updated) as unknown as NonNullable<PhoneCommandResult['client']>;
        }
      } else {
        requireConfirmation(command);
        if (command.intakeId && !await tx.nourishIntake.findFirst({ where: { id: command.intakeId, clientId: client.id } })) throw operationError('Request not found.', 404);
        const kind = command.kind === 'report_missed_delivery' ? 'missed_delivery' : command.kind === 'request_human' ? 'human' : command.changeType ?? 'delivery_change';
        await tx.nourishChangeRequest.create({ data: { id: command.id, clientId: client.id, intakeId: command.intakeId,
          kind, patch: json(command.profile ?? {}), reason: command.reason ?? 'Client requested staff follow-up.' } });
        if (command.intakeId && kind === 'safety_review') await tx.nourishIntake.update({ where: { id: command.intakeId }, data: { reviewHold: true } });
        result = { changeId: command.id, queuedForReview: true };
      }
      if (command.call) await saveCall(tx, command.call, client.id);
    }
    if (!read) await tx.nourishAgentReceipt.create({ data: { id: command.id, hash, result: json(result) } });
    return result;
  });
}

export const listClients = () => prisma.nourishClient.findMany({ where: { mergedIntoId: null }, orderBy: { updatedAt: 'desc' }, take: 200 });
export async function createClientByStaff(raw:unknown,actor:string) {
  const profile=clientProfileSchema.parse(raw);
  if(!profile.name)throw operationError('Contact name required.');
  const phone=normalizePhone(profile.phone);
  return prisma.$transaction(async tx=>{
    const client=await tx.nourishClient.create({data:{id:randomUUID(),reference:String(randomInt(1000000000,10000000000)),
      phone,profile:json({...profile,phone}),consent:json({enabled:false,channel:'none',at:new Date().toISOString()})}});
    await revision(tx,client,actor);return client;
  });
}
export async function clientDetails(id: string) {
  await purgePhoneTranscripts();
  const client = await prisma.nourishClient.findUnique({ where: { id }, include: { revisions: { orderBy: { version: 'desc' } },
    intakes: { orderBy: { createdAt: 'desc' }, include: { baskets: true, deliveries: true } },
    calls: { orderBy: { createdAt: 'desc' }, take: 50 }, changes: { orderBy: { createdAt: 'desc' } } } });
  if (!client) throw operationError('Client not found.', 404);
  return { ...client, calls: client.calls.map(call => ({ ...call, transcript: call.expiresAt > new Date() ? call.transcript : [] })) };
}
export const listChanges = () => prisma.nourishChangeRequest.findMany({ include: { client: true, intake: true }, orderBy: { createdAt: 'desc' }, take: 200 });
export const listCalls = () => prisma.nourishPhoneCall.findMany({ select: { id: true, clientId: true, caseNumber: true, status: true, summary: true, language: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 200 });
export async function callDetails(id:string) {
  await purgePhoneTranscripts();
  const call=await prisma.nourishPhoneCall.findUnique({where:{id}});
  if(!call)throw operationError('Call record not found.',404);
  return call;
}
export async function updateClientByStaff(id: string, raw: unknown, actor: string) {
  const body = z.object({ expectedVersion: z.number().int().positive(), profile: clientProfileSchema, consent: consentSchema.optional() }).strict().parse(raw);
  return prisma.$transaction(async tx => {
    const client = await tx.nourishClient.findUnique({ where: { id } });
    if (!client || client.mergedIntoId) throw operationError('Client not found.', 404);
    if (client.version !== body.expectedVersion) throw operationError('This client changed. Refresh before saving.', 409);
    const profile = { ...(client.profile as unknown as ClientProfile), ...body.profile }, phone = normalizePhone(profile.phone);
    const updated = await tx.nourishClient.update({ where: { id }, data: { profile: json(profile), phone,
      phoneVerifiedAt: phone === client.phone ? client.phoneVerifiedAt : null,
      consent: json(body.consent ?? client.consent), version: { increment: 1 } } });
    await revision(tx, updated, actor);
    // Staff editing does not bypass the same safety holds as phone updates.
    if (['dietaryAvoid', 'dietaryNotes', 'hasStove', 'hasFridge'].some(k => Object.hasOwn(body.profile, k) && JSON.stringify(profile[k as keyof ClientProfile]) !== JSON.stringify((client.profile as unknown as ClientProfile)[k as keyof ClientProfile]))) {
      const intakes = await tx.nourishIntake.findMany({ where: { clientId: id, status: { notIn: ['delivered', 'cancelled'] } } });
      for (const intake of intakes) {
        await tx.nourishIntake.update({ where: { id: intake.id }, data: { reviewHold: true } });
        await tx.nourishChangeRequest.create({ data: { id: randomUUID(), clientId: id, intakeId: intake.id, kind: 'safety_review', patch: json(body.profile), reason: 'Staff profile edit requires basket safety review.' } });
      }
    }
    return updated;
  });
}
export async function mergeClients(sourceId: string, targetId: string, expectedVersion: number, actor: string) {
  if (sourceId === targetId) throw operationError('Choose a different client.');
  return prisma.$transaction(async tx => {
    const source = await tx.nourishClient.findUnique({ where: { id: sourceId } }), target = await tx.nourishClient.findUnique({ where: { id: targetId } });
    if (!source || !target || source.mergedIntoId || target.mergedIntoId || source.version !== expectedVersion) throw operationError('Refresh and select two active client records.', 409);
    const active = await tx.nourishIntake.findMany({ where: { clientId: sourceId, status: { notIn: ['delivered', 'cancelled'] } } });
    await tx.nourishIntake.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.nourishPhoneCall.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    await tx.nourishChangeRequest.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } });
    const targetProfile = target.profile as unknown as ClientProfile;
    const requirements = { dietaryAvoid: targetProfile.dietaryAvoid ?? [], dietaryNotes: targetProfile.dietaryNotes ?? null,
      hasStove: targetProfile.hasStove ?? null, hasFridge: targetProfile.hasFridge ?? null };
    for (const intake of active) {
      if (!Object.entries(requirements).some(([key, value]) => JSON.stringify(intake[key as keyof typeof intake]) !== JSON.stringify(value))) continue;
      await tx.nourishIntake.update({ where: { id: intake.id }, data: { reviewHold: true } });
      await tx.nourishChangeRequest.create({ data: { id: randomUUID(), clientId: targetId, intakeId: intake.id, kind: 'safety_review',
        patch: json(requirements), reason: 'Explicit client merge retained the target household requirements. Staff must check this existing basket.' } });
    }
    const updated = await tx.nourishClient.update({ where: { id: sourceId }, data: { mergedIntoId: targetId, consent: json({ enabled: false, channel: 'none', at: new Date().toISOString() }), version: { increment: 1 } } });
    await revision(tx, updated, actor);
    return { mergedIntoId: targetId };
  });
}
export async function reviewChange(id: string, raw: unknown, actor: string) {
  const body = z.object({ decision: z.enum(['approved', 'rejected', 'resolved']), notes: z.string().trim().min(1).max(2000),
    profile: clientProfileSchema.optional(), scheduledFor: z.string().datetime().optional(), releaseHold: z.boolean().optional() }).strict().parse(raw);
  return prisma.$transaction(async tx => {
    const change = await tx.nourishChangeRequest.findUnique({ where: { id }, include: { intake: { include: { deliveries: true } } } });
    if (!change || change.status !== 'pending') throw operationError('This follow-up was already reviewed. Refresh.', 409);
    if(change.kind==='version_conflict' && body.decision==='approved') throw operationError('Edit the current client profile with its latest version, then resolve this conflict with a note.');
    if (body.decision === 'approved' && change.intake) {
      const intake = change.intake;
      if (change.kind === 'cancellation') {
        if (intake.deliveries.some(d => ['in_transit', 'delivered'].includes(d.status))) throw operationError('Contact the delivery team; an in-transit/completed delivery cannot be cancelled here.');
        await tx.nourishIntake.update({ where: { id: intake.id }, data: { status: 'cancelled' } });
        await tx.nourishDelivery.updateMany({ where: { intakeId: intake.id, status: { not: 'delivered' } }, data: { status: 'failed' } });
      }
      if (body.profile) {
        const { name: _name, language, ...fields } = body.profile;
        await tx.nourishIntake.update({ where: { id: intake.id }, data: { ...fields, language: language ?? undefined, dietaryAvoid: fields.dietaryAvoid ? json(fields.dietaryAvoid) : undefined,
          availabilityDays: fields.availabilityDays ? json(fields.availabilityDays) : undefined, availabilityTimes: fields.availabilityTimes ? json(fields.availabilityTimes) : undefined } });
      }
      if (body.scheduledFor) {
        const delivery = intake.deliveries.find(d => ['pending', 'assigned'].includes(d.status));
        if (!delivery) throw operationError('Choose an approved, undispatched delivery before scheduling.');
        await tx.nourishDelivery.update({ where: { id: delivery.id }, data: { scheduledFor: new Date(body.scheduledFor) } });
      }
      if (intake.clientId) await tx.nourishDeliveryEvent.create({ data: { eventId: randomUUID(), clientId: intake.clientId, intakeId: intake.id, kind: 'change.reviewed' } });
    }
    await tx.nourishChangeRequest.update({ where: { id }, data: { status: body.decision, processedBy: actor, decisionNotes: body.notes } });
    if (body.releaseHold && change.intakeId) {
      const other = await tx.nourishChangeRequest.count({ where: { intakeId: change.intakeId, kind: 'safety_review', status: 'pending' } });
      if (other) throw operationError('Review all safety changes before releasing the hold.');
      const current=await tx.nourishIntake.findUniqueOrThrow({where:{id:change.intakeId}});
      const household=current.clientId?await tx.nourishClient.findUnique({where:{id:current.clientId}}):null;
      const profile=household?.profile as unknown as ClientProfile|undefined;
      if(profile && ['dietaryAvoid','dietaryNotes','hasStove','hasFridge'].some(key=>JSON.stringify(current[key as 'dietaryAvoid'|'dietaryNotes'|'hasStove'|'hasFridge'])!==JSON.stringify(profile[key as keyof ClientProfile] ?? (key==='dietaryAvoid'?[]:null))))
        throw operationError('Apply the current household dietary and kitchen requirements to this intake before releasing its hold.');
      const basket=await tx.nourishBasket.findFirst({where:{intakeId:current.id},orderBy:[{createdAt:'desc'},{id:'desc'}]});
      const items=(basket?.items ?? []) as unknown as ShoppingListItem[];
      const inventory=await tx.foodItem.findMany({where:{id:{in:items.map(i=>i.foodItemId)}},include:{category:true}});
      // Safety is independent of availability: packed stock is already deducted.
      const safe=matchItemsForIntake(inventory.map(item=>({...projectFoodItem(item),isInStock:true,quantity:1})),
        {dietaryAvoid:current.dietaryAvoid as string[],hasStove:current.hasStove,hasFridge:current.hasFridge,householdSize:current.householdSize},{maxItems:Number.MAX_SAFE_INTEGER});
      if(items.some(item=>!safe.some(food=>food.id===item.foodItemId)))throw operationError('The current basket no longer meets these food or kitchen requirements. Rebuild a draft basket for staff review before releasing the hold.');
      await tx.nourishIntake.update({ where: { id: change.intakeId }, data: { reviewHold: false } });
    }
    return { reviewed: true };
  });
}
export async function rebuildSafetyBasket(intakeId:string,raw:unknown,actor:string) {
  const body=z.object({notes:z.string().trim().min(1).max(2000),stockReconciled:z.literal(true)}).strict().parse(raw);
  return prisma.$transaction(async tx=>{
    const intake=await tx.nourishIntake.findUnique({where:{id:intakeId},include:{deliveries:true}});
    if(!intake?.clientId || !intake.reviewHold || intake.status==='cancelled' || intake.deliveries.some(d=>['in_transit','delivered'].includes(d.status)))
      throw operationError('A safety-held, undispatched client intake is required.');
    const client=await tx.nourishClient.findUniqueOrThrow({where:{id:intake.clientId}}),p=client.profile as unknown as ClientProfile;
    const old=await tx.nourishBasket.findFirst({where:{intakeId},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    const requirements={dietaryAvoid:p.dietaryAvoid ?? [],dietaryNotes:p.dietaryNotes ?? null,hasStove:p.hasStove ?? null,hasFridge:p.hasFridge ?? null};
    await tx.nourishIntake.update({where:{id:intakeId},data:{...requirements,dietaryAvoid:json(requirements.dietaryAvoid)}});
    const inventory=await tx.foodItem.findMany({where:{isInStock:true,quantity:{gt:0}},include:{category:true},orderBy:{id:'asc'}});
    const matched=matchItemsForIntake(inventory.map(projectFoodItem),{...requirements,householdSize:intake.householdSize});
    const items=buildShoppingListItems(matched,intake.householdSize,requirements.dietaryAvoid);
    const basket=await tx.nourishBasket.create({data:{intakeId,title:`Safety review ${intake.caseNumber}`,items:json(items)}});
    await tx.nourishDelivery.updateMany({where:{intakeId,status:{in:['pending','assigned','failed']}},data:{shoppingListId:basket.id}});
    await tx.nourishChangeRequest.create({data:{id:randomUUID(),clientId:client.id,intakeId,kind:'basket_rebuild',status:'resolved',
      reason:`Staff created draft ${basket.id}; previous basket ${old?.id ?? 'none'} retained as history. No automatic stock refund.`,decisionNotes:body.notes,processedBy:actor}});
    return {basketId:basket.id,previousBasketId:old?.id ?? null};
  });
}
export async function deliveryEvents(after: number) {
  const latest = await prisma.nourishDeliveryEvent.findFirst({ orderBy: { id: 'desc' } });
  const reset = after > (latest?.id ?? 0);
  const events = await prisma.nourishDeliveryEvent.findMany({ where: { id: { gt: reset ? 0 : after } }, orderBy: { id: 'asc' }, take: 100 });
  return { events, reset, cursor: events.at(-1)?.id ?? (reset ? 0 : after) };
}
export async function purgePhoneTranscripts() {
  await prisma.nourishPhoneCall.updateMany({ where: { expiresAt: { lt: new Date() } }, data: { transcript: [] } });
  // Legacy intake transcript copies follow the same retention boundary.
  await prisma.nourishIntake.updateMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86400000) }, clientId: { not: null } }, data: { transcript: [] } });
}
export async function clientAnalytics(filters: { preset?: AnalyticsRangePreset; startDate?: string; endDate?: string }): Promise<ClientAnalytics> {
  const settings = await getOperatingHoursSettings();
  const earliest = await prisma.nourishClient.findFirst({ orderBy: { createdAt: 'asc' } });
  const range = resolveRange(filters.preset ?? 'last-90-days', settings.timezone, new Date(),
    filters.startDate && filters.endDate ? { startDate: filters.startDate, endDate: filters.endDate } : undefined,
    earliest ? localDateOf(earliest.createdAt, settings.timezone) : undefined);
  const clients = await prisma.nourishClient.findMany();
  const within = (date: Date) => date >= range.startUtc && date < range.endUtc;
  const byId=new Map(clients.map(c=>[c.id,c]));
  const canonical=(id:string)=>{const visited=new Set<string>();while(byId.get(id)?.mergedIntoId && !visited.has(id)){visited.add(id);id=byId.get(id)!.mergedIntoId!;}return id;};
  const registered = [...new Set(clients.filter(c => within(c.createdAt)).map(c=>canonical(c.id)))].map(id=>byId.get(id)!).filter(Boolean);
  const requests = await prisma.nourishIntake.findMany({ where: { clientId: { not: null }, createdAt: { gte: range.startUtc, lt: range.endUtc } } });
  const completions = await prisma.nourishDeliveryEvent.findMany({ where: { kind: 'delivery.delivered', createdAt: { gte: range.startUtc, lt: range.endUtc } } });
  const counts = (values: string[]) => [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  return { source: 'mealline', startDate: range.startDate, endDate: range.endDate,
    registeredHouseholds: registered.length, requests: requests.length, requestedHouseholds: new Set(requests.map(r => canonical(r.clientId!))).size,
    completedDeliveries: new Set(completions.filter(e=>e.intakeId).map(event => event.intakeId)).size, servedHouseholds: new Set(completions.map(event => canonical(event.clientId))).size,
    householdSizes: counts(registered.map(c => String((c.profile as unknown as ClientProfile).householdSize ?? 'Unknown'))),
    postalCodes: counts(registered.map(c => (c.profile as unknown as ClientProfile).addressZip ?? 'Unknown')),
    preferredCallLanguages: counts(registered.map(c => (c.profile as unknown as ClientProfile).language ?? 'Unknown')) };
}
