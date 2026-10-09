/** Server-owned client workflow. The model extracts a single field, never an identity or action. */
import { randomInt, randomUUID } from 'node:crypto';
import type { CallerGrant, ClientProfile, NotificationConsent, PhoneClient, PhoneCommand, PhoneStatus } from '../../packages/core/src/clients';
import type { SessionRow, TurnOptions, TurnResult } from './controller';
import type { ModelPort } from './model';
import type { DraftFields, IntakeStep } from './types';
import { t } from './i18n';
import { db } from './db';
import { createCaseFromDraft, recordEvent, submitForReview, DraftFieldsSchema } from './cases';
import { phoneCommand, issueCallerGrant, draftFromProfile, profileFromDraft, queuePhoneCommand, callSnapshot, commandId } from './nourishPhone';
import { beginVerification, checkVerification, verificationRow, phoneHash, usPhone, type VerificationPort } from './phoneVerification';
import { phoneText, spokenStatus } from './phonePrompts';

export type PhonePhase = 'language' | 'privacy' | 'menu' | 'returning' | 'name' | 'identify' | 'reference' | 'verify_channel' | 'verify' | 'callback_wait' | 'resume_review' | 'intake' | 'profile_review' | 'update_select' | 'update_review' | 'notify' | 'request_select' | 'reason' | 'change_review' | 'finished';
export interface PhoneState {
  phase: PhonePhase; clientId: string; isNew: boolean; privacy: boolean; orgId?: string;
  operation: 'new' | 'status' | 'update' | 'change' | 'missed';
  grant?: CallerGrant; newPhoneGrant?: CallerGrant; verificationId?: string; afterVerify?: PhonePhase;
  verificationPurpose?: 'access' | 'enroll' | 'phone_change'; targetPhone?: string;
  version?: number; consent: NotificationConsent; selectedStep?: IntakeStep | 'name' | 'phone' | 'notify';
  patch?: ClientProfile; statuses?: PhoneStatus[]; intakeId?: string; caseNumber?: string;
  reason?: string; failures: number; callEndedAt?: string; linkedIntakeId?: string;
  lastStatus?: PhoneStatus[]; lastStatusAt?: string;
  reference?: string; resumeSessionId?: string; resumedIntoId?: string;
}
export function newPhoneState(): PhoneState {
  return { phase: 'language', clientId: randomUUID(), isNew: true, privacy: false, operation: 'new', failures: 0,
    reference:String(randomInt(1000000000,10000000000)), consent: { enabled: false, channel: 'none', at: new Date().toISOString() } };
}
export interface PhonePorts { verification?: VerificationPort; command?: typeof phoneCommand }
export function phoneDigitCount(session: SessionRow) {
  const state = session.phone_state;
  const needsPhone = state?.phase === 'intake' && (state.selectedStep === 'phone'
    || (session.step === 'contact' && session.draft_fields.contactPreference === 'callback' && !session.draft_fields.contactPhone));
  return state?.phase === 'verify' ? 6 : ['identify','reference'].includes(state?.phase ?? '') || needsPhone ? 10 : 1;
}
export function protectedPhoneInput(session: SessionRow) { return session.phone_state?.phase === 'verify'; }
function affirmative(input: string) {
  return /^(1|yes|yes please|yes, please|yeah|yep|confirm|ok|okay|that's right|that's correct|that is correct|đúng|đúng rồi|vâng|xác nhận|đồng ý|sí|si|correcto|sí, correcto)[.!?]*$/iu.test(input.trim());
}
function profileReadback(profile:ClientProfile,locale:SessionRow['language']) {
  const S=t(locale),words={en:{none:'none reported',yes:'yes',no:'no',unknown:'not recorded',stove:'stove',fridge:'refrigerator',phone:'Contact phone'},
    es:{none:'ninguno',yes:'sí',no:'no',unknown:'sin registrar',stove:'estufa',fridge:'refrigerador',phone:'Teléfono de contacto'},
    vi:{none:'không có',yes:'có',no:'không',unknown:'chưa ghi nhận',stove:'bếp',fridge:'tủ lạnh',phone:'Điện thoại liên hệ'}}[locale];
  const lines:string[]=[];
  if(profile.name)lines.push(phoneText(locale,'nameReadback',{name:profile.name}));
  if(profile.addressRaw)lines.push(S.readback_address(profile.addressRaw));
  if(profile.householdSize)lines.push(S.readback_household(profile.householdSize));
  if(Object.hasOwn(profile,'dietaryAvoid'))lines.push(S.readback_dietary(profile.dietaryAvoid?.join(', ') || words.none));
  if(profile.dietaryNotes)lines.push(S.readback_dietary(profile.dietaryNotes));
  if(Object.hasOwn(profile,'hasStove') || Object.hasOwn(profile,'hasFridge')){
    const equipment=(['hasStove','hasFridge'] as const).filter(key=>Object.hasOwn(profile,key)).map(key=>`${key==='hasStove'?words.stove:words.fridge}: ${profile[key]==null?words.unknown:profile[key]?words.yes:words.no}`);
    lines.push(S.readback_equipment(equipment.join(', ')));
  }
  if(profile.phone)lines.push(`${words.phone}: ${profile.phone.replace(/^\+1/,'').split('').join(' ')}.`);
  if(profile.availabilityRaw)lines.push(S.readback_availability(profile.availabilityRaw));
  if(Object.hasOwn(profile,'accommodation'))lines.push(S.readback_accommodation(profile.accommodation || words.none));
  return lines.join(' ');
}
export function phonePrompt(session: SessionRow, readback: (s: SessionRow) => string): string {
  const state = session.phone_state!;
  const text = (key: Parameters<typeof phoneText>[1], values?: Record<string,string>) => phoneText(session.language, key, values);
  if (state.phase === 'language') return t(session.language).ask_language;
  if (state.phase === 'intake') {
    if (state.selectedStep === 'name') return text('name');
    if (state.selectedStep === 'phone') return text('phone');
    if (session.step === 'contact' && session.draft_fields.contactPreference === 'callback' && !session.draft_fields.contactPhone) return text('phone');
    const S = t(session.language);
    return { address: S.ask_address, household: S.ask_household, dietary: S.ask_dietary, equipment: S.ask_equipment,
      availability: S.ask_availability, contact: S.ask_contact, accommodation: S.ask_accommodation,
      review: profileReadback(profileFromDraft(session.draft_fields,session.language),session.language)+' '+S.confirm_question, language: S.ask_language }[session.step];
  }
  if (state.phase === 'profile_review') return text('savedProfile', { details: profileReadback(profileFromDraft(session.draft_fields,session.language),session.language) });
  if (state.phase === 'update_review') {
    const preferences = { en: { sms: 'Text updates', voice_callback: 'Generic callback reminders', none: 'No automatic updates' },
      es: { sms: 'Avisos por texto', voice_callback: 'Recordatorios generales por llamada', none: 'Ningún aviso automático' },
      vi: { sms: 'Thông báo qua tin nhắn', voice_callback: 'Cuộc gọi nhắc chung', none: 'Không nhận thông báo tự động' } };
    const details = state.selectedStep === 'notify' ? preferences[session.language][state.consent.channel]
      : profileReadback(state.patch ?? {},session.language);
    return text('updateReview', { details });
  }
  if (state.phase === 'change_review') return text('changeReview', { details: state.reason ?? '' });
  if (state.phase === 'request_select') return text('requestSelect', { choices: (state.statuses ?? []).slice(0,9).map((s,i) => `${i+1}: ${spokenStatus(s,session.language)}`).join(' ') });
  const keys: Partial<Record<PhonePhase, Parameters<typeof phoneText>[1]>> = { privacy: 'privacy', menu: 'menu', returning: 'returning', name: 'name', identify: 'identify', reference: 'reference',
    verify_channel: 'channel', verify: 'verify', callback_wait: 'callback', resume_review: 'resume', update_select: 'updateSelect', notify: 'notify', reason: 'reason', finished: 'queued' };
  return text(keys[state.phase] ?? 'menu');
}
const stepFields: Record<IntakeStep, Array<keyof DraftFields>> = { language: [], address: ['address'], household: ['household'],
  dietary: ['dietaryAvoid','dietaryNotes'], equipment: ['equipment'], availability: ['availability'],
  contact: ['contactPreference','contactPhone','contactName'], accommodation: ['accommodation'], review: [] };
const patchFields: Record<string, Array<keyof ClientProfile>> = { address: ['addressRaw','addressStreet','addressCity','addressZip'], household: ['householdSize'],
  dietary: ['dietaryAvoid','dietaryNotes'], equipment: ['hasStove','hasFridge'], availability: ['availabilityRaw','availabilityDays','availabilityTimes'],
  phone: ['phone'], name: ['name'], accommodation: ['accommodation'] };
const intakeOrder: IntakeStep[] = ['address','household','dietary','equipment','availability','contact','accommodation','review'];
export async function processPhoneTurn(session: SessionRow, rawInput: string | null, opts: TurnOptions, model: ModelPort,
  readback: (s: SessionRow) => string, ports: PhonePorts = {}): Promise<TurnResult> {
  const state = session.phone_state!, input = (rawInput ?? '').trim(), text = (key: Parameters<typeof phoneText>[1], values?: Record<string,string>) => phoneText(session.language,key,values);
  state.orgId = opts.orgId;
  const command = ports.command ?? phoneCommand;
  const result = (reply = phonePrompt(session,readback), done = false, handoff: TurnResult['handoff'] = null): TurnResult => ({ reply,done,handoff,session,caseId: session.case_id ?? undefined,caseNumber: state.caseNumber });
  const fail = () => { state.failures += 1; return state.failures >= 3 ? human() : result(); };
  const base = (kind: PhoneCommand['kind']): PhoneCommand => ({ id: commandId(), callId: session.id, kind, clientId: state.clientId, grant: state.grant });
  async function human(): Promise<TurnResult> {
    session.status = 'transferred';
    if (state.privacy) {
      const call = await callSnapshot(session,'needs_followup','Human assistance requested; no delivery is promised.');
      await queuePhoneCommand({ ...base('request_human'), clientId: state.grant && Date.parse(state.grant.expiresAt)>Date.now() && !state.isNew ? state.clientId : undefined,
        confirmedAt: new Date().toISOString(), reason: 'Caller requested a person or could not complete the flow.', call },session.id);
    }
    return result(text('human'),true,{mode:'transfer',reason:'phone_client_followup'});
  }
  async function finishCommand(outgoing: PhoneCommand) {
    if (outgoing.kind !== 'submit_request') {
      const c = await createCaseFromDraft({ orgId: opts.orgId,providerId:opts.providerId,type:state.operation==='missed'?'missed_delivery':'change',channel:session.channel,language:session.language,draft:session.draft_fields });
      session.case_id = c.id; state.caseNumber = c.case_number;
      await submitForReview(c.id);
      await db().query('UPDATE assistance_cases SET nourish_managed=true,nourish_client_id=$2,nourish_intake_id=$3 WHERE id=$1',[c.id,state.clientId,state.intakeId ?? null]);
    }
    outgoing.call = await callSnapshot(session,'confirmed',state.operation === 'new' ? 'Confirmed food request awaiting staff approval.' : 'Confirmed client action awaiting MealLine synchronization.');
    outgoing.call.caseNumber = state.caseNumber;
    await queuePhoneCommand(outgoing,session.id);
    state.phase='finished'; session.status='completed';
    return result(state.operation === 'new' ? text(state.isNew?'newReceipt':'receipt',{caseNumber:state.caseNumber ?? '',reference:(state.reference ?? '').split('').join(' ')}) : text('queued'),true);
  }
  async function verifyTarget(purpose: PhoneState['verificationPurpose'], after: PhonePhase, phone: string) {
    state.verificationPurpose=purpose;state.afterVerify=after;state.targetPhone=phone;state.phase='verify_channel';
    return result();
  }
  async function afterAccess(client: PhoneClient,allowResume=true) {
    state.isNew=false;state.version=client.version;state.consent=client.consent;state.reference=client.reference;
    session.draft_fields=draftFromProfile(client.profile);
    // A replacement-number callback cannot authorize access to the existing
    // household. First verify the registered number on this new call, then
    // resume the replacement challenge and its original version/patch.
    if (state.operation==='update' || state.operation==='new') {
      const pending = await db().query(`SELECT v.id,s.id source_id,s.draft_fields,s.step,s.phone_state FROM nourish_phone_verifications v
        JOIN conversation_sessions s ON s.id=v.session_id
        WHERE v.client_id=$1 AND v.verified_at IS NULL AND v.provider_sid IS NOT NULL AND v.expires_at>now()
          AND (v.locked_until IS NULL OR v.locked_until<=now()) AND s.id<>$2
          AND s.phone_state->>'orgId'=$3 AND s.phone_state->>'verificationPurpose'='phone_change'
          AND s.phone_state->>'operation'=$4 AND s.phone_state->'grant'->>'phone'=$5
        ORDER BY v.created_at DESC LIMIT 2`,[client.id,session.id,opts.orgId,state.operation,client.phone]);
      if (pending.rows.length===1) {
        const saved = pending.rows[0], old = saved.phone_state as PhoneState;
        const currentGrant = state.grant;
        Object.assign(state,{...old,grant:currentGrant,newPhoneGrant:undefined,verificationId:saved.id,failures:0,callEndedAt:undefined,phase:'verify'});
        session.draft_fields=saved.draft_fields;session.step=saved.step;
        return result(text('verifyNewPhone'));
      }
    }
    if (allowResume && state.operation!=='status') {
      const unfinished=await db().query(`SELECT id FROM conversation_sessions WHERE id<>$1 AND case_id IS NULL
        AND status IN ('abandoned','callback','transferred') AND created_at>now()-interval '30 days'
        AND phone_state->>'clientId'=$2 AND phone_state->>'orgId'=$3 AND phone_state->>'operation'=$4
        AND phone_state->'grant'->>'phone'=$5 AND NOT (phone_state ? 'resumedIntoId')
        AND phone_state->>'phase' IN ('intake','profile_review','update_select','update_review','notify','request_select','reason','change_review')
        ORDER BY last_input_at DESC NULLS LAST,created_at DESC LIMIT 1`,[session.id,client.id,opts.orgId,state.operation,client.phone]);
      if(unfinished.rows.length){state.resumeSessionId=unfinished.rows[0].id;state.phase='resume_review';return result();}
    }
    if(state.operation==='new') { state.phase='profile_review';return result(); }
    if(state.operation==='update') { state.phase='update_select';return result(); }
    const response=await command(base('get_status'));
    state.statuses=response.statuses ?? [];state.lastStatus=state.statuses;state.lastStatusAt=new Date().toISOString();
    if(state.operation==='status') {
      state.phase='menu';
      return result(state.statuses.length ? state.statuses.slice(0,5).map(s=>spokenStatus(s,session.language)).join(' ')+' '+text('menu') : text('noRequests',{menu:text('menu')}));
    }
    if(!state.statuses.length){state.phase='menu';return result(text('noRequests',{menu:text('menu')}));}
    if(state.statuses.length===1){state.intakeId=state.statuses[0].intakeId;state.phase='reason';return result();}
    state.phase='request_select';return result();
  }
  if(session.status!=='active') return result(t(session.language).hangup_saved,true);
  // A late transcription/retried keypad entry must not send a verification
  // code into a model after the verification phase has already advanced.
  if(state.phase!=='verify' && /^\d{6}$/.test(input.replace(/[ -]/g,'')))return result();
  if(input==='#' || input==='0' || /^(person|agent|human|persona|nhân viên|gặp nhân viên)$/iu.test(input)) return human();
  if(/^(repeat|say again|repetir|lặp lại|nói lại)$/iu.test(input)) return result();
  if(!input) {
    state.failures+=1;
    return state.failures>=2 ? human() : result(t(session.language).no_input+' '+phonePrompt(session,readback));
  }
  try {
    if(state.phase==='language') {
      const extraction=await model.interpret('language',input,session.language);
      if(!extraction.languageHint) return fail();
      session.language=extraction.languageHint;session.step='address';state.phase='privacy';return result();
    }
    if(state.phase==='privacy') {
      if(!affirmative(input)) return human();
      state.privacy=true;state.phase='menu';return result();
    }
    if(state.phase==='menu') {
      const choice=/^(1|new|food request|food|alimentos|comida|thực phẩm)$/iu.test(input)?'new'
        : /^(2|status|delivery status|estado|giao hàng)$/iu.test(input)?'status'
        : /^(3|update|profile|information|actualizar|thông tin)$/iu.test(input)?'update'
        : /^(4|change|change delivery|cambiar|thay đổi)$/iu.test(input)?'change'
        : /^(5|missed|missed delivery|no delivery|perdida|chưa nhận)$/iu.test(input)?'missed':null;
      if(!choice) return fail();
      state.failures=0;
      state.operation=choice;
      if(state.grant && Date.parse(state.grant.expiresAt)>Date.now()) {
        const response=await command(base('read_client'));if(response.client)return afterAccess(response.client);
      }
      state.phase=choice==='new'?'returning':'identify';return result();
    }
    if(state.phase==='returning') {
      if(affirmative(input)){state.phase='identify';return result();}
      if(!/^(2|no|chưa|không)$/iu.test(input))return fail();
      state.isNew=true;state.phase='name';return result();
    }
    if(state.phase==='name') {
      if(input.length>200 || !/\p{L}/u.test(input))return fail();
      session.draft_fields.contactName=input;state.phase='intake';session.step='address';return result();
    }
    if(state.phase==='identify' || state.phase==='reference') {
      const outgoing:PhoneCommand={...base('resolve_client'),clientId:undefined,grant:undefined,
        ...(state.phase==='reference'?{reference:input.replace(/[^\d]/g,'')}:{phone:usPhone(input) ?? input})};
      const response=await command(outgoing);
      const phone=response.target?.phone ?? usPhone(input);
      if(phone && !response.referenceRequired) {
        const pending=await db().query(`SELECT v.id,v.client_id,s.phone_state FROM nourish_phone_verifications v
          JOIN conversation_sessions s ON s.id=v.session_id
          WHERE v.phone_hash=$1 AND v.verified_at IS NULL AND v.expires_at>now() AND v.provider_sid IS NOT NULL
            AND (v.locked_until IS NULL OR v.locked_until<=now())
            AND s.phone_state->>'orgId'=$2 AND (s.phone_state->>'verificationPurpose' IN ('enroll','access')
              OR (s.phone_state->>'verificationPurpose'='phone_change' AND s.phone_state->>'isNew'='true'))
          ORDER BY v.created_at DESC LIMIT 2`,[phoneHash(phone),opts.orgId]);
        const candidates = pending.rows.filter(row => response.target ? row.client_id===response.target.clientId : row.phone_state.verificationPurpose==='enroll' || row.phone_state.isNew===true);
        if(candidates.length===1){state.verificationId=candidates[0].id;state.clientId=candidates[0].client_id;
          state.verificationPurpose=candidates[0].phone_state.verificationPurpose;state.phase='verify';return result();}
      }
      if(response.target){state.clientId=response.target.clientId;state.isNew=false;return verifyTarget('access','menu',response.target.phone);}
      state.phase='reference';return fail();
    }
    if(state.phase==='verify_channel') {
      if(input!=='1' && input!=='2')return fail();
      const row=await beginVerification(state.targetPhone!,state.clientId,session.id,input==='1'?'sms':'call',session.language,ports.verification);
      state.verificationId=row.id;state.phase=input==='1'?'verify':'callback_wait';state.failures=0;
      if(input==='2'){session.status='completed';return result(text('callback'),true);}
      return result();
    }
    if(state.phase==='verify') {
      if(input==='*'){state.phase='verify_channel';return result();}
      const verified=await checkVerification(state.verificationId!,input,ports.verification);
      if(!verified){state.failures+=1;return state.failures>=3?human():result(text('verifyFailed'));}
      state.failures=0;
      const grant=issueCallerGrant(state.clientId,session.id,verified.phone,new Date(verified.verified_at!).toISOString());
      if(state.verificationPurpose==='phone_change' && verified.session_id===session.id){
        state.newPhoneGrant=grant;if(state.isNew)state.grant=grant;
        state.phase='update_review';return result();
      }
      if(state.verificationPurpose!=='phone_change')state.grant=grant;
      // Landline enrollment resumes only after the previous challenge is verified.
      if(verified.session_id!==session.id){
        const original=await db().query('SELECT draft_fields,phone_state,step FROM conversation_sessions WHERE id=$1',[verified.session_id]);
        const old=original.rows[0]?.phone_state as PhoneState|undefined;
        if(old?.orgId===opts.orgId && old.clientId===state.clientId && old.targetPhone===verified.phone
          && (['enroll','access'].includes(old.verificationPurpose ?? '') || (old.verificationPurpose==='phone_change' && old.isNew))){
          const preserved = { ...old, grant, failures:0, callEndedAt:undefined, verificationId:state.verificationId };
          Object.assign(state,preserved);session.draft_fields=original.rows[0].draft_fields;session.step=original.rows[0].step;
          state.phase=old.afterVerify ?? 'menu';state.afterVerify=undefined;
          if(old.verificationPurpose==='phone_change')state.newPhoneGrant=grant;
          if(old.verificationPurpose==='enroll' || state.phase!=='menu') return result();
        }
      }
      if(state.verificationPurpose==='phone_change'){
        // Existing-household callback resumes already carry a fresh grant for
        // the registered phone; this second code verifies only the new phone.
        state.newPhoneGrant=grant;state.phase='update_review';return result();
      }
      if(state.verificationPurpose==='enroll'){state.phase=state.afterVerify ?? 'notify';return result();}
      // Renew an expired lease without replacing a proposed patch or the
      // version it was based on. A concurrent edit must still become a conflict.
      if(state.afterVerify && state.afterVerify!=='menu'){
        state.phase=state.afterVerify;state.afterVerify=undefined;return result();
      }
      const response=await command(base('read_client'));
      if(!response.client)throw new Error('nourish_phone_invalid_response');
      return afterAccess(response.client);
    }
    if(state.phase==='profile_review') {
      if(affirmative(input)){state.phase='notify';return result();}
      if(input==='2' || /^(no|correct|corregir|sửa)$/iu.test(input)){state.phase='update_select';return result();}
      return fail();
    }
    if(state.phase==='resume_review') {
      if(input==='2'){
        state.resumeSessionId=undefined;const response=await command(base('read_client'));
        if(!response.client)throw new Error('nourish_phone_invalid_response');return afterAccess(response.client,false);
      }
      if(!affirmative(input))return fail();
      const original=await db().query(`UPDATE conversation_sessions SET phone_state=jsonb_set(phone_state,'{resumedIntoId}',to_jsonb($2::text))
        WHERE id=$1 AND NOT (phone_state ? 'resumedIntoId') AND case_id IS NULL AND phone_state->>'clientId'=$3
          AND phone_state->>'orgId'=$4 AND phone_state->'grant'->>'phone'=$5 RETURNING draft_fields,phone_state,step`,
        [state.resumeSessionId,session.id,state.clientId,opts.orgId,state.grant?.phone]);
      if(!original.rows.length)return human();
      const old=original.rows[0].phone_state as PhoneState,currentGrant=state.grant,verificationId=state.verificationId;
      Object.assign(state,{...old,grant:currentGrant,newPhoneGrant:undefined,verificationId,failures:0,callEndedAt:undefined,resumeSessionId:undefined,resumedIntoId:undefined});
      session.draft_fields=original.rows[0].draft_fields;session.step=original.rows[0].step;
      if(state.patch?.phone && state.patch.phone!==currentGrant?.phone)return verifyTarget('phone_change','update_review',state.patch.phone);
      return result();
    }
    if(state.phase==='update_select') {
      const choices:Record<string,IntakeStep|'name'|'phone'|'notify'>={'1':'address','2':'dietary','3':'equipment','4':'household','5':'availability','6':'phone','7':'name','8':'accommodation','9':'notify'};
      const aliases:Record<string,string>={address:'1',dirección:'1','địa chỉ':'1',allergies:'2',food:'2',dietary:'2',alimentos:'2','thực phẩm':'2',kitchen:'3',cocina:'3','nhà bếp':'3',household:'4',familia:'4','gia đình':'4',availability:'5',disponibilidad:'5','thời gian':'5',phone:'6',teléfono:'6','điện thoại':'6',name:'7',nombre:'7',tên:'7',accommodation:'8',instructions:'8',notifications:'9',updates:'9'};
      state.selectedStep=choices[input.toLowerCase()] ?? choices[aliases[input.toLowerCase()]];
      if(!state.selectedStep)return fail();
      state.patch={};state.phase=state.selectedStep==='notify'?'notify':'intake';
      session.step=['name','phone','notify'].includes(state.selectedStep)?'contact':state.selectedStep as IntakeStep;
      return result();
    }
    if(state.phase==='intake') {
      let fields:Partial<DraftFields>={};
      if(state.selectedStep==='name') {
        if(input.length>200 || !/\p{L}/u.test(input))return fail();fields={contactName:input};
      } else if(state.selectedStep==='phone') {
        const phone=usPhone(input);if(!phone)return fail();fields={contactPhone:phone.slice(2)};
      } else if(session.step==='contact' && session.draft_fields.contactPreference==='callback' && !session.draft_fields.contactPhone && usPhone(input)) {
        fields={contactPhone:usPhone(input)!.slice(2)};
      } else {
        if(session.step==='review') {
          if(!affirmative(input)){
            if(input==='2'||/^(no|correct|corregir|sửa)$/iu.test(input)){state.phase='update_select';return result();}
            return fail();
          }
          if(state.grant && Date.parse(state.grant.expiresAt)<=Date.now())return verifyTarget('access','intake',state.grant.phone);
          const c=await createCaseFromDraft({orgId:opts.orgId,providerId:opts.providerId,type:'new_delivery',channel:session.channel,language:session.language,draft:session.draft_fields});
          session.case_id=c.id;state.caseNumber=c.case_number;
          await submitForReview(c.id);
          await db().query('UPDATE assistance_cases SET nourish_managed=true,nourish_client_id=$2 WHERE id=$1',[c.id,state.clientId]);
          await recordEvent(c.id,'system','nourish_sync_queued',{clientId:state.clientId});
          return finishCommand({...base('submit_request'),reference:state.isNew?state.reference:undefined,profile:profileFromDraft(session.draft_fields,session.language),consent:state.consent,
            expectedVersion:state.version,caseNumber:c.case_number,confirmedAt:new Date().toISOString()});
        }
        const extraction=await model.interpret(session.step,input,session.language);
        if(extraction.intent==='human')return human();
        if(extraction.intent==='repeat')return result();
        if(extraction.intent==='correct'){state.phase='update_select';return result();}
        if(extraction.unknowns.length && extraction.confidence<0.7)return fail();
        const filtered=Object.fromEntries(Object.entries(extraction.fields).filter(([key])=>stepFields[session.step].includes(key as keyof DraftFields)));
        fields=DraftFieldsSchema.parse(filtered);
        if(!Object.keys(fields).length)return fail();
      }
      state.failures=0;session.draft_fields={...session.draft_fields,...fields};
      if(state.selectedStep){
        const flat=profileFromDraft(session.draft_fields,session.language),keys=patchFields[state.selectedStep]??[];
        state.patch=Object.fromEntries(keys.map(key=>[key,flat[key]]));
        if(state.selectedStep==='phone')return verifyTarget('phone_change','update_review',flat.phone!);
        state.phase='update_review';return result();
      }
      if(session.step==='contact' && session.draft_fields.contactPreference==='callback' && !session.draft_fields.contactPhone)return result(t(session.language).ask_phone);
      const next=intakeOrder[intakeOrder.indexOf(session.step)+1] ?? 'review';session.step=next;
      if(next==='review'){
        const phone=profileFromDraft(session.draft_fields,session.language).phone;
        if(phone && !state.grant)return verifyTarget('enroll','notify',phone);
        state.phase='notify';
      }
      return result();
    }
    if(state.phase==='notify') {
      const choice=/^(1|text|sms|texto|tin nhắn)$/iu.test(input)?'sms':/^(2|callback|call|llamada|gọi)$/iu.test(input)?'voice_callback':/^(3|no|none|ninguno|không)$/iu.test(input)?'none':null;
      if(!choice)return fail();
      state.consent={enabled:choice!=='none',channel:choice,at:new Date().toISOString()};
      if(state.selectedStep==='notify'){state.phase='update_review';return result();}
      session.step='review';state.phase='intake';return result();
    }
    if(state.phase==='update_review') {
      if(!affirmative(input)){state.phase='update_select';return result();}
      if(state.operation==='new'){state.selectedStep=undefined;state.patch=undefined;state.phase='notify';return result();}
      if(!state.grant || Date.parse(state.grant.expiresAt)<=Date.now())return verifyTarget('access','update_review',state.grant?.phone ?? state.targetPhone!);
      return finishCommand({...base('update_client'),profile:state.patch ?? {},consent:state.selectedStep==='notify'?state.consent:undefined,
        expectedVersion:state.version,newPhoneGrant:state.newPhoneGrant,confirmedAt:new Date().toISOString()});
    }
    if(state.phase==='request_select') {
      const selected=/^[1-9]$/.test(input)?state.statuses?.[Number(input)-1]:state.statuses?.find(s=>s.caseNumber.toLowerCase()===input.toLowerCase());
      if(!selected)return fail();state.intakeId=selected.intakeId;state.phase='reason';return result();
    }
    if(state.phase==='reason'){if(input.length>2000)return fail();state.reason=input;state.phase='change_review';return result();}
    if(state.phase==='change_review') {
      if(!affirmative(input)){state.phase='reason';return result();}
      if(!state.grant || Date.parse(state.grant.expiresAt)<=Date.now())return verifyTarget('access','change_review',state.grant?.phone ?? state.targetPhone!);
      return finishCommand({...base(state.operation==='missed'?'report_missed_delivery':'request_change'),intakeId:state.intakeId,
        reason:state.reason,changeType: /cancel|cancelar|hủy/iu.test(state.reason??'')?'cancellation':'delivery_change',confirmedAt:new Date().toISOString()});
    }
    return result();
  } catch(error) {
    const code=error instanceof Error?error.message:'';
    if(code==='verification_cooldown'||code==='verification_locked')return result(text('cooldown'));
    if(code.startsWith('phone_verification_')) {
      if(state.isNew && state.operation==='new'){state.grant=undefined;state.phase='notify';session.step='review';return result(text('verifyUnavailable')+' '+text('notify'));}
      return human();
    }
    if(code==='nourish_phone_401'){state.grant=undefined;state.phase='identify';return result();}
    if(code.startsWith('nourish_phone_')) {
      session.status='callback';
      if(state.privacy){const call=await callSnapshot(session,'needs_followup','Client service unavailable; staff follow-up required.');await queuePhoneCommand({id:commandId(),callId:session.id,kind:'request_human',reason:'Client service unavailable.',call},session.id);}
      return result(text('unavailable'),true);
    }
    throw error;
  }
}
