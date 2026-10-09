import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSession,getSession,processTurn,abandonSession,getSessionTurns} from '../lib/controller';
import {DeterministicModel,type ModelPort} from '../lib/model';
import {phoneDigitCount,type PhonePorts} from '../lib/phoneFlow';
import {issueCallerGrant,queuePhoneCommand} from '../lib/nourishPhone';
import {beginVerification,checkVerification,verificationRow} from '../lib/phoneVerification';
import {claimPhoneJobs,processPhoneJob,collectPhoneEvents,retryPhoneJob,purgePhoneText} from '../lib/phoneJobs';
import {db,inTransaction} from '../lib/db';
import {approveDelivery} from '../lib/approval';
import {getCase,recordOutcome} from '../lib/cases';
import {resetFixtures,teardown,ORG_DEMO,PROVIDER,COORD_ID} from './fixtures';
import type {PhoneClient,PhoneCommand,PhoneCommandResult} from '../../packages/core/src/clients';

const model=new DeterministicModel(),CODE='012345',PHONE='+15155550142';
const opts={orgId:ORG_DEMO,providerId:PROVIDER};
function client():PhoneClient{return {id:randomUUID(),reference:'1234567890',profile:{name:'Synthetic household',phone:PHONE,language:'en',addressRaw:'123 Test Street, Des Moines 50309',addressZip:'50309',householdSize:4,dietaryAvoid:[],hasStove:true,hasFridge:true,availabilityRaw:'weekday mornings',contactPreference:'callback',accommodation:'none'},
  phone:PHONE,phoneVerifiedAt:new Date().toISOString(),version:1,consent:{enabled:false,channel:'none',at:new Date().toISOString()},mergedIntoId:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};}
async function setup(){
  process.env.NOURISH_CLIENT_PHONE_ENABLED='true';process.env.NOURISH_AGENT_API_TOKEN='test-only-phone-service-'+'a'.repeat(48);
  process.env.NOURISH_API_URL='http://127.0.0.1:1';await resetFixtures();
}
function fake(c=client()){
  const commands:PhoneCommand[]=[],codes:string[]=[],sends:string[]=[];
  const ports:PhonePorts={verification:{async start(phone,channel){sends.push(phone+':'+channel);return 'SIM-verification';},async check(_phone,code){codes.push(code);return code===CODE;}},
    async command(command){commands.push(command);
      if(command.kind==='resolve_client')return {target:{clientId:c.id,phone:c.phone!,reference:c.reference}};
      if(command.kind==='read_client')return {client:c};
      if(command.kind==='get_status')return {statuses:[{intakeId:'fixture-intake',caseNumber:'ML-fixture-001',status:'staff_review',scheduledFor:null,updatedAt:new Date().toISOString(),reviewHold:false}]};
      if(command.kind==='submit_request')return {client:{...c,id:command.clientId!,profile:command.profile!},intakeId:'fixture-intake',shoppingListId:1,matchedCount:1};
      return {};
    }};
  return {ports,commands,codes,sends,c};
}
async function turn(id:string,input:string|null,ports:PhonePorts,portModel:ModelPort=model){return processTurn(id,input,{...opts,phonePorts:ports},portModel);}
async function returning(id:string,operation:string,f:ReturnType<typeof fake>){
  for(const input of ['1','1',operation,'5155550142','1',CODE])await turn(id,input,f.ports);
}

test('phone: flag off preserves legacy voice intake',async()=>{
  await setup();process.env.NOURISH_CLIENT_PHONE_ENABLED='false';const s=await createSession({channel:'voice'});assert.equal(s.phone_state,null);await teardown();
});
test('phone: new household explicitly confirmed, durable queue isolated from legacy notifications',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'});
  const script=['1','1','1','2','Synthetic household','123 Test Street Des Moines 50309','4','1','1','weekday mornings','1','5155550142','none','1',CODE,'1'];
  for(const input of script)assert.equal((await turn(s.id,input,f.ports)).done,false);
  const before=await getSession(s.id);assert.equal(before?.step,'review');assert.match((await turn(s.id,'yes, but the address is wrong',f.ports)).reply,/Is all/);
  assert.equal((await db().query('SELECT count(*)::int n FROM assistance_cases')).rows[0].n,0);
  const result=await turn(s.id,'1',f.ports);assert.equal(result.done,true);assert.match(result.reply,/not a confirmed delivery/);
  assert.match(result.reply,/household reference/);
  const c=await getCase(result.caseId!);assert.equal(c?.nourish_managed,true);assert.equal(c?.status,'needs_review');
  const pending=await db().query(`SELECT payload FROM nourish_phone_jobs WHERE payload->>'kind'='submit_request'`);
  assert.equal(pending.rows.length,1);assert.equal(pending.rows[0].payload.profile.name,'Synthetic household');
  assert.equal(pending.rows[0].payload.profile.phone,PHONE);assert.equal(pending.rows[0].payload.consent.channel,'sms');
  assert.match(pending.rows[0].payload.reference,/^\d{10}$/);
  await db().query(`INSERT INTO outbox_jobs(id,job_key,case_id,kind,channel,payload) VALUES('legacy-job','legacy-job',$1,'approved_update','none','{}')`,[c!.id]);
  for(const job of await claimPhoneJobs(50))await processPhoneJob(job,{command:f.ports.command});
  assert.equal((await db().query(`SELECT status FROM outbox_jobs WHERE id='legacy-job'`)).rows[0].status,'pending');
  assert.equal((await getCase(c!.id))?.nourish_intake_id,'fixture-intake');
  assert.equal((await db().query('SELECT count(*)::int n FROM bookings')).rows[0].n,0);
  const approval=await approveDelivery({caseId:c!.id,optionId:'any',expectedVersion:c!.version,idempotencyKey:'phone-approval-1',staff:{id:COORD_ID,orgId:ORG_DEMO,role:'coordinator',name:'Fixture'},checks:{serviceAreaVerified:true,rulesVerified:true}});
  assert.deepEqual(approval,{ok:false,error:'review_in_nourish'});
  await assert.rejects(()=>recordOutcome(c!.id,'fulfilled',COORD_ID,ORG_DEMO));
  const saved=await getSessionTurns(s.id);assert.ok(saved.every(t=>t.input!==CODE));
  assert.ok(f.commands.filter(c=>c.kind==='submit_request').every(c=>c.call?.transcript.every(t=>t.input!==CODE)));
  await teardown();
});
test('phone: returning status reveals no profile before OTP and never sends OTP to the model',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'}),seen:string[]=[];
  const observing:ModelPort={name:'observed',async interpret(step,input,locale){seen.push(input);return model.interpret(step,input,locale);}};
  for(const input of ['1','1','2','5155550142'])await turn(s.id,input,f.ports,observing);
  assert.equal(f.commands.some(c=>c.kind==='read_client'),false);
  await turn(s.id,'1',f.ports,observing);assert.equal(phoneDigitCount((await getSession(s.id))!),6);
  const result=await turn(s.id,CODE,f.ports,observing);assert.match(result.reply,/awaiting staff review, not confirmed/);
  assert.ok(!seen.includes(CODE));assert.ok((await getSessionTurns(s.id)).every(t=>t.input!==CODE));await teardown();
});
test('phone: three incorrect entries lock the registered number and create a human follow-up',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'});
  for(const input of ['1','1','2','5155550142','1','999999','999999'])await turn(s.id,input,f.ports);
  const result=await turn(s.id,'999999',f.ports);assert.equal(result.handoff?.mode,'transfer');
  const v=await verificationRow(result.session.phone_state!.verificationId!);assert.equal(v?.failed_entries,3);assert.ok(v?.locked_until);
  assert.ok((await db().query(`SELECT id FROM nourish_phone_jobs WHERE payload->>'kind'='request_human'`)).rows.length);
  await assert.rejects(()=>inTransaction(()=>beginVerification(PHONE,f.c.id,s.id,'sms','en',f.ports.verification)),/verification_locked/);await teardown();
});
test('phone: shared contacts require client reference, and lost-phone access gets no private data',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'});
  f.ports.command=async c=>c.kind==='resolve_client'?{referenceRequired:true}:{};
  for(const input of ['1','1','2','5155550142'])await turn(s.id,input,f.ports);
  assert.equal((await getSession(s.id))?.phone_state?.phase,'reference');assert.equal(f.sends.length,0);
  const handoff=await turn(s.id,'person',f.ports);assert.equal(handoff.handoff?.mode,'transfer');await teardown();
});
test('phone: profile corrections are scoped; expired verification preserves patch and expected version',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'});await returning(s.id,'3',f);
  await turn(s.id,'1',f.ports);await turn(s.id,'999 Corrected Street Des Moines 50309',f.ports);
  const current=(await getSession(s.id))!;assert.equal(current.phone_state?.phase,'update_review');
  const patch=current.phone_state!.patch,expired=issueCallerGrant(f.c.id,s.id,PHONE,new Date(Date.now()-660000).toISOString());
  await db().query(`UPDATE conversation_sessions SET phone_state=jsonb_set(phone_state,'{grant}',$2::jsonb) WHERE id=$1`,[s.id,JSON.stringify(expired)]);
  await turn(s.id,'1',f.ports);await db().query(`UPDATE nourish_phone_verifications SET last_sent_at=now()-interval '2 minutes'`);
  await turn(s.id,'1',f.ports);await turn(s.id,CODE,f.ports);
  assert.deepEqual((await getSession(s.id))?.phone_state?.patch,patch);assert.equal((await getSession(s.id))?.phone_state?.version,1);
  await turn(s.id,'1',f.ports);
  const outgoing=(await db().query(`SELECT payload FROM nourish_phone_jobs WHERE payload->>'kind'='update_client'`)).rows[0].payload;
  assert.equal(outgoing.expectedVersion,1);assert.ok(!Object.hasOwn(outgoing.profile,'householdSize'));assert.ok(!Object.hasOwn(outgoing.profile,'dietaryAvoid'));await teardown();
});
test('phone: cancellation and missed delivery only submit confirmed staff-review commands',async()=>{
  for(const [menu,kind] of [['4','request_change'],['5','report_missed_delivery']]){
    await setup();const f=fake(),s=await createSession({channel:'voice'});await returning(s.id,menu,f);
    await turn(s.id,'Please cancel this delivery',f.ports);
    assert.equal((await db().query(`SELECT count(*)::int n FROM nourish_phone_jobs WHERE payload->>'kind'=$1`,[kind])).rows[0].n,0);
    await turn(s.id,'1',f.ports);const command=(await db().query(`SELECT payload FROM nourish_phone_jobs WHERE payload->>'kind'=$1`,[kind])).rows[0].payload;
    assert.equal(command.intakeId,'fixture-intake');assert.equal(command.changeType,'cancellation');assert.ok(command.confirmedAt);await teardown();
  }
});
test('phone: landline enrollment waits for call-end then resumes its saved draft only after verification',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'});
  for(const input of ['1','1','1','2','Synthetic household','123 Test Street Des Moines 50309','4','1','1','weekday mornings','1','5155550142','none','2'])await turn(s.id,input,f.ports);
  assert.equal((await getSession(s.id))?.phone_state?.phase,'callback_wait');assert.equal(f.sends.length,0);
  const first=(await claimPhoneJobs(50)).find(j=>j.kind==='verify_callback')!;await processPhoneJob(first,{verification:f.ports.verification});assert.equal(f.sends.length,0);
  await db().query(`UPDATE conversation_sessions SET phone_state=jsonb_set(phone_state,'{callEndedAt}',to_jsonb(now()::text)) WHERE id=$1`,[s.id]);
  await db().query(`UPDATE nourish_phone_jobs SET due_at=now() WHERE id=$1`,[first.id]);
  const second=(await claimPhoneJobs(50)).find(j=>j.id===first.id)!;await processPhoneJob(second,{verification:f.ports.verification});assert.equal(f.sends.length,1);
  const previousCommand=f.ports.command!;f.ports.command=async c=>c.kind==='resolve_client'?{}:previousCommand(c);
  const returningCall=await createSession({channel:'voice'});
  for(const input of ['1','1','1','1','5155550142'])await turn(returningCall.id,input,f.ports);
  const before=(await getSession(returningCall.id))!;assert.equal(before.phone_state?.phase,'verify');assert.equal(before.draft_fields.contactName,undefined);
  await turn(returningCall.id,CODE,f.ports);const resumed=(await getSession(returningCall.id))!;
  assert.equal(resumed.draft_fields.contactName,'Synthetic household');assert.equal(resumed.phone_state?.phase,'notify');assert.equal(resumed.step,'review');await teardown();
});
test('phone: interrupted drafts persist without becoming food requests',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'});for(const input of ['1','1','1','2','Example Name','123 Test Street'])await turn(s.id,input,f.ports);
  await abandonSession(s.id);assert.equal((await getSession(s.id))?.status,'abandoned');
  assert.equal((await db().query('SELECT count(*)::int n FROM assistance_cases')).rows[0].n,0);
  const latest=(await db().query(`SELECT payload FROM nourish_phone_jobs WHERE payload->'call'->>'status'='abandoned'`)).rows[0].payload;
  assert.equal(latest.call.profile.name,'Example Name');await teardown();
});
test('phone: replacement landline requires fresh registered-phone access and the new-phone code',async()=>{
  await setup();const f=fake(),first=await createSession({channel:'voice'});await returning(first.id,'3',f);
  await turn(first.id,'6',f.ports);await turn(first.id,'5155550177',f.ports);await turn(first.id,'2',f.ports);
  assert.equal((await getSession(first.id))?.phone_state?.phase,'callback_wait');
  await db().query(`UPDATE conversation_sessions SET phone_state=jsonb_set(phone_state,'{callEndedAt}',to_jsonb(now()::text)) WHERE id=$1`,[first.id]);
  for(const job of await claimPhoneJobs(50))if(job.kind==='verify_callback')await processPhoneJob(job,{verification:f.ports.verification});
  const returningCall=await createSession({channel:'voice'});
  for(const input of ['1','1','3','5155550142'])await turn(returningCall.id,input,f.ports);
  assert.equal((await getSession(returningCall.id))?.phone_state?.phase,'verify_channel');
  await db().query(`UPDATE nourish_phone_verifications SET last_sent_at=now()-interval '2 minutes' WHERE phone=$1`,[PHONE]);
  await turn(returningCall.id,'1',f.ports);const before=await turn(returningCall.id,CODE,f.ports);
  assert.match(before.reply,/new phone/);assert.equal(before.session.phone_state?.phase,'verify');
  assert.equal(before.session.phone_state?.grant?.phone,PHONE);assert.equal(before.session.phone_state?.patch?.phone,'+15155550177');
  await turn(returningCall.id,CODE,f.ports);const reviewed=(await getSession(returningCall.id))!;
  assert.equal(reviewed.phone_state?.phase,'update_review');assert.equal(reviewed.phone_state?.grant?.phone,PHONE);
  assert.equal(reviewed.phone_state?.newPhoneGrant?.phone,'+15155550177');
  await turn(returningCall.id,'1',f.ports);
  const outgoing=(await db().query(`SELECT payload FROM nourish_phone_jobs WHERE payload->>'kind'='update_client'`)).rows[0].payload;
  assert.equal(outgoing.grant.callId,returningCall.id);assert.equal(outgoing.newPhoneGrant.callId,returningCall.id);assert.equal(outgoing.expectedVersion,1);
  assert.equal(outgoing.profile.phone,'+15155550177');await teardown();
});
test('phone: stale six-digit entries never reach the model after verification',async()=>{
  await setup();const f=fake(),s=await createSession({channel:'voice'});await returning(s.id,'3',f);await turn(s.id,'1',f.ports);
  const observing:ModelPort={name:'must-not-see-code',async interpret(){throw new Error('Code reached model');}};
  const result=await turn(s.id,CODE,f.ports,observing);assert.equal(result.session.phone_state?.phase,'intake');
  assert.ok((await getSessionTurns(s.id)).every(t=>t.input!==CODE));await teardown();
});
test('phone: a verified returning household can explicitly resume an interrupted correction without overwriting a newer version',async()=>{
  await setup();const f=fake(),first=await createSession({channel:'voice'});await returning(first.id,'3',f);
  await turn(first.id,'1',f.ports);await turn(first.id,'999 Saved Street Des Moines 50309',f.ports);await abandonSession(first.id);
  f.c.version=2;const next=await createSession({channel:'voice'});
  await db().query(`UPDATE nourish_phone_verifications SET last_sent_at=now()-interval '2 minutes'`);
  await returning(next.id,'3',f);let current=(await getSession(next.id))!;
  assert.equal(current.phone_state?.phase,'resume_review');assert.equal(current.draft_fields.address?.raw,f.c.profile.addressRaw);
  await turn(next.id,'1',f.ports);current=(await getSession(next.id))!;
  assert.equal(current.phone_state?.phase,'update_review');assert.match(current.phone_state?.patch?.addressRaw??'',/Saved Street/);assert.equal(current.phone_state?.version,1);
  await turn(next.id,'1',f.ports);
  const outgoing=(await db().query(`SELECT payload FROM nourish_phone_jobs WHERE payload->>'kind'='update_client'`)).rows[0].payload;
  assert.equal(outgoing.expectedVersion,1);assert.equal(outgoing.grant.callId,next.id);assert.equal(outgoing.grant.phone,PHONE);await teardown();
});
test('phone: event cursor deduplicates, opt-out suppresses sends, and voicemail stays generic',async()=>{
  await setup();const c=client(),event={id:1,eventId:randomUUID(),clientId:c.id,intakeId:'fixture-intake',kind:'delivery.assigned',createdAt:new Date().toISOString()};
  const status={intakeId:'fixture-intake',caseNumber:'ML-fixture-001',status:'scheduled' as const,scheduledFor:new Date().toISOString(),updatedAt:new Date().toISOString(),reviewHold:false};
  const events=async()=>({cursor:1,reset:false,events:[event]});
  await collectPhoneEvents({events});await collectPhoneEvents({events});assert.equal((await db().query('SELECT count(*)::int n FROM nourish_phone_jobs')).rows[0].n,1);
  let sent='';const notifications={async send(_phone:string,_channel:'sms'|'voice_callback',message:string){sent=message;return 'SIM-send';}};
  const context=(enabled:boolean):PhoneCommandResult=>({notification:{phone:PHONE,language:'en',consent:{enabled,channel:'voice_callback',at:new Date(Date.now()-10000).toISOString()},statuses:[status]}});
  await processPhoneJob((await claimPhoneJobs())[0],{command:async()=>context(false),notifications});assert.equal(sent,'');
  await db().query(`UPDATE nourish_phone_jobs SET status='pending'`);
  await processPhoneJob((await claimPhoneJobs())[0],{command:async()=>context(true),notifications});assert.match(sent,/call our main number/i);assert.ok(!sent.includes(status.caseNumber));assert.ok(!sent.includes('Test Street'));await teardown();
});
test('phone: retries keep immutable command ID; uncertain sends and conflicts need manual review',async()=>{
  await setup();const id=randomUUID();await queuePhoneCommand({id,callId:'fixture-call',kind:'save_draft'});
  let job=(await claimPhoneJobs())[0];await processPhoneJob(job,{command:async()=>{throw new Error('nourish_phone_unavailable');}});
  assert.equal((await db().query('SELECT status FROM nourish_phone_jobs')).rows[0].status,'pending');
  await db().query('UPDATE nourish_phone_jobs SET due_at=now()');job=(await claimPhoneJobs())[0];assert.equal(job.id,id);
  await processPhoneJob(job,{command:async c=>{assert.equal(c.id,id);return {queuedForReview:true};}});
  assert.equal((await db().query('SELECT status FROM nourish_phone_jobs')).rows[0].status,'review');await assert.rejects(()=>retryPhoneJob(id));await teardown();
});
test('phone: age-based text retention does not erase essential household drafts',async()=>{
  await setup();const s=await createSession({channel:'voice'});const payload={id:randomUUID(),callId:s.id,kind:'save_draft' as const,call:{id:s.id,language:'en' as const,status:'draft' as const,summary:'Saved draft',profile:{name:'Essential Name'},transcript:[{step:'address',input:'Raw text',reply:'Next question',at:new Date().toISOString()}]}};
  await queuePhoneCommand(payload,s.id);await db().query(`UPDATE nourish_phone_jobs SET created_at=now()-interval '31 days'`);await db().query(`UPDATE conversation_sessions SET created_at=now()-interval '31 days'`);
  await purgePhoneText();const saved=(await db().query('SELECT payload,status,last_error FROM nourish_phone_jobs')).rows[0];
  assert.deepEqual(saved.payload.call.transcript,[]);assert.equal(saved.payload.call.profile.name,'Essential Name');assert.equal(saved.status,'review');await assert.rejects(()=>retryPhoneJob(payload.id));await teardown();
});
