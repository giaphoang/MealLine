import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { matchItemsForIntake } from '@mealline/core';
import { Package } from '@/components/ui/icons';
import { SectionHeader } from '@/components/shared/section-header';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import { SortableHeader } from '@/components/ui/sortable-header';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateTime } from '@/lib/formatting/date';
import config from '@/config/config';
import { nourishService, type Basket, type ShoppingListItem } from '@/services/nourish';
import { Field, selectClass, Status, QueryFailure, useNourishQuery, useNourishMutation } from './shared';

function BasketReview({ basket }: { basket: Basket }) {
  const inventory = useNourishQuery('inventory', nourishService.inventory);
  const intake = useNourishQuery(`intake:${basket.intakeId}`, () => nourishService.intake(basket.intakeId!), !!basket.intakeId);
  const [items, setItems] = useState(basket.items);
  const [title, setTitle] = useState(basket.title);
  const [addId, setAddId] = useState('');
  useEffect(() => { setItems(basket.items); setTitle(basket.title); }, [basket.id, basket.updatedAt]);
  const mutation = useNourishMutation((update: { title?: string; status?: Basket['status']; items?: ShoppingListItem[] }) => nourishService.updateBasket(basket.id, update), 'Household basket updated.');
  const editable = basket.status === 'draft' && basket.currentForIntake!==false;
  const needs = intake.data?.intake;
  const eligible = matchItemsForIntake(inventory.data?.foodItems ?? [], { dietaryAvoid: needs?.dietaryAvoid ?? [], hasStove: needs?.hasStove ?? null, hasFridge: needs?.hasFridge ?? null, householdSize: needs?.householdSize ?? null }, { maxItems: 10000 });
  const columns: ColumnDef<ShoppingListItem>[] = [
    { accessorKey: 'name', size: 250, header: ({ column }) => <SortableHeader column={column}>Food item</SortableHeader> },
    { accessorKey: 'quantity', size: 110, meta: { align: 'right' }, header: ({ column }) => <SortableHeader column={column}>Quantity</SortableHeader>, cell: ({ row }) => editable ? <Input type="number" min="1" step="1" aria-label={`Quantity of ${row.original.name}`} value={row.original.quantity} disabled={mutation.isPending} onChange={(event) => setItems((current) => current.map((item) => item.foodItemId === row.original.foodItemId ? { ...item, quantity: Number(event.target.value) } : item))} /> : row.original.quantity },
    { accessorKey: 'unit', size: 90, header: ({ column }) => <SortableHeader column={column}>Unit</SortableHeader> },
    { accessorKey: 'notes', size: 230, header: 'Dietary notes' },
    ...(editable ? [{ id: 'actions', size: 100, meta: { align: 'right' as const }, header: 'Actions', cell: ({ row }: { row: { original: ShoppingListItem } }) => <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => setItems((current) => current.filter((item) => item.foodItemId !== row.original.foodItemId))}>Remove</Button> }] : []),
  ];
  const add = () => {
    const item = eligible.find((food) => food.id === Number(addId));
    if (item && !items.some((entry) => entry.foodItemId === item.id)) setItems([...items, { foodItemId: item.id, name: item.name, unit: item.unit, quantity: 1, notes: needs?.dietaryAvoid.length ? `Avoids: ${needs.dietaryAvoid.join(', ')}` : undefined }]);
    setAddId('');
  };
  return <div className="space-y-4">
    <div className="flex items-center gap-3"><Status value={basket.status} /><span className="text-sm text-muted-foreground">{basket.items.length} items</span></div>
    {basket.currentForIntake===false&&<p role="note">Historical basket: replaced by a staff-created safety-review draft. This basket cannot be edited or packed again.</p>}
    {needs?.reviewHold&&<p role="alert" className="text-destructive">Client safety hold. Review the pending client changes before dispatch.</p>}
    <QueryFailure error={inventory.error || intake.error} retry={() => { void inventory.refetch(); if (basket.intakeId) void intake.refetch(); }} />
    {needs && <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1"><p>Household: {needs.householdSize ?? 'unknown'} · Diet: {needs.dietaryAvoid.join(', ') || 'none recorded'}</p><p>Stove: {needs.hasStove === null ? 'unknown' : needs.hasStove ? 'yes' : 'no'} · Refrigerator: {needs.hasFridge === null ? 'unknown' : needs.hasFridge ? 'yes' : 'no'}</p>{needs.dietaryNotes && <p>{needs.dietaryNotes}</p>}{needs.status === 'cancelled' && <p className="text-destructive">This intake has been cancelled. Do not fulfil this basket.</p>}</div>}
    <Field id="basket-title" label="Title"><Input id="basket-title" value={title} maxLength={240} disabled={!editable || mutation.isPending} onChange={(event) => setTitle(event.target.value)} /></Field>
    <EnhancedDataTable columns={columns} data={items} filterColumn="name" filterPlaceholder="Search basket…" emptyMessage="No matched items. Add suitable stock before approving." defaultPageSize={10} />
    {editable && <div className="flex gap-2"><select className={selectClass} aria-label="Add a suitable food item" value={addId} onChange={(event) => setAddId(event.target.value)} disabled={inventory.isLoading || intake.isLoading || mutation.isPending}><option value="">Choose a suitable item…</option>{eligible.filter((item) => !items.some((entry) => entry.foodItemId === item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit} available</option>)}</select><Button variant="outline" onClick={add} disabled={!addId || mutation.isPending}>Add</Button></div>}
    <p className="text-sm text-muted-foreground">Review food labels and household notes before approving. Packing checks current stock and deducts units once. Printable FEED templates remain available in Shopping Lists.</p>
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" asChild><a href={`${config.api.baseUrl}/api/nourish/baskets/${basket.id}/pdf`} target="_blank" rel="noopener noreferrer">Download packing PDF</a></Button>
      {editable && <><Button variant="outline" disabled={mutation.isPending} onClick={() => mutation.mutate({ title, items })}>Save draft</Button><Button disabled={mutation.isPending || !items.length || needs?.status === 'cancelled'} onClick={() => mutation.mutate({ title, items, status: 'approved' })}>Approve & create delivery</Button></>}
      {basket.status === 'approved' && basket.currentForIntake!==false && <Button disabled={mutation.isPending || needs?.status === 'cancelled'} onClick={() => mutation.mutate({ status: 'packed' })}>Mark packed & deduct stock</Button>}
      {['packed', 'delivered'].includes(basket.status) && <Button variant="outline" asChild><Link to="/deliveries">View delivery tasks</Link></Button>}
    </div>
  </div>;
}

export function NourishBaskets() {
  const query = useNourishQuery('baskets', nourishService.baskets);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = query.data?.baskets.find((basket) => basket.id === selectedId);
  const columns: ColumnDef<Basket>[] = [
    { accessorKey: 'title', size: 300, header: ({ column }) => <SortableHeader column={column}>Household basket</SortableHeader> },
    { id: 'case', accessorFn: (row) => row.intake?.caseNumber ?? '—', size: 140, header: ({ column }) => <SortableHeader column={column}>Case</SortableHeader> },
    { accessorKey: 'status', size: 120, header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>, cell: ({ row }) => <Status value={row.original.status} /> },
    { id: 'count', accessorFn: (row) => row.items.length, size: 90, meta: { align: 'right' }, header: ({ column }) => <SortableHeader column={column}>Items</SortableHeader> },
    { accessorKey: 'createdAt', size: 170, header: ({ column }) => <SortableHeader column={column}>Created</SortableHeader>, cell: ({ row }) => formatDateTime(row.original.createdAt) },
    { id: 'actions', size: 110, meta: { align: 'right' }, header: 'Actions', cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => setSelectedId(row.original.id)}>Review</Button> },
  ];
  return <div className="space-y-6 min-w-0 w-full pt-6">
    <SectionHeader title="Household Baskets" description="Review MealLine's matched household quantities, approve fulfilment, and pack against the same inventory used by FEED." icon={Package} />
    <p className="text-sm text-muted-foreground">Looking for the multilingual printable list designer? <Link className="text-primary underline" to="/shopping-lists">Open FEED Shopping Lists</Link>.</p>
    <QueryFailure error={query.error} retry={() => void query.refetch()} />
    <EnhancedDataTable columns={columns} data={query.data?.baskets ?? []} isLoading={query.isLoading} filterColumn="title" filterPlaceholder="Search household baskets…" emptyMessage="No household baskets yet. Save an intake to generate one." />
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>Household-specific fulfilment, with dietary and equipment checks.</DialogDescription></DialogHeader>{selected && <BasketReview basket={selected} />}</DialogContent></Dialog>
  </div>;
}
