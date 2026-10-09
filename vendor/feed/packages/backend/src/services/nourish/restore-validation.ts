import { createRouteError } from '../../lib/route-error';

type Row = Record<string, unknown>;

const identity = (row: Row): string =>
  String(row.nameSearch ?? row.name ?? '').trim().toLowerCase();

/** JSON food references are not SQL foreign keys. Check them before a partial
 * restore can bind an unpacked basket to another installation's food IDs. */
export function assertBasketInventoryIdentity(
  baskets: unknown[],
  sourceFoods: unknown[],
  destinationFoods: unknown[]
): void {
  const source = new Map(sourceFoods.map(value => {
    const row = value as Row;
    return [row.id, identity(row)] as const;
  }));
  const destination = new Map(destinationFoods.map(value => {
    const row = value as Row;
    return [row.id, identity(row)] as const;
  }));
  for (const value of baskets) {
    const basket = value as Row;
    // Packed/delivered baskets are historical snapshots, not future stock
    // deductions. Their food may have been legitimately deleted since packing.
    if (basket.status !== 'draft' && basket.status !== 'approved') continue;
    if (!Array.isArray(basket.items)) {
      throw createRouteError(`Basket ${basket.id} has invalid items. The live database has not been touched.`, 400, 'NOURISH_RESTORE_INVALID_BASKET');
    }
    for (const value of basket.items) {
      const item = value as Row | null;
      const id = item?.foodItemId;
      const expected = source.get(id) ?? String(item?.name ?? '').trim().toLowerCase();
      if (!Number.isInteger(id) || !expected || destination.get(id) !== expected) {
        throw createRouteError(
          `Basket ${basket.id} cannot safely reference inventory item ${String(id)} after this restore. `
          + 'Restore matching Inventory and MealLine fulfilment together, or review pending baskets first. '
          + 'The live database has not been touched.',
          409,
          'NOURISH_RESTORE_INVENTORY_MISMATCH'
        );
      }
    }
  }
}
