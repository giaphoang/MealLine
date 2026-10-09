import { useState,type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { User,Plus } from '@/components/ui/icons';
import { SectionHeader } from '@/components/shared/section-header';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import { SortableHeader } from '@/components/ui/sortable-header';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/formatting/date';
import { nourishService,type PhoneClient,type ClientProfile,type ClientChange,type StoredPhoneCall,type NotificationConsent } from '@/services/nourish';
import { Field,selectClass,Status,QueryFailure,useNourishQuery,useNourishMutation } from './shared';

function ProfileFacts({profile}:{profile:ClientProfile}) {
  return <dl className="grid gap-3 sm:grid-cols-2">{Object.entries(profile).map(([key,value])=><div key={key}>
    <dt className="text-sm text-muted-foreground">{key.replace(/([A-Z])/g,' $1')}</dt><dd className="break-words whitespace-pre-wrap">{value===null || value===undefined || value===''?'Not recorded':Array.isArray(value)?value.join(', ') || 'None':typeof value==='boolean'?value?'Yes':'No':String(value)}</dd>
  </div>)}</dl>;
}
function Transcript({call}:{call:StoredPhoneCall}) {
  return <div className="space-y-3"><p>{call.summary}</p><ProfileFacts profile={call.profile}/>
    <p className="text-sm text-muted-foreground">Text only, retained for 30 days. Verification entries excluded. No call recording.</p>
    {call.transcript.map((turn,i)=><div key={i} className="rounded border p-3 text-sm"><p>{turn.step} · {formatDateTime(turn.at)}</p>
      <p className="whitespace-pre-wrap">Caller: {turn.input ?? '—'}</p><p className="whitespace-pre-wrap">Assistant: {turn.reply}</p></div>)}
    {!call.transcript.length && <p className="text-sm text-muted-foreground">No retained transcript.</p>}
  </div>;
}
function ProfileForm({client,close}:{client?:PhoneClient;close:()=>void}) {
  const p=client?.profile ?? {};
  const mutation=useNourishMutation((data:{profile:ClientProfile;consent?:NotificationConsent})=>client
    ? nourishService.updateClient(client.id,{expectedVersion:client.version,...data}) : nourishService.createClient(data.profile),'Client profile saved. Current deliveries still require staff review.');
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const f=new FormData(event.currentTarget),value=(key:string)=>String(f.get(key) ?? '').trim(),text=(key:string)=>value(key)||null;
    const bool=(key:string)=>value(key)==='unknown'?null:value(key)==='yes';
    const profile:ClientProfile={name:text('name'),phone:text('phone'),addressRaw:text('address'),addressStreet:text('street'),addressCity:text('city'),addressZip:text('zip'),
      householdSize:value('size')?Number(value('size')):null,language:value('language')==='unknown'?null:value('language') as ClientProfile['language'],dietaryAvoid:value('avoid').split(',').map(v=>v.trim()).filter(Boolean),
      dietaryNotes:text('dietary'),hasStove:bool('stove'),hasFridge:bool('fridge'),availabilityRaw:text('availability'),accommodation:text('accommodation'),
      contactPreference:value('contact')==='unknown'?null:value('contact') as ClientProfile['contactPreference']};
    const channel=value('notifications') as NotificationConsent['channel'];
    const consent=client && channel!==client.consent.channel ? {enabled:channel!=='none',channel,at:new Date().toISOString()} : undefined;
    mutation.mutate({profile,consent},{onSuccess:close});
  };
  return <form className="space-y-4" onSubmit={submit}>
    <p className="text-sm text-muted-foreground">Essential household information only. Shared phones do not prove that two records are the same household. Changing a phone clears its verified status.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="client-name" label="Contact name"><Input id="client-name" name="name" required maxLength={200} defaultValue={p.name ?? ''}/></Field>
      <Field id="client-phone" label="Contact phone"><Input id="client-phone" name="phone" type="tel" defaultValue={p.phone ?? ''}/></Field>
      <Field id="client-size" label="Household size"><Input id="client-size" name="size" type="number" min={1} max={100} defaultValue={p.householdSize ?? ''}/></Field>
      <Field id="client-language" label="Preferred call language (not household demographics)"><select id="client-language" name="language" className={selectClass} defaultValue={p.language ?? 'unknown'}><option value="unknown">Not recorded</option><option value="en">English</option><option value="es">Español</option><option value="vi">Tiếng Việt</option></select></Field>
    </div>
    <Field id="client-address" label="Delivery address"><Textarea id="client-address" name="address" maxLength={2000} defaultValue={p.addressRaw ?? ''}/></Field>
    <div className="grid gap-4 sm:grid-cols-3">{(['street','city','zip'] as const).map(key=><Field key={key} id={'client-'+key} label={key==='zip'?'Postal code':key==='city'?'City':'Street'}><Input id={'client-'+key} name={key} defaultValue={p[key==='street'?'addressStreet':key==='city'?'addressCity':'addressZip'] ?? ''}/></Field>)}</div>
    <Field id="client-avoid" label="Foods or dietary requirements (comma separated)"><Input id="client-avoid" name="avoid" defaultValue={p.dietaryAvoid?.join(', ') ?? ''}/></Field>
    <Field id="client-dietary" label="Dietary notes"><Textarea id="client-dietary" name="dietary" maxLength={2000} defaultValue={p.dietaryNotes ?? ''}/></Field>
    <div className="grid gap-4 sm:grid-cols-2">{(['stove','fridge'] as const).map(key=><Field key={key} id={'client-'+key} label={key==='stove'?'Has stove?':'Has refrigerator?'}><select id={'client-'+key} name={key} className={selectClass} defaultValue={p[key==='stove'?'hasStove':'hasFridge']==null?'unknown':p[key==='stove'?'hasStove':'hasFridge']?'yes':'no'}><option value="unknown">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></select></Field>)}</div>
    <Field id="client-availability" label="Availability"><Input id="client-availability" name="availability" maxLength={2000} defaultValue={p.availabilityRaw ?? ''}/></Field>
    <Field id="client-contact" label="Contact preference"><select id="client-contact" name="contact" className={selectClass} defaultValue={p.contactPreference ?? 'unknown'}><option value="unknown">Not recorded</option><option value="callback">Callback</option><option value="status_link">Status link</option></select></Field>
    <Field id="client-accommodation" label="Delivery instructions / accommodation"><Textarea id="client-accommodation" name="accommodation" maxLength={2000} defaultValue={p.accommodation ?? ''}/></Field>
    {client && <><Field id="client-notifications" label="Automatic updates (only with permission and a verified phone)"><select id="client-notifications" name="notifications" defaultValue={client.consent.channel} className={selectClass}><option value="none">None</option><option value="sms">Text messages</option><option value="voice_callback">Generic callback reminders</option></select></Field>
      <label className="flex gap-2 text-sm"><input type="checkbox" required/>I confirmed the client’s contact and notification preferences.</label></>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button disabled={mutation.isPending}>Save profile</Button></div>
  </form>;
}
function ReviewChange({change,close}:{change:ClientChange;close:()=>void}) {
  const mutation=useNourishMutation((data:Parameters<typeof nourishService.reviewChange>[1])=>nourishService.reviewChange(change.id,data),'Follow-up reviewed.');
  const [repackNotes,setRepackNotes]=useState(''),[stockChecked,setStockChecked]=useState(false);
  const rebuild=useNourishMutation(()=>nourishService.rebuildSafetyBasket(change.intakeId!,{notes:repackNotes,stockReconciled:true}),'New safety-review draft created. Review and pack it through the existing basket workflow; the hold stays in place.');
  const submit=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const f=new FormData(event.currentTarget),schedule=String(f.get('schedule') ?? '');
    mutation.mutate({decision:String(f.get('decision')) as 'approved'|'rejected'|'resolved',notes:String(f.get('notes')),
      ...(f.get('apply') ? {profile:change.patch} : {}),...(schedule?{scheduledFor:new Date(schedule).toISOString()}:{}),releaseHold:f.get('hold')==='on'},{onSuccess:close});
  };
  return <form onSubmit={submit} className="space-y-4"><p className="whitespace-pre-wrap">{change.reason}</p><ProfileFacts profile={change.patch}/>
    <p className="text-sm text-muted-foreground">Cancellation and scheduling affect only undispatched deliveries. Approval never means served. No automatic restocking or changes to an approved basket.</p>
    {change.kind==='version_conflict' && <p role="note">Edit the current client profile above, then resolve this conflict with an audit note. Proposed values are not applied automatically.</p>}
    <Field id="change-decision" label="Decision"><select id="change-decision" name="decision" className={selectClass} defaultValue="resolved"><option value="resolved">Resolved with staff follow-up</option>{change.kind!=='version_conflict'&&<option value="approved">Approve requested change</option>}<option value="rejected">Reject requested change</option></select></Field>
    <Field id="change-notes" label="Review notes"><Textarea id="change-notes" name="notes" required maxLength={2000}/></Field>
    {change.intakeId && <><Field id="change-schedule" label="New delivery date/time (staff’s local timezone)"><Input id="change-schedule" name="schedule" type="datetime-local"/></Field>
      {!!Object.keys(change.patch).length && <label className="flex gap-2 text-sm"><input name="apply" type="checkbox"/>Apply these reviewed fields to this intake when approving.</label>}
      <label className="flex gap-2 text-sm"><input name="hold" type="checkbox"/>I reviewed the basket’s food and kitchen safety and request release of the hold.</label></>}
    {change.kind==='safety_review'&&change.intakeId&&<section className="rounded border p-3 space-y-3"><h3 className="font-medium">Basket no longer suitable?</h3><p className="text-sm text-muted-foreground">A rebuild keeps the old basket as history, applies the current household’s dietary/kitchen requirements and creates a new draft. It never returns packed stock automatically. Correct physical stock in Inventory first if repacking is needed.</p>
      <Field id="repack-notes" label="Repacking / stock reconciliation note"><Textarea id="repack-notes" value={repackNotes} onChange={e=>setRepackNotes(e.target.value)} maxLength={2000}/></Field>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={stockChecked} onChange={e=>setStockChecked(e.target.checked)}/>I checked physical stock and recorded any required inventory correction.</label>
      <Button type="button" variant="outline" disabled={!repackNotes.trim()||!stockChecked||rebuild.isPending} onClick={()=>rebuild.mutate(undefined)}>Create new safety-review draft</Button>
    </section>}
    <Button disabled={mutation.isPending}>Record review</Button>
  </form>;
}
function ClientDetails({id,all}:{id:string;all:PhoneClient[]}) {
  const query=useNourishQuery('client:'+id,()=>nourishService.client(id)),client=query.data?.client;
  const [edit,setEdit]=useState(false),[target,setTarget]=useState(''),[mergeConfirm,setMergeConfirm]=useState(false),[change,setChange]=useState<ClientChange|null>(null);
  const merge=useNourishMutation(()=>nourishService.mergeClient(id,target,client!.version),'Duplicate record merged. Target contact and notification preferences retained.');
  return <div className="space-y-5"><QueryFailure error={query.error} retry={()=>void query.refetch()}/>{query.isLoading&&<p>Loading client…</p>}
    {client && <><p>Client reference <strong>{client.reference}</strong> · version {client.version} · {client.phoneVerifiedAt?'Phone verified':'Phone not verified'}</p>
      {edit?<ProfileForm key={client.version} client={client} close={()=>setEdit(false)}/>:<><ProfileFacts profile={client.profile}/><p>Automatic updates: {client.consent.enabled?client.consent.channel:'None'}</p><Button variant="outline" onClick={()=>setEdit(true)}>Edit profile</Button></>}
      <section className="space-y-2"><h3 className="font-medium">Requests & fulfilment</h3>{client.intakes.map(intake=><p key={intake.id}>{intake.caseNumber} · {intake.status}{intake.reviewHold?' · SAFETY HOLD':''} · {intake.baskets.map(b=>b.status).join(', ')}</p>)}
        <div className="flex flex-wrap gap-2"><Button variant="outline" asChild><Link to="/intakes">Intakes</Link></Button><Button variant="outline" asChild><Link to="/household-baskets">Review baskets</Link></Button><Button variant="outline" asChild><Link to="/deliveries">Delivery workflow</Link></Button></div></section>
      <section className="space-y-2"><h3 className="font-medium">Changes & missed deliveries</h3>{client.changes.map(c=><div key={c.id} className="rounded border p-3"><p>{c.kind.replace(/_/g,' ')} · {c.status}</p><p className="whitespace-pre-wrap">{c.reason}</p>{c.decisionNotes&&<p>Review: {c.decisionNotes}</p>}{c.status==='pending'&&<Button variant="outline" size="sm" onClick={()=>setChange(c)}>Review</Button>}</div>)}</section>
      <section className="space-y-2"><h3 className="font-medium">Call history</h3>{client.calls.map(call=><details key={call.id} className="rounded border p-3"><summary>{formatDateTime(call.createdAt)} · {call.language} · {call.status}</summary><Transcript call={call}/></details>)}</section>
      <section className="space-y-2"><h3 className="font-medium">Profile audit history</h3>{client.revisions.map(r=><details key={r.id}><summary>Version {r.version} · {r.actor} · {formatDateTime(r.createdAt)}</summary><ProfileFacts profile={r.profile}/><p>Updates: {r.consent.channel}</p></details>)}</section>
      <section className="space-y-3 rounded border p-4"><h3 className="font-medium">Merge an explicitly identified duplicate</h3><p className="text-sm text-muted-foreground">Moves history into the target record. It does not combine profile fields or opt-in permissions. Never merge based on phone number alone.</p>
        <Field id="merge-target" label="Keep this target record"><select id="merge-target" className={selectClass} value={target} onChange={e=>{setTarget(e.target.value);setMergeConfirm(false);}}><option value="">Choose another household</option>{all.filter(c=>c.id!==id).map(c=><option key={c.id} value={c.id}>{c.profile.name ?? 'Unnamed'} · {c.reference}</option>)}</select></Field>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={mergeConfirm} onChange={e=>setMergeConfirm(e.target.checked)}/>I verified these are the same household; retain the selected target’s profile.</label>
        <Button variant="destructive" disabled={!target||!mergeConfirm||merge.isPending||!!client.mergedIntoId} onClick={()=>merge.mutate(undefined)}>Merge this record into target</Button>
      </section>
    </>}
    <Dialog open={!!change} onOpenChange={open=>{if(!open)setChange(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Review follow-up</DialogTitle><DialogDescription>Record the staff decision and any explicit intake change.</DialogDescription></DialogHeader>{change&&<ReviewChange change={change} close={()=>setChange(null)}/>}</DialogContent></Dialog>
  </div>;
}
function PhoneWork({tab}:{tab:'calls'|'changes'|'sync'}) {
  const calls=useNourishQuery('phone-calls',nourishService.phoneCalls,tab==='calls'),changes=useNourishQuery('changes',nourishService.changes,tab==='changes'),sync=useNourishQuery('phone-sync',nourishService.phoneSync,tab==='sync');
  const [callId,setCallId]=useState<string|null>(null),[change,setChange]=useState<ClientChange|null>(null);
  const detail=useNourishQuery('phone-call:'+callId,()=>nourishService.phoneCall(callId!),!!callId);
  const retry=useNourishMutation(nourishService.retryPhoneSync,'Sync retry queued. The phone worker must be running.');
  const active=tab==='calls'?calls:tab==='changes'?changes:sync;
  return <div className="space-y-3"><QueryFailure error={active.error} retry={()=>void active.refetch()}/>{active.isLoading&&<p>Loading…</p>}
    {tab==='calls'&&<><p className="text-sm text-muted-foreground">Drafts and interrupted calls stay visible. Confirmed does not mean approved or delivered.</p>{calls.data?.calls.map(call=><div key={call.id} className="rounded border p-3"><p>{formatDateTime(call.updatedAt)} · {call.language} · <Status value={call.status}/></p><p>{call.summary}</p><Button size="sm" variant="outline" onClick={()=>setCallId(call.id)}>View call & draft</Button></div>)}</>}
    {tab==='changes'&&changes.data?.changes.map(c=><div key={c.id} className="rounded border p-3"><p>{c.client?.profile.name ?? 'Unverified caller'} · {c.intake?.caseNumber ?? 'No linked intake'} · {c.kind.replace(/_/g,' ')} · <Status value={c.status}/></p><p>{c.reason}</p>{c.status==='pending'&&<Button size="sm" variant="outline" onClick={()=>setChange(c)}>Review</Button>}</div>)}
    {tab==='sync'&&<><p className="text-sm text-muted-foreground">Separate phone queue only. “Sent” means accepted, not recipient acknowledgement or service. Uncertain provider sends and version conflicts need manual review; only synchronization can be retried.</p>{sync.data?.jobs.map(job=><div key={job.id} className="rounded border p-3"><p>{job.kind} · <Status value={job.status}/> · {job.attempts} attempts</p><p className="text-sm">{job.last_error ?? 'Waiting for phone worker'} · {formatDateTime(job.updated_at)}</p>{job.kind==='sync'&&['failed','review'].includes(job.status)&&!['staff_review_required','call_text_retention_expired'].includes(job.last_error ?? '')&&<Button size="sm" variant="outline" disabled={retry.isPending} onClick={()=>retry.mutate(job.id)}>Retry sync</Button>}</div>)}{sync.data?.jobs.length===0&&<p>No pending or failed phone jobs.</p>}</>}
    <Dialog open={!!callId} onOpenChange={open=>{if(!open)setCallId(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Call record</DialogTitle><DialogDescription>Authorized staff view of the saved draft and retained text.</DialogDescription></DialogHeader><QueryFailure error={detail.error} retry={()=>void detail.refetch()}/>{detail.data&&<Transcript call={detail.data.call}/>}</DialogContent></Dialog>
    <Dialog open={!!change} onOpenChange={open=>{if(!open)setChange(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Review follow-up</DialogTitle><DialogDescription>Staff approval and an audit note are required.</DialogDescription></DialogHeader>{change&&<ReviewChange change={change} close={()=>setChange(null)}/>}</DialogContent></Dialog>
  </div>;
}
export function NourishClients() {
  const query=useNourishQuery('clients',nourishService.clients),[id,setId]=useState<string|null>(null),[adding,setAdding]=useState(false),[tab,setTab]=useState<'clients'|'calls'|'changes'|'sync'>('clients');
  const columns:ColumnDef<PhoneClient>[]=[
    {id:'name',accessorFn:c=>c.profile.name ?? '',header:({column})=><SortableHeader column={column}>Contact name</SortableHeader>},
    {accessorKey:'reference',header:'Client reference'},{accessorKey:'phone',header:'Contact phone'},
    {id:'household',accessorFn:c=>c.profile.householdSize,header:'Household size',cell:({row})=>row.original.profile.householdSize ?? 'Not recorded'},
    {id:'verified',header:'Phone verification',cell:({row})=>row.original.phoneVerifiedAt?'Verified':'Not verified'},
    {id:'actions',header:'Actions',cell:({row})=><Button size="sm" variant="outline" onClick={()=>setId(row.original.id)}>View household</Button>},
  ];
  return <div className="space-y-6 min-w-0 pt-6"><SectionHeader title="Clients" description="MealLine household records, saved calls and staff follow-up. Delivery approval, stock, packing and completion remain in MealLine." icon={User}/>
    <nav aria-label="Client workspaces" className="flex flex-wrap gap-2">{(['clients','calls','changes','sync'] as const).map(t=><Button key={t} variant={tab===t?'default':'outline'} aria-pressed={tab===t} onClick={()=>setTab(t)}>{({clients:'Households',calls:'Call drafts & history',changes:'Changes & missed deliveries',sync:'Phone synchronization'})[t]}</Button>)}</nav>
    {tab==='clients'?<><QueryFailure error={query.error} retry={()=>void query.refetch()}/><EnhancedDataTable columns={columns} data={query.data?.clients ?? []} isLoading={query.isLoading} filterColumn="name" filterPlaceholder="Search contact names…" emptyMessage="No MealLine households yet. Imported Link2Feed and SIMC records remain separate." toolbarActions={[{label:'Add client',icon:Plus,variant:'default',action:()=>setAdding(true)}]}/></>:<PhoneWork tab={tab}/>}
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Add client</DialogTitle><DialogDescription>Creates a household record only, not a food request. Automatic updates are disabled until the client opts in and verifies their phone.</DialogDescription></DialogHeader><ProfileForm close={()=>setAdding(false)}/></DialogContent></Dialog>
    <Dialog open={!!id} onOpenChange={open=>{if(!open)setId(null);}}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Household record</DialogTitle><DialogDescription>Essential profile, requests, call history, changes and audit trail.</DialogDescription></DialogHeader>{id&&<ClientDetails id={id} all={query.data?.clients ?? []}/>}</DialogContent></Dialog>
  </div>;
}
