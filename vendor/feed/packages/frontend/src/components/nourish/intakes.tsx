import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AudioWaveform, Plus } from '@/components/ui/icons';
import { SectionHeader } from '@/components/shared/section-header';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import { SortableHeader } from '@/components/ui/sortable-header';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime } from '@/lib/formatting/date';
import { nourishService, type VoiceIntake, type IntakeSubmission } from '@/services/nourish';
import { Field, selectClass, Status, QueryFailure, useNourishQuery, useNourishMutation } from './shared';

function IntakeForm({ close }: { close: () => void }) {
  const mutation = useNourishMutation(nourishService.submitIntake, 'Intake saved and matched against current inventory.');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const text = (key: string) => String(fields.get(key) ?? '').trim();
    const nullable = (key: string) => text(key) || null;
    const equipment = (key: string) => text(key) === 'unknown' ? null : text(key) === 'yes';
    const intake: IntakeSubmission = {
      caseNumber: text('case'), language: text('language') as VoiceIntake['language'], householdSize: text('household') ? Number(text('household')) : null,
      phone: nullable('phone'), addressRaw: nullable('address'), dietaryAvoid: text('avoid').split(',').map((value) => value.trim()).filter(Boolean), dietaryNotes: nullable('dietary'),
      hasStove: equipment('stove'), hasFridge: equipment('fridge'), availabilityRaw: nullable('availability'), accommodation: nullable('accommodation'),
      contactPreference: text('contact') === 'unknown' ? null : text('contact') as VoiceIntake['contactPreference'],
    };
    mutation.mutate(intake, { onSuccess: close });
  };
  return <form onSubmit={submit} className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="intake-case" label="Case number"><Input id="intake-case" name="case" required maxLength={128} /></Field>
      <Field id="intake-language" label="Intake language"><select id="intake-language" name="language" className={selectClass}><option value="en">English</option><option value="es">Español</option><option value="vi">Tiếng Việt</option></select></Field>
      <Field id="intake-household" label="Household size"><Input id="intake-household" name="household" type="number" min="1" max="100" /></Field>
      <Field id="intake-phone" label="Phone"><Input id="intake-phone" name="phone" type="tel" /></Field>
    </div>
    <Field id="intake-address" label="Delivery address"><Textarea id="intake-address" name="address" maxLength={2000} /></Field>
    <Field id="intake-avoid" label="Dietary needs (comma separated)"><Input id="intake-avoid" name="avoid" placeholder="peanuts, gluten, vegan" /></Field>
    <Field id="intake-dietary" label="Dietary notes"><Textarea id="intake-dietary" name="dietary" maxLength={2000} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">{['stove', 'fridge'].map((name) => <Field key={name} id={`intake-${name}`} label={name === 'stove' ? 'Has a stove?' : 'Has a refrigerator?'}><select id={`intake-${name}`} name={name} className={selectClass}><option value="unknown">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></select></Field>)}</div>
    <Field id="intake-availability" label="Availability"><Input id="intake-availability" name="availability" maxLength={2000} /></Field>
    <Field id="intake-contact" label="Contact preference"><select id="intake-contact" name="contact" className={selectClass}><option value="unknown">Not recorded</option><option value="callback">Callback</option><option value="status_link">Status link</option></select></Field>
    <Field id="intake-accommodation" label="Accommodations"><Textarea id="intake-accommodation" name="accommodation" maxLength={2000} /></Field>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Matching…' : 'Save & match'}</Button></div>
  </form>;
}

function IntakeDetails({ id }: { id: string }) {
  const query = useNourishQuery(`intake:${id}`, () => nourishService.intake(id));
  const mutation = useNourishMutation((status: 'pending' | 'matched' | 'cancelled') => nourishService.intakeStatus(id, status), 'Intake status updated.');
  const intake = query.data?.intake;
  return <div className="space-y-5">
    <QueryFailure error={query.error} retry={() => void query.refetch()} />
    {query.isLoading && <p>Loading intake…</p>}
    {intake && <>
      <div className="flex flex-wrap items-center gap-3"><Status value={intake.status} /><span className="text-sm text-muted-foreground">{formatDateTime(intake.createdAt)}</span></div>
      {intake.reviewHold&&<p role="alert" className="text-destructive">Safety hold: review client changes before dispatch.</p>}
      {intake.clientId&&<Button variant="outline" asChild><Link to="/clients">View household records & follow-ups</Link></Button>}
      <dl className="grid gap-4 sm:grid-cols-2">{[
        ['Household', intake.householdSize ?? 'Not recorded'], ['Language', intake.language], ['Phone', intake.phone], ['Address', intake.addressRaw || [intake.addressStreet, intake.addressCity, intake.addressZip].filter(Boolean).join(', ')],
        ['Dietary needs', intake.dietaryAvoid.join(', ')], ['Dietary notes', intake.dietaryNotes], ['Stove', intake.hasStove === null ? 'Not recorded' : intake.hasStove ? 'Yes' : 'No'], ['Refrigerator', intake.hasFridge === null ? 'Not recorded' : intake.hasFridge ? 'Yes' : 'No'],
        ['Availability', intake.availabilityRaw || [...(intake.availabilityDays ?? []), ...(intake.availabilityTimes ?? [])].join(', ')], ['Contact preference', intake.contactPreference], ['Accommodations', intake.accommodation],
      ].map(([label, value]) => <div key={String(label)}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || '—'}</dd></div>)}</dl>
      <div className="space-y-2"><h3 className="font-medium">Household baskets</h3>{intake.baskets.map((basket) => <p key={basket.id}>{basket.title} · {basket.status} · {basket.items.length} items</p>)}<Button variant="outline" asChild><Link to="/household-baskets">Review household baskets</Link></Button></div>
      <div className="space-y-3"><h3 className="font-medium">Voice transcript</h3>{!intake.transcript.length && <p className="text-sm text-muted-foreground">No transcript was recorded.</p>}{intake.transcript.map((entry, index) => <div key={`${entry.at}-${index}`} className="rounded-md border p-3 text-sm"><p className="font-medium">{entry.step} · {formatDateTime(entry.at)}</p><p className="mt-1 whitespace-pre-wrap">Caller: {entry.input ?? '—'}</p><p className="mt-1 whitespace-pre-wrap">System: {entry.reply}</p></div>)}</div>
      {!['assigned', 'delivered', 'cancelled'].includes(intake.status) && <Button variant="destructive" disabled={mutation.isPending} onClick={() => mutation.mutate('cancelled')}>Cancel intake</Button>}
    </>}
  </div>;
}

export function NourishIntakes() {
  const query = useNourishQuery('intakes', nourishService.intakes);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<VoiceIntake | null>(null);
  const columns: ColumnDef<VoiceIntake>[] = [
    { accessorKey: 'caseNumber', size: 170, header: ({ column }) => <SortableHeader column={column}>Case</SortableHeader> },
    { accessorKey: 'language', size: 90, header: ({ column }) => <SortableHeader column={column}>Language</SortableHeader> },
    { accessorKey: 'householdSize', size: 100, meta: { align: 'right' }, header: ({ column }) => <SortableHeader column={column}>Household</SortableHeader>, cell: ({ row }) => row.original.householdSize ?? '—' },
    { id: 'dietary', accessorFn: (row) => row.dietaryAvoid.join(', '), size: 230, header: ({ column }) => <SortableHeader column={column}>Dietary needs</SortableHeader> },
    { accessorKey: 'status', size: 120, header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>, cell: ({ row }) => <Status value={row.original.status} /> },
    { accessorKey: 'createdAt', size: 170, header: ({ column }) => <SortableHeader column={column}>Received</SortableHeader>, cell: ({ row }) => formatDateTime(row.original.createdAt) },
    { id: 'actions', size: 100, meta: { align: 'right' }, header: 'Actions', cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => setSelected(row.original)}>View</Button> },
  ];
  return <div className="space-y-6 min-w-0 w-full pt-6">
    <SectionHeader title="Voice Intakes" description="Household requests captured in English, Spanish, or Vietnamese, matched with live inventory and the original MealLine dietary and kitchen rules." icon={AudioWaveform} />
    <QueryFailure error={query.error} retry={() => void query.refetch()} />
    <EnhancedDataTable columns={columns} data={query.data?.intakes ?? []} isLoading={query.isLoading} filterColumn="caseNumber" filterPlaceholder="Search cases…" emptyMessage="No household intakes yet. Capture a request or connect your voice system." toolbarActions={[{ label: 'Add intake', icon: Plus, variant: 'default', action: () => setAdding(true) }]} />
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Add household intake</DialogTitle><DialogDescription>Saving creates a draft basket. An existing case updates its draft without duplicating the intake.</DialogDescription></DialogHeader><IntakeForm close={() => setAdding(false)} /></DialogContent></Dialog>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Case {selected?.caseNumber}</DialogTitle><DialogDescription>Household details and the original voice transcript. Authorized staff only.</DialogDescription></DialogHeader>{selected && <IntakeDetails id={selected.id} />}</DialogContent></Dialog>
  </div>;
}
