/** Full controller -> PostgreSQL outbox -> real MealLine HTTP/SQLite -> events.
 * Uses only an isolated PG schema, a new temporary SQLite file, and fake sends.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import type {Server} from 'node:http';
import {createSession,processTurn,getSession,getSessionTurns} from '../lib/controller';
import {DeterministicModel} from '../lib/model';
import {phoneCommand} from '../lib/nourishPhone';
import {claimPhoneJobs,processPhoneJob,collectPhoneEvents} from '../lib/phoneJobs';
import {db} from '../lib/db';
import {getCase} from '../lib/cases';
import {resetFixtures,teardown,ORG_DEMO,PROVIDER} from './fixtures';
import type {PhonePorts} from '../lib/phoneFlow';

test('phone HTTP: real cross-database request, staff fulfilment, current status and consent-driven events',async()=>{
  await resetFixtures();
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const folder=await mkdtemp(path.join(tmpdir(),'nourish-phone-http-'));
  let server:Server|undefined,prisma:any;
  const originalEnv={...process.env};
  try {
    Object.assign(process.env,{DATABASE_URL:'file:'+path.join(folder,'phone.db'),STORAGE_PATH:path.join(folder,'storage'),
      NOURISH_CLIENT_PHONE_ENABLED:'true',NOURISH_AGENT_API_TOKEN:randomBytes(32).toString('hex'),
      NOURISH_VOICE_API_TOKEN:'test-only-ingestion-key',JWT_SECRET:randomBytes(32).toString('hex'),FORCE_AUTH:'true',NOURISH_DEV_LOGIN:'false',
      AUTH_USERNAME:'',AUTH_PASSWORD:'',RESEND_API_KEY:'',EMAIL_FROM:'',NOURISH_API_URL:'',
      TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_FROM_NUMBER:'',TWILIO_VERIFY_SERVICE_SID:''});
    await new Promise<void>((resolve,reject)=>{
      const child=spawn(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--schema',
        path.join(root,'vendor/feed/packages/backend/prisma/schema.prisma')],{env:process.env,stdio:'pipe'});
      child.stdout.resume();child.stderr.resume();child.on('error',reject);
      child.on('exit',code=>code===0?resolve():reject(new Error('Temporary phone fixture migration failed.')));
    });
    const backendUrl=new URL('../../vendor/feed/packages/backend/dist/',import.meta.url);
    const load=(name:string)=>import(new URL(name,backendUrl).href);
    const database=await load('db.js');prisma=database.default.default??database.default;
    const {createNourishServer}=await load('nourish-server.js');
    server=await new Promise<Server>(resolve=>{const started=createNourishServer().listen(0,'127.0.0.1',()=>resolve(started));});
    const address=server.address();assert.ok(address&&typeof address!=='string');process.env.NOURISH_API_URL=`http://127.0.0.1:${address.port}`;
    const category=await prisma.category.create({data:{name:'Synthetic phone pantry',nameSearch:'synthetic phone pantry',limit:100,limitType:'household'}});
    const food=await prisma.foodItem.create({data:{name:'Synthetic canned beans',nameSearch:'synthetic canned beans',categoryId:category.id,quantity:20,unit:'can',isInStock:true,vegan:true,vegetarian:true,glutenFree:true,limit:100,limitType:'household'}});
    const model=new DeterministicModel(),code='012345',ports:PhonePorts={verification:{async start(){return 'SIM-verify';},async check(_phone,input){return input===code;}}};
    const turn=(id:string,input:string)=>processTurn(id,input,{orgId:ORG_DEMO,providerId:PROVIDER,phonePorts:ports},model);
    const session=await createSession({channel:'voice'});
    for(const input of ['1','1','1','2','Synthetic phone household','123 Test Street Des Moines 50309','4','1','1','weekday mornings','1','5155550142','none','1',code,'1'])await turn(session.id,input);
    assert.equal(await prisma.nourishIntake.count(),0,'A draft is not a request.');
    assert.equal((await turn(session.id,'1')).done,true);
    const outgoing=(await db().query(`SELECT payload FROM nourish_phone_jobs WHERE payload->>'kind'='submit_request'`)).rows[0].payload;
    for(const job of await claimPhoneJobs(50))if(job.kind==='sync')await processPhoneJob(job);
    const saved=(await getSession(session.id))!,c=await getCase(saved.case_id!);
    assert.ok(c?.nourish_intake_id);assert.ok(c?.nourish_client_id);assert.equal(c?.nourish_managed,true);
    assert.equal(await prisma.nourishClient.count(),1);assert.equal(await prisma.nourishIntake.count(),1);assert.equal(await prisma.nourishBasket.count(),1);
    assert.equal((await prisma.nourishClient.findUnique({where:{id:c!.nourish_client_id}})).reference,outgoing.reference);
    assert.equal((await db().query('SELECT count(*)::int n FROM bookings')).rows[0].n,0);
    assert.equal((await db().query('SELECT count(*)::int n FROM outbox_jobs')).rows[0].n,0);
    const replay=await phoneCommand(outgoing);assert.equal(replay.intakeId,c!.nourish_intake_id);assert.equal(await prisma.nourishIntake.count(),1);
    assert.ok((await getSessionTurns(session.id)).every(row=>row.input!==code));
    const call=await prisma.nourishPhoneCall.findUnique({where:{id:session.id}});assert.ok(call.transcript.every((row:any)=>row.input!==code));
    const operations=await load('services/nourish/index.js'),clients=await load('services/nourish/clients.js');
    const intake=await prisma.nourishIntake.findUnique({where:{id:c!.nourish_intake_id}}),basket=await prisma.nourishBasket.findFirst({where:{intakeId:intake.id}});
    let counts=await clients.clientAnalytics({preset:'all'});assert.equal(counts.requests,1);assert.equal(counts.servedHouseholds,0);
    await operations.updateBasket(basket.id,{status:'approved'});await operations.updateBasket(basket.id,{status:'packed'});
    assert.equal((await prisma.foodItem.findUnique({where:{id:food.id}})).quantity,18);
    assert.equal((await clients.clientAnalytics({preset:'all'})).servedHouseholds,0);
    const volunteer=await prisma.nourishVolunteer.create({data:{id:randomUUID(),name:'Synthetic volunteer',email:'phone-volunteer@example.invalid'}});
    const delivery=await prisma.nourishDelivery.findFirst({where:{intakeId:intake.id}});
    await operations.updateDelivery(delivery.id,{assignedTo:volunteer.id,status:'assigned',scheduledFor:new Date(Date.now()+86400000).toISOString()});
    const returning=await createSession({channel:'voice'});
    for(const input of ['1','1','2','5155550142'])await turn(returning.id,input);
    assert.equal((await getSession(returning.id))?.draft_fields.contactName,undefined,'No profile before fresh OTP.');
    await db().query(`UPDATE nourish_phone_verifications SET last_sent_at=now()-interval '2 minutes'`);
    await turn(returning.id,'1');const status=await turn(returning.id,code);assert.match(status.reply,/scheduled/);assert.ok(!status.reply.includes('staff review, not confirmed'));
    await operations.updateDelivery(delivery.id,{status:'in_transit'});await operations.updateDelivery(delivery.id,{status:'delivered'});
    await collectPhoneEvents();await collectPhoneEvents();const messages:string[]=[];
    const notifications={async send(_phone:string,_channel:'sms'|'voice_callback',message:string){messages.push(message);return 'SIM-notification';}};
    for(const job of await claimPhoneJobs(50))await processPhoneJob(job,{notifications});
    assert.equal(messages.length,1,'Backlog coalesces to the latest status.');assert.match(messages[0],/delivered/);assert.ok(!messages[0].includes('Test Street'));
    counts=await clients.clientAnalytics({preset:'all'});assert.equal(counts.servedHouseholds,1);assert.equal(counts.completedDeliveries,1);
    await prisma.nourishClient.update({where:{id:c!.nourish_client_id},data:{consent:{enabled:false,channel:'none',at:new Date().toISOString()}}});
    await prisma.nourishDeliveryEvent.create({data:{eventId:randomUUID(),clientId:c!.nourish_client_id,intakeId:intake.id,kind:'fixture.optout'}});
    await collectPhoneEvents();for(const job of await claimPhoneJobs(50))await processPhoneJob(job,{notifications});assert.equal(messages.length,1);
    // Imported records remain a different source; never infer a merge.
    assert.equal(await prisma.serviceClient.count(),0);
  } finally {
    if(server)await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));
    await prisma?.$disconnect();await teardown();
    for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];Object.assign(process.env,originalEnv);
    await rm(folder,{recursive:true,force:true});
  }
});
