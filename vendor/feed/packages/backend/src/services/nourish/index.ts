import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { buildShoppingListItems, matchItemsForIntake, type FoodItem, type ShoppingListItem } from '@mealline/core';
import prisma from '../../db';
import { createFoodItemWithEvent, writeInventoryEvent } from '../food-item';
import { createCategoryWithEvent } from '../category';
import { computeEventRecordFlags, isEffectiveTrackedChange, resolveStockAndQuantity } from '../food-item/stock-consistency';

export const operationError = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
type InventoryRow = Prisma.FoodItemGetPayload<{ include: { category: true } }>;
export const projectFoodItem = (item: InventoryRow): FoodItem => ({
  id: item.id, name: item.name, category: item.category.name,
  quantity: item.quantity, unit: item.unit, isInStock: item.isInStock,
  vegan: item.vegan, vegetarian: item.vegetarian, glutenFree: item.glutenFree,
  halal: item.halal, kosher: item.kosher, requiresStove: item.requiresStove, requiresFridge: item.requiresFridge,
});

export async function getInventory() {
  const items = await prisma.foodItem.findMany({ include: { category: true }, orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }] });
  return items.map(projectFoodItem);
}

export async function createLegacyFoodItem(body: Record<string, unknown>) {
  if (typeof body?.name !== 'string') throw operationError('Enter a food item name.');
  const name = String(body.name ?? '').trim();
  if (!name || name.length > 36) throw operationError('Food item name must be 1–36 characters.');
  const quantity = Number(body.quantity ?? 0);
  if (!Number.isInteger(quantity) || quantity < 0) throw operationError('Quantity must be a nonnegative whole number.');
  const categoryName = String(body.category ?? 'general').trim();
  const category = await prisma.category.findUnique({ where: { nameSearch: categoryName.toLowerCase() } }) ?? await createCategoryWithEvent({ name: categoryName, nameSearch: categoryName.toLowerCase(), limit: 100, limitType: 'household' });
  const item = await createFoodItemWithEvent({
    name, categoryId: category.id, limit: 100, limitType: 'household',
    statusFlags: { isInStock: body.isInStock !== false },
    dietaryFlags: { vegan: body.vegan === true, vegetarian: body.vegetarian === true, glutenFree: body.glutenFree === true, halal: body.halal === true, kosher: body.kosher === true },
    fulfilment: { quantity, unit: String(body.unit ?? 'unit'), requiresStove: body.requiresStove === true, requiresFridge: body.requiresFridge === true },
  });
  return { id: item.id };
}

export async function summary() {
  const [intakes, pendingIntakes, inventory, drafts, deliveries, pendingDeliveries, stock] = await Promise.all([
    prisma.nourishIntake.count(), prisma.nourishIntake.count({ where: { status: 'pending' } }), prisma.foodItem.count({ where: { isInStock: true } }),
    prisma.nourishBasket.count({ where: { status: 'draft' } }), prisma.nourishDelivery.count(), prisma.nourishDelivery.count({ where: { status: { in: ['pending', 'assigned', 'in_transit'] } } }),
    prisma.foodItem.aggregate({ where: { isInStock: true }, _sum: { quantity: true } }),
  ]);
  return { intakes, pendingIntakes, inventory, drafts, deliveries, pendingDeliveries, stockUnits: stock._sum.quantity ?? 0 };
}

export interface IntakeInput {
  id?: string; caseNumber: string; language?: string; phone?: string | null;
  addressRaw?: string | null; addressStreet?: string | null; addressCity?: string | null; addressZip?: string | null;
  householdSize?: number | null; dietaryAvoid?: string[]; dietaryNotes?: string | null; hasStove?: boolean | null; hasFridge?: boolean | null;
  availabilityRaw?: string | null; availabilityDays?: string[]; availabilityTimes?: string[];
  contactPreference?: string | null; accommodation?: string | null;
  transcript?: Array<{ step: string; input: string | null; reply: string; at: string }>;
}

export async function submitIntake(input: IntakeInput, transcript?: IntakeInput['transcript']) {
  return prisma.$transaction(tx => submitIntakeInTransaction(tx, input, transcript));
}

export async function submitIntakeInTransaction(tx: Prisma.TransactionClient, input: IntakeInput, transcript?: IntakeInput['transcript']) {
  const { id: suppliedId, ...fields } = input;
  const recordedTranscript = transcript ?? input.transcript;
    const intake = await tx.nourishIntake.upsert({
      where: { caseNumber: input.caseNumber },
      create: { ...fields, id: suppliedId ?? `vi_${randomUUID()}`, transcript: recordedTranscript ?? [], status: 'matched' },
      update: { ...fields, ...(recordedTranscript ? { transcript: recordedTranscript } : {}) },
    });
    const latest = await tx.nourishBasket.findFirst({ where: { intakeId: intake.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    if (intake.status === 'cancelled') throw operationError('This case has been cancelled. Review it before submitting another request.', 409);
    // A webhook retry preserves work staff have already approved or packed.
    if (latest && latest.status !== 'draft') {
      const items = latest.items as unknown as ShoppingListItem[];
      return { intakeId: intake.id, shoppingListId: latest.id, matchedCount: items.length, items };
    }
    const inventory = await tx.foodItem.findMany({ where: { isInStock: true, quantity: { gt: 0 } }, include: { category: true }, orderBy: { id: 'asc' } });
    const avoid = intake.dietaryAvoid as string[];
    const matched = matchItemsForIntake(inventory.map(projectFoodItem), { dietaryAvoid: avoid, hasStove: intake.hasStove, hasFridge: intake.hasFridge, householdSize: intake.householdSize });
    const items = buildShoppingListItems(matched, intake.householdSize, avoid);
    const data = { title: `Voice ${intake.caseNumber} — Household of ${intake.householdSize ?? '?'}`, items: items as unknown as Prisma.InputJsonValue };
    const basket = latest ? await tx.nourishBasket.update({ where: { id: latest.id }, data }) : await tx.nourishBasket.create({ data: { ...data, intakeId: intake.id } });
    return { intakeId: intake.id, shoppingListId: basket.id, matchedCount: matched.length, items };
}

export const getIntakes = () => prisma.nourishIntake.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
export const getBaskets = async () => {
  const rows=await prisma.nourishBasket.findMany({include:{intake:{select:{caseNumber:true,language:true}}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:100});
  const seen=new Set<string>();
  return rows.map(basket=>{const currentForIntake=!basket.intakeId || !seen.has(basket.intakeId);if(basket.intakeId)seen.add(basket.intakeId);return {...basket,currentForIntake};});
};
export const getDeliveries = () => prisma.nourishDelivery.findMany({ include: { basket: true, intake: true, volunteer: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });

export async function getIntake(id: string) {
  const intake = await prisma.nourishIntake.findUnique({ where: { id }, include: { baskets: true, deliveries: { include: { volunteer: { select: { id: true, name: true } } } } } });
  if (!intake) throw operationError('This intake was not found. Refresh the intake list.', 404);
  return intake;
}

export async function updateBasket(id: number, update: { title?: string; items?: ShoppingListItem[]; status?: string }) {
  return prisma.$transaction(async (tx) => {
    const basket = await tx.nourishBasket.findUnique({ where: { id }, include: { intake: true } });
    if (!basket) throw operationError('This household basket was not found.', 404);
    if(basket.intakeId){const latest=await tx.nourishBasket.findFirst({where:{intakeId:basket.intakeId},orderBy:[{createdAt:'desc'},{id:'desc'}]});
      if(latest?.id!==basket.id)throw operationError('This historical basket was replaced by a staff-created safety-review draft. Use the current basket.');}
    if (update.items && basket.status !== 'draft') throw operationError('Only a draft basket can be edited.');
    let items = (update.items ?? basket.items) as ShoppingListItem[];
    if (basket.intake?.status === 'cancelled' && ['approved', 'packed'].includes(update.status ?? '')) throw operationError('This household intake has been cancelled.');
    if (update.items || (['approved', 'packed'].includes(update.status ?? '') && update.status !== basket.status)) {
      if (new Set(items.map((item) => item.foodItemId)).size !== items.length) throw operationError('Include each food item only once.');
      const inventory = await tx.foodItem.findMany({ where: { id: { in: items.map((item) => item.foodItemId) } }, include: { category: true } });
      const safe = matchItemsForIntake(inventory.map(projectFoodItem), { dietaryAvoid: (basket.intake?.dietaryAvoid ?? []) as string[], hasStove: basket.intake?.hasStove ?? null, hasFridge: basket.intake?.hasFridge ?? null, householdSize: basket.intake?.householdSize ?? null }, { maxItems: Number.MAX_SAFE_INTEGER });
      items = items.map((item) => {
        const source = safe.find((food) => food.id === item.foodItemId);
        if (!source || item.quantity > source.quantity) throw operationError(`Check the availability and dietary suitability of ${item.name}.`);
        return { ...item, name: source.name, unit: source.unit };
      });
    }
    const status = update.status ?? basket.status;
    const allowed: Record<string, string[]> = { draft: ['draft', 'approved'], approved: ['approved', 'packed'], packed: ['packed'], delivered: ['delivered'] };
    if (!allowed[basket.status]?.includes(status)) throw operationError('Complete basket review and packing in order.');
    if (status !== 'draft' && !items.length) throw operationError('Add available food items before approving this basket.');
    if (status === 'packed' && basket.status !== 'packed') {
      for (const item of items) {
        const current = await tx.foodItem.findUnique({ where: { id: item.foodItemId }, include: { category: true } });
        if (!current?.isInStock || current.quantity < item.quantity) throw operationError(`${item.name} no longer has enough stock. Refresh inventory before packing.`, 409);
        const stock = resolveStockAndQuantity(current, { statusFlags: { isInStock: current.quantity > item.quantity }, estimatedQuantityProvided: false });
        const changed = await tx.foodItem.update({ where: { id: item.foodItemId }, data: { quantity: { decrement: item.quantity }, ...stock }, include: { category: true } });
        const flags = computeEventRecordFlags(current, changed);
        if (isEffectiveTrackedChange(flags)) await writeInventoryEvent(tx, changed, 'updated', flags);
      }
    }
    const saved = await tx.nourishBasket.update({ where: { id }, data: { title: update.title ?? basket.title, items: items as unknown as Prisma.InputJsonValue, status } });
    if (basket.intake?.clientId && status !== basket.status) await tx.nourishDeliveryEvent.create({ data: { eventId: randomUUID(), clientId: basket.intake.clientId, intakeId: basket.intake.id, kind: `basket.${status}` } });
    if (status === 'approved' || status === 'packed') {
      const delivery = await tx.nourishDelivery.findFirst({ where: { shoppingListId: id } });
      if (!delivery) await tx.nourishDelivery.create({ data: { id: `delivery_${randomUUID()}`, shoppingListId: id, intakeId: basket.intakeId } });
    }
    return saved;
  });
}

export async function updateDelivery(id: string, update: { status?: string; assignedTo?: string | null; scheduledFor?: string | null; notes?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.nourishDelivery.findUnique({ where: { id }, include: { basket: true } });
    if (!current) throw operationError('This delivery was not found.', 404);
    if (update.assignedTo && !await tx.nourishVolunteer.findUnique({ where: { id: update.assignedTo } })) throw operationError('Choose a volunteer from the current roster.');
    const status = update.status ?? (update.assignedTo ? 'assigned' : current.status);
    if (current.intakeId && ['assigned', 'in_transit', 'delivered'].includes(status)) {
      const intake = await tx.nourishIntake.findUnique({ where: { id: current.intakeId } });
      if (intake?.status === 'cancelled') throw operationError('This household intake has been cancelled. Do not dispatch this delivery.');
      if (intake?.reviewHold && ['in_transit', 'delivered'].includes(status)) throw operationError('Review the pending client change and release its safety hold before dispatch.');
    }
    const allowed: Record<string, string[]> = { pending: ['pending', 'assigned', 'failed'], assigned: ['assigned', 'pending', 'in_transit', 'failed'], in_transit: ['in_transit', 'delivered', 'failed'], failed: ['failed', 'pending', 'assigned'], delivered: ['delivered'] };
    if (!allowed[current.status]?.includes(status)) throw operationError('Advance the delivery through assignment, transit, and completion in order.');
    const assignedTo = update.assignedTo === undefined ? current.assignedTo : update.assignedTo;
    if (['assigned', 'in_transit', 'delivered'].includes(status) && !assignedTo) throw operationError('Assign a volunteer before advancing this delivery.');
    if (['in_transit', 'delivered'].includes(status) && !['packed', 'delivered'].includes(current.basket?.status ?? '')) throw operationError('Pack the household basket before sending it for delivery.');
    const saved = await tx.nourishDelivery.update({ where: { id }, data: { ...update, status, scheduledFor: update.scheduledFor === undefined ? undefined : update.scheduledFor ? new Date(update.scheduledFor) : null } });
    if (current.intakeId && ['assigned', 'in_transit', 'delivered'].includes(status)) await tx.nourishIntake.update({ where: { id: current.intakeId }, data: { status: status === 'delivered' ? 'delivered' : 'assigned' } });
    if (status === 'delivered' && current.shoppingListId) await tx.nourishBasket.update({ where: { id: current.shoppingListId }, data: { status: 'delivered' } });
    const intake = current.intakeId ? await tx.nourishIntake.findUnique({ where: { id: current.intakeId } }) : null;
    if (intake?.clientId && (status !== current.status || saved.scheduledFor?.toISOString() !== current.scheduledFor?.toISOString())) {
      await tx.nourishDeliveryEvent.create({ data: { eventId: randomUUID(), clientId: intake.clientId, intakeId: intake.id,
        kind: status === current.status ? 'delivery.rescheduled' : `delivery.${status}` } });
    }
    return saved;
  });
}
