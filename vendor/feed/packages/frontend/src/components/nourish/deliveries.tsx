import { useState, type FormEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Map, Plus } from '@/components/ui/icons';
import { SectionHeader } from '@/components/shared/section-header';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import { SortableHeader } from '@/components/ui/sortable-header';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatDateTime } from '@/lib/formatting/date';
import { nourishService, type DeliveryTask, type Volunteer } from '@/services/nourish';
import { Field, selectClass, Status, QueryFailure, useNourishQuery, useNourishMutation } from './shared';

const allowed: Record<DeliveryTask['status'], DeliveryTask['status'][]> = {
  pending: ['pending', 'assigned', 'failed'], assigned: ['assigned', 'pending', 'in_transit', 'failed'],
  in_transit: ['in_transit', 'delivered', 'failed'], failed: ['failed', 'pending', 'assigned'], delivered: ['delivered'],
};
function localDateTime(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function DeliveryForm({ delivery, volunteers, close }: { delivery: DeliveryTask; volunteers: Volunteer[]; close: () => void }) {
  const mutation = useNourishMutation((update: Parameters<typeof nourishService.updateDelivery>[1]) => nourishService.updateDelivery(delivery.id, update), 'Delivery task updated.');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const schedule = String(fields.get('scheduled') ?? '');
    const assignedTo = String(fields.get('volunteer') ?? delivery.assignedTo ?? '') || null;
    const requested = String(fields.get('status')) as DeliveryTask['status'];
    const status = delivery.status === 'pending' && requested === 'pending' && assignedTo ? 'assigned' : requested;
    mutation.mutate({ assignedTo, status, scheduledFor: schedule ? new Date(schedule).toISOString() : null, notes: String(fields.get('notes') ?? '') || null }, { onSuccess: close });
  };
  return <form onSubmit={submit} className="space-y-4">
    <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-2"><p>Case: {delivery.intake?.caseNumber ?? '—'} · Basket: {delivery.basket?.status ?? 'unlinked'}</p><p>Address: {delivery.intake?.addressRaw || [delivery.intake?.addressStreet, delivery.intake?.addressCity, delivery.intake?.addressZip].filter(Boolean).join(', ') || 'Not recorded'}</p><p>Phone: {delivery.intake?.phone ?? 'Not recorded'}</p><p>Availability: {delivery.intake?.availabilityRaw ?? 'Not recorded'}</p>{delivery.intake?.accommodation && <p>Accommodations: {delivery.intake.accommodation}</p>}</div>
    <Field id="delivery-volunteer" label="Assigned volunteer"><select id="delivery-volunteer" name="volunteer" className={selectClass} defaultValue={delivery.assignedTo ?? ''} disabled={delivery.status === 'delivered'}><option value="">Unassigned</option>{volunteers.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></Field>
    <Field id="delivery-status" label="Status"><select id="delivery-status" name="status" className={selectClass} defaultValue={delivery.status}>{allowed[delivery.status].map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select></Field>
    <Field id="delivery-scheduled" label="Scheduled delivery (local time)"><Input id="delivery-scheduled" name="scheduled" type="datetime-local" defaultValue={localDateTime(delivery.scheduledFor)} /></Field>
    <Field id="delivery-notes" label="Delivery notes"><Textarea id="delivery-notes" name="notes" maxLength={2000} defaultValue={delivery.notes ?? ''} /></Field>
    <p className="text-sm text-muted-foreground">Assign a volunteer before transit. The household basket must be packed before leaving. Completion also marks its basket and intake delivered.</p>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>Save delivery</Button></div>
  </form>;
}

function VolunteerForm({ close }: { close: () => void }) {
  const mutation = useNourishMutation(nourishService.addVolunteer, 'Volunteer added to the delivery roster.');
  return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); mutation.mutate({ name: String(fields.get('name')).trim(), email: String(fields.get('email')).trim().toLowerCase() }, { onSuccess: close }); }}>
    <Field id="volunteer-name" label="Name"><Input id="volunteer-name" name="name" required maxLength={128} /></Field>
    <Field id="volunteer-email" label="Email"><Input id="volunteer-email" name="email" type="email" required /></Field>
    <p className="text-sm text-muted-foreground">This is a delivery assignment contact, not a staff sign-in account. Administrators manage workspace access separately.</p>
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={close} disabled={mutation.isPending}>Cancel</Button><Button type="submit" disabled={mutation.isPending}>Add volunteer</Button></div>
  </form>;
}

export function NourishDeliveries() {
  const query = useNourishQuery('deliveries', nourishService.deliveries);
  const volunteers = useNourishQuery('volunteers', nourishService.volunteers);
  const [selected, setSelected] = useState<DeliveryTask | null>(null);
  const [adding, setAdding] = useState(false);
  const columns: ColumnDef<DeliveryTask>[] = [
    { id: 'case', accessorFn: (row) => row.intake?.caseNumber ?? row.id, size: 180, header: ({ column }) => <SortableHeader column={column}>Case</SortableHeader> },
    { id: 'basket', accessorFn: (row) => row.basket?.title ?? 'Unlinked basket', size: 260, header: ({ column }) => <SortableHeader column={column}>Household basket</SortableHeader> },
    { id: 'volunteer', accessorFn: (row) => row.volunteer?.name ?? 'Unassigned', size: 170, header: ({ column }) => <SortableHeader column={column}>Volunteer</SortableHeader> },
    { accessorKey: 'status', size: 130, header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>, cell: ({ row }) => <Status value={row.original.status} /> },
    { accessorKey: 'scheduledFor', size: 180, header: ({ column }) => <SortableHeader column={column}>Scheduled</SortableHeader>, cell: ({ row }) => formatDateTime(row.original.scheduledFor) },
    { id: 'actions', size: 110, meta: { align: 'right' }, header: 'Actions', cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => setSelected(row.original)}>Manage</Button> },
  ];
  const rosterColumns: ColumnDef<Volunteer>[] = [
    { accessorKey: 'name', size: 240, header: ({ column }) => <SortableHeader column={column}>Volunteer</SortableHeader> },
    { accessorKey: 'email', size: 300, header: ({ column }) => <SortableHeader column={column}>Email</SortableHeader> },
    { accessorKey: 'role', size: 140, header: ({ column }) => <SortableHeader column={column}>Assignment role</SortableHeader> },
  ];
  return <div className="space-y-6 min-w-0 w-full pt-6">
    <SectionHeader title="Deliveries" description="Assign approved household baskets to volunteers, schedule delivery, and track transit and completion." icon={Map} />
    <QueryFailure error={query.error || volunteers.error} retry={() => { void query.refetch(); void volunteers.refetch(); }} />
    <Tabs defaultValue="tasks"><TabsList><TabsTrigger value="tasks">Delivery tasks</TabsTrigger><TabsTrigger value="volunteers">Volunteer roster</TabsTrigger></TabsList>
      <TabsContent value="tasks" className="mt-4"><EnhancedDataTable columns={columns} data={query.data?.deliveries ?? []} isLoading={query.isLoading} filterColumn="case" filterPlaceholder="Search delivery cases…" emptyMessage="No delivery tasks yet. Approve a household basket to create one." /></TabsContent>
      <TabsContent value="volunteers" className="mt-4"><EnhancedDataTable columns={rosterColumns} data={volunteers.data?.volunteers ?? []} isLoading={volunteers.isLoading} filterColumn="name" filterPlaceholder="Search volunteers…" emptyMessage="No volunteers yet. Add delivery contacts to the roster." toolbarActions={[{ label: 'Add volunteer', icon: Plus, variant: 'default', action: () => setAdding(true) }]} /></TabsContent>
    </Tabs>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Delivery · {selected?.intake?.caseNumber ?? selected?.id}</DialogTitle><DialogDescription>Contact details are visible only to signed-in staff.</DialogDescription></DialogHeader>{selected && <DeliveryForm delivery={selected} volunteers={volunteers.data?.volunteers ?? []} close={() => setSelected(null)} />}</DialogContent></Dialog>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent><DialogHeader><DialogTitle>Add volunteer</DialogTitle><DialogDescription>Create an assignment contact for household deliveries.</DialogDescription></DialogHeader><VolunteerForm close={() => setAdding(false)} /></DialogContent></Dialog>
  </div>;
}
