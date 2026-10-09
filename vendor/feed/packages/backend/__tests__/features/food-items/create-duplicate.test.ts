import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma } from '@prisma/client';

/**
 * `POST /food-items` duplicate-name handling.
 *
 * When the unique constraint on `nameSearch` is violated, the route looks
 * up the existing item and returns it alongside a machine-readable
 * `code: 'DUPLICATE_FOOD_ITEM_NAME'` so the client can offer a one-click
 * "Mark In Stock" toast action. These tests cover that contract plus the
 * unchanged happy path.
 */

const mockTx = vi.hoisted(() => ({
  category: { findUnique: vi.fn() },
  foodItem: { create: vi.fn() },
  // The mutation service writes a 'created' ledger event in the same
  // transaction as the item create.
  foodItemInventoryEvent: { create: vi.fn().mockResolvedValue({}) },
}));

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  foodItem: { findUnique: vi.fn() },
}));

vi.mock('../../../src/db', () => ({ default: mockPrisma }));

vi.mock('../../../src/services/translation-trigger', () => ({
  translationTriggerService: { queueContentTranslation: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../../src/services/translation-auditor', () => ({
  translationAuditor: {},
}));

const makeP2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['nameSearch'] },
  });

const validBody = {
  name: 'Coca-Cola',
  limit: 5,
  categoryId: 6,
  statusFlags: { isInStock: false, isLimited: false, isClearance: false },
  dietaryFlags: {},
};

describe('POST /food-items duplicate-name handling', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Category lookup inside the transaction always succeeds for these tests.
    mockTx.category.findUnique.mockResolvedValue({ id: 6, name: 'Dry Goods' });
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx));

    app = express();
    app.use(express.json());
    const { default: foodItemsRouter } = await import('../../../src/routes/food-items');
    app.use('/food-items', foodItemsRouter);
    app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error.statusCode ?? 500).json({ error: { message: error.message } });
    });
  });

  test('duplicate name with an out-of-stock existing item returns the item and the duplicate code', async () => {
    mockTx.foodItem.create.mockRejectedValue(makeP2002());
    mockPrisma.foodItem.findUnique.mockResolvedValue({
      id: 44,
      name: 'Coca-Cola',
      nameSearch: 'coca-cola',
      limit: 5,
      limitType: 'person',
      categoryId: 6,
      isInStock: false,
      isLimited: false,
      isClearance: false,
      vegan: false, vegetarian: false, glutenFree: false,
      organic: false, halal: false, kosher: false, readyToEat: false,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const response = await request(app).post('/food-items').send(validBody).expect(400);

    expect(response.body.error.code).toBe('DUPLICATE_FOOD_ITEM_NAME');
    expect(response.body.error.message).toMatch(/already exists/i);
    expect(response.body.error.existingItem).toMatchObject({
      id: 44,
      statusFlags: { isInStock: false },
    });
    // The existing item is looked up by the normalized (lowercased) name.
    expect(mockPrisma.foodItem.findUnique).toHaveBeenCalledWith({
      where: { nameSearch: 'coca-cola' },
    });
  });

  test('duplicate name with an in-stock existing item still returns the code and item', async () => {
    mockTx.foodItem.create.mockRejectedValue(makeP2002());
    mockPrisma.foodItem.findUnique.mockResolvedValue({
      id: 45, name: 'Rice', nameSearch: 'rice', limit: 5, limitType: 'person', categoryId: 6,
      isInStock: true, isLimited: false, isClearance: false,
      vegan: false, vegetarian: false, glutenFree: false,
      organic: false, halal: false, kosher: false, readyToEat: false,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const response = await request(app)
      .post('/food-items')
      .send({ ...validBody, name: 'Rice' })
      .expect(400);

    expect(response.body.error.code).toBe('DUPLICATE_FOOD_ITEM_NAME');
    expect(response.body.error.existingItem).toMatchObject({
      id: 45,
      statusFlags: { isInStock: true },
    });
  });

  test('duplicate name with no recoverable existing item returns code with existingItem null', async () => {
    mockTx.foodItem.create.mockRejectedValue(makeP2002());
    mockPrisma.foodItem.findUnique.mockResolvedValue(null);

    const response = await request(app).post('/food-items').send(validBody).expect(400);

    expect(response.body.error.code).toBe('DUPLICATE_FOOD_ITEM_NAME');
    expect(response.body.error.existingItem).toBeNull();
  });

  test('successful create is unaffected (201 with the new item)', async () => {
    mockTx.foodItem.create.mockResolvedValue({
      id: 99, name: 'New Item', nameSearch: 'new item', limit: 5, limitType: 'person', categoryId: 6,
      isInStock: true, isLimited: false, isClearance: false,
      vegan: false, vegetarian: false, glutenFree: false,
      organic: false, halal: false, kosher: false, readyToEat: false,
      purchasePriceCents: 0, unitsPerPurchase: 1, estimatedQuantity: null,
      createdAt: new Date(), updatedAt: new Date(),
      // The service creates with include: { category: true } so the ledger
      // event can denormalize the category name.
      category: { id: 6, name: 'Dry Goods' },
    });

    const response = await request(app)
      .post('/food-items')
      .send({ ...validBody, name: 'New Item' })
      .expect(201);

    expect(response.body.foodItem).toMatchObject({ id: 99, name: 'New Item' });
    expect(mockPrisma.foodItem.findUnique).not.toHaveBeenCalled();
  });
});
