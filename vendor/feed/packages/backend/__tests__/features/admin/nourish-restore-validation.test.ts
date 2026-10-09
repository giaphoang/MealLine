import { describe, expect, it } from 'vitest';
import { assertBasketInventoryIdentity } from '../../../src/services/nourish/restore-validation';

const beans = [{ id: 1, name: 'Beans', nameSearch: 'beans' }];
const milk = [{ id: 1, name: 'Milk', nameSearch: 'milk' }];
const basket = (status = 'draft') => [
  { id: 7, status, items: [{ foodItemId: 1, name: 'Beans', quantity: 2, unit: 'can' }] },
];

describe('MealLine partial restore inventory identity', () => {
  it('allows matching inventory and fulfilment together', () => {
    expect(() => assertBasketInventoryIdentity(basket(), beans, beans)).not.toThrow();
  });
  it('allows a same-installation fulfilment restore without replacing inventory', () => {
    expect(() => assertBasketInventoryIdentity(basket('approved'), beans, beans)).not.toThrow();
  });
  it('refuses another food with the same ID before swapping the live database', () => {
    expect(() => assertBasketInventoryIdentity(basket(), beans, milk))
      .toThrow(/live database has not been touched/);
    try {
      assertBasketInventoryIdentity(basket(), beans, milk);
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 409, code: 'NOURISH_RESTORE_INVENTORY_MISMATCH' });
    }
  });
  it('protects retained pending baskets during inventory-only restore', () => {
    expect(() => assertBasketInventoryIdentity(basket('approved'), beans, milk))
      .toThrow(/Restore matching Inventory and MealLine fulfilment together/);
  });
  it('refuses missing food for a future stock deduction', () => {
    expect(() => assertBasketInventoryIdentity(basket(), beans, [])).toThrow(/cannot safely reference/);
  });
  it('uses the source inventory identity when a basket label is an older snapshot', () => {
    const renamed = [{ id: 1, name: 'Canned Beans', nameSearch: 'canned beans' }];
    expect(() => assertBasketInventoryIdentity(basket(), renamed, renamed)).not.toThrow();
  });
  it('falls back to the line name for an artifact with no inventory section', () => {
    expect(() => assertBasketInventoryIdentity(basket(), [], beans)).not.toThrow();
    expect(() => assertBasketInventoryIdentity(basket(), [], milk)).toThrow();
  });
  it('preserves packed and delivered history after its food was deleted', () => {
    for (const status of ['packed', 'delivered']) {
      expect(() => assertBasketInventoryIdentity(basket(status), beans, [])).not.toThrow();
    }
  });
  it('refuses malformed pending basket lines', () => {
    expect(() => assertBasketInventoryIdentity([{ id: 7, status: 'draft', items: null }], beans, beans)).toThrow(/invalid items/);
    expect(() => assertBasketInventoryIdentity([{ id: 7, status: 'draft', items: [null] }], beans, beans)).toThrow(/cannot safely reference/);
  });
});
