/** Real MealLine HTTP + SQLite checks, called only inside the disposable integration fixture. */
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';

export async function verifyClientPhone({request,client,secret,volunteer,email}) {
  const header={'x-nourish-agent-token':secret},id=randomUUID(),callId=randomUUID();
  const confirmedAt=new Date().toISOString();
  function grant(clientId=id,phone='+15155550142',at=confirmedAt){
    const claims={clientId,callId,phone,verifiedAt:at,expiresAt:new Date(Date.parse(at)+600000).toISOString()};
    return {...claims,signature:createHmac('sha256',secret).update(JSON.stringify(claims)).digest('base64url')};
  }
  const base={callId,clientId:id,grant:grant()};
  const machine=async(body,status=200,headers=header)=>(await request('/api/voice-agent/commands',body,status,'POST',headers)).data;
  const profile={name:'Synthetic phone household',phone:'+15155550142',language:'es',addressRaw:'123 Fixture Street',householdSize:2,dietaryAvoid:[],hasStove:true,hasFridge:true};
  await machine({...base,id:randomUUID(),kind:'read_client'},401,{});
  await machine({...base,id:randomUUID(),kind:'read_client'},503);
  process.env.NOURISH_CLIENT_PHONE_ENABLED='true';
  try {
    await request('/feed/api/nourish/food-items',{name:'Fixture Cold Milk',quantity:5,unit:'carton',requiresFridge:true},201);
    const command={...base,id:randomUUID(),kind:'submit_request',profile,caseNumber:'PHONE-FIXTURE-1',confirmedAt,
      consent:{enabled:true,channel:'sms',at:confirmedAt},call:{id:callId,language:'es',status:'confirmed',profile,summary:'Explicitly confirmed, staff review only.',observedAt:confirmedAt,
        transcript:[{step:'verify',input:'synthetic-code',reply:'Verify.',at:confirmedAt},{step:'review',input:'1',reply:'Staff review.',at:confirmedAt}]}};
    await machine({...command,confirmedAt:undefined},400);
    const submitted=await machine(command),intakeId=submitted.intakeId,basketId=submitted.shoppingListId;
    assert.ok(submitted.client.reference.match(/^\d{10}$/));assert.equal(submitted.client.version,1);
    assert.equal((await client.nourishBasket.findUnique({where:{id:basketId}})).status,'draft');
    assert.deepEqual((await client.nourishPhoneCall.findUnique({where:{id:callId}})).transcript.map(t=>t.step),['review']);
    const repeated=await machine(command);assert.equal(repeated.intakeId,intakeId);assert.equal(repeated.shoppingListId,basketId);
    await machine({...command,profile:{...profile,householdSize:3}},409);
    const secondId=await machine({...command,id:randomUUID(),expectedVersion:1});assert.equal(secondId.intakeId,intakeId);
    assert.equal(await client.nourishDeliveryEvent.count({where:{intakeId,kind:'request.received'}}),1);
    await machine({...base,id:randomUUID(),kind:'read_client',grant:undefined},401);
    await machine({...base,id:randomUUID(),kind:'read_client',grant:grant(id,profile.phone,new Date(Date.now()-660000).toISOString())},401);
    await machine({...base,id:randomUUID(),kind:'read_client',grant:{...grant(),signature:'forged'}},401);
    let analytics=(await request('/feed/api/nourish/client-analytics?preset=all')).data.analytics;
    assert.equal(analytics.requests,1);assert.equal(analytics.servedHouseholds,0);assert.equal(analytics.registeredHouseholds,1);
    assert.deepEqual(analytics.postalCodes,[{label:'Unknown',count:1}]);
    await request(`/feed/api/nourish/baskets/${basketId}`,{status:'approved'},200,'PUT');
    let status=(await machine({...base,id:randomUUID(),kind:'get_status'})).statuses[0];assert.equal(status.status,'approved');
    await request(`/feed/api/nourish/baskets/${basketId}`,{status:'packed'},200,'PUT');
    const delivery=await client.nourishDelivery.findFirst({where:{intakeId}});
    await request(`/feed/api/nourish/deliveries/${delivery.id}`,{assignedTo:volunteer.id,status:'assigned',scheduledFor:new Date(Date.now()+86400000).toISOString()},200,'PUT');
    status=(await machine({...base,id:randomUUID(),kind:'get_status'})).statuses[0];assert.equal(status.status,'scheduled');
    analytics=(await request('/feed/api/nourish/client-analytics?preset=all')).data.analytics;assert.equal(analytics.servedHouseholds,0);
    const updated=await machine({...base,id:randomUUID(),kind:'update_client',expectedVersion:1,profile:{dietaryAvoid:['dairy'],hasFridge:false},confirmedAt});
    assert.equal(updated.client.version,2);assert.equal((await client.nourishIntake.findUnique({where:{id:intakeId}})).reviewHold,true);
    assert.equal((await client.nourishBasket.findUnique({where:{id:basketId}})).status,'packed');
    await request(`/feed/api/nourish/deliveries/${delivery.id}`,{status:'in_transit'},400,'PUT');
    const safety=await client.nourishChangeRequest.findFirst({where:{intakeId,kind:'safety_review',status:'pending'}});
    await request(`/feed/api/nourish/change-requests/${safety.id}`,{decision:'approved',notes:'Fixture safety check',releaseHold:true},400,'PATCH');
    await request(`/feed/api/nourish/change-requests/${safety.id}`,{decision:'approved',notes:'Fixture safety check',profile:{dietaryAvoid:['dairy'],hasFridge:false},releaseHold:true},400,'PATCH');
    const milk=await client.foodItem.findFirst({where:{name:'Fixture Cold Milk'}}),milkBefore=milk.quantity;
    await request(`/feed/api/nourish/intakes/${intakeId}/rebuild-basket`,{notes:'Fixture physical stock checked',stockReconciled:false},400);
    const rebuilt=(await request(`/feed/api/nourish/intakes/${intakeId}/rebuild-basket`,{notes:'Fixture physical stock checked; no stock refund requested',stockReconciled:true})).data;
    assert.notEqual(rebuilt.basketId,basketId);assert.equal((await client.foodItem.findUnique({where:{id:milk.id}})).quantity,milkBefore);
    assert.equal((await client.nourishBasket.findUnique({where:{id:basketId}})).status,'packed');
    await request(`/feed/api/nourish/baskets/${basketId}`,{status:'packed'},400,'PUT');
    await request(`/feed/api/nourish/change-requests/${safety.id}`,{decision:'approved',notes:'Reviewed compatible replacement basket',profile:{dietaryAvoid:['dairy'],hasFridge:false},releaseHold:true},200,'PATCH');
    assert.equal((await client.nourishIntake.findUnique({where:{id:intakeId}})).reviewHold,false);
    const conflict=await machine({...base,id:randomUUID(),kind:'update_client',expectedVersion:1,profile:{addressRaw:'Must not overwrite current address'},confirmedAt});
    assert.equal(conflict.queuedForReview,true);assert.equal((await client.nourishClient.findUnique({where:{id}})).profile.addressRaw,profile.addressRaw);
    const nextClient=(await request('/feed/api/nourish/clients',{name:'Second synthetic household',phone:profile.phone},201)).data.client;
    const resolved=await machine({callId,id:randomUUID(),kind:'resolve_client',phone:profile.phone});assert.equal(resolved.referenceRequired,true);assert.equal(resolved.target,undefined);
    const reference=await machine({callId,id:randomUUID(),kind:'resolve_client',reference:submitted.client.reference});assert.equal(reference.target.clientId,id);
    await machine({...command,id:randomUUID(),clientId:nextClient.id,grant:grant(nextClient.id)},409);
    await machine({...base,id:randomUUID(),kind:'request_change',intakeId:'other-household-intake',reason:'Synthetic change',confirmedAt},404);
    const cancelled=await machine({...base,id:randomUUID(),kind:'request_change',intakeId,changeType:'cancellation',reason:'Please cancel',confirmedAt});
    assert.equal((await client.nourishIntake.findUnique({where:{id:intakeId}})).status,'assigned');
    await request(`/feed/api/nourish/baskets/${rebuilt.basketId}`,{status:'approved'},200,'PUT');
    await request(`/feed/api/nourish/baskets/${rebuilt.basketId}`,{status:'packed'},200,'PUT');
    await request(`/feed/api/nourish/deliveries/${delivery.id}`,{status:'in_transit'},200,'PUT');
    await request(`/feed/api/nourish/change-requests/${cancelled.changeId}`,{decision:'approved',notes:'Too late to cancel'},400,'PATCH');
    await request(`/feed/api/nourish/deliveries/${delivery.id}`,{status:'delivered'},200,'PUT');
    await request(`/feed/api/nourish/deliveries/${delivery.id}`,{status:'delivered'},200,'PUT');
    analytics=(await request('/feed/api/nourish/client-analytics?preset=all')).data.analytics;
    assert.equal(analytics.servedHouseholds,1);assert.equal(analytics.completedDeliveries,1);assert.equal(analytics.requests,1);
    const copy={...command.call,id:randomUUID(),status:'draft',observedAt:new Date(Date.now()-31*86400000).toISOString()};
    await machine({id:randomUUID(),callId:copy.id,kind:'save_draft',call:copy});
    assert.deepEqual((await client.nourishPhoneCall.findUnique({where:{id:copy.id}})).transcript,[]);
    const {SanitizedBackupService}=await import('../vendor/feed/packages/backend/dist/services/backup/sanitized-backup.js');
    const backup=await SanitizedBackupService.create(email);
    assert.equal(backup.manifest.tableContractVersion,14);assert.ok(backup.data.NourishClient.length===2);
    assert.ok(backup.data.NourishClient.every(c=>!Object.hasOwn(c,'phoneVerifiedAt')));assert.equal(backup.data.NourishAgentReceipt,undefined);
    await request(`/feed/api/nourish/clients/${nextClient.id}/merge`,{targetId:id,expectedVersion:nextClient.version});
    const merged=(await request('/feed/api/nourish/client-analytics?preset=all')).data.analytics;assert.equal(merged.registeredHouseholds,1);
    const {readArtifact}=await import('../vendor/feed/packages/backend/dist/services/restore/artifact-reader.js');
    const artifact=readArtifact(Buffer.from(JSON.stringify(backup)));assert.equal(artifact.ok,true);
    const {RestoreService,RESTART_EXIT_CODE}=await import('../vendor/feed/packages/backend/dist/services/restore/restore-service.js');
    const {MaintenanceMode}=await import('../vendor/feed/packages/backend/dist/services/restore/maintenance-mode.js');
    await client.$disconnect();let onExit;
    const exitDone=new Promise(resolve=>{onExit=resolve;});
    const restored=await RestoreService.run({data:backup.data,units:artifact.summary.availableUnits,actor:email,reason:'Disposable client-phone recovery verification',exit:code=>{onExit(code);}});
    assert.equal(restored.swapped,true);assert.equal(await exitDone,RESTART_EXIT_CODE);MaintenanceMode.exit();
    assert.deepEqual(await client.$queryRawUnsafe('PRAGMA foreign_key_check;'),[]);
    assert.equal(await client.nourishClient.count(),2);assert.equal((await client.nourishClient.findUnique({where:{id}})).phoneVerifiedAt,null);
    assert.equal(await client.nourishAgentReceipt.count(),0);assert.equal((await client.nourishDelivery.findUnique({where:{id:delivery.id}})).status,'delivered');
    // Restored contact data is not restored authorization: a fresh signed OTP
    // attestation is needed before private records can be opened again.
    await machine({...base,id:randomUUID(),kind:'read_client'},401);
    const fresh=await machine({...base,id:randomUUID(),kind:'read_client',grant:grant(id,profile.phone,new Date().toISOString())});assert.ok(fresh.client.phoneVerifiedAt);
    console.log('✓ Client phone HTTP/SQLite checks: scoped verification, explicit confirmation, durable dedupe, shared phones, safety holds/repacking, genuine served counts, retention, merge and real backup/restore.');
  } finally {process.env.NOURISH_CLIENT_PHONE_ENABLED='false';}
}
