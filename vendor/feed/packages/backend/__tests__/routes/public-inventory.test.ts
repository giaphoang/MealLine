import { describe, expect, test, vi } from 'vitest';
import request from 'supertest';

const mockPrisma = vi.hoisted(() => ({
  language: {
    findMany: vi.fn(),
  },
  category: {
    findMany: vi.fn(),
  },
  translation: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../src/db', () => ({ default: mockPrisma }));

describe('GET /api/public/inventory.json', () => {
  test('returns public in-stock inventory grouped by category without authentication', async () => {
    mockPrisma.language.findMany.mockResolvedValue([
      { name: 'Spanish' },
      { name: 'Arabic' },
    ]);
    mockPrisma.category.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Produce',
        translations: [
          { language: 'Spanish', name: 'Frutas y verduras' },
          { language: 'Arabic', name: 'منتجات زراعية' },
        ],
        icon: 'apple',
        limit: 2,
        limitType: 'household',
        foodItems: [
          {
            id: 10,
            name: 'Apples',
            translations: [
              { language: 'Spanish', name: 'Manzanas' },
              { language: 'Arabic', name: 'تفاح' },
            ],
            limit: 1,
            limitType: 'person',
            isLimited: true,
            isClearance: false,
            vegan: true,
            vegetarian: true,
            glutenFree: true,
            organic: false,
            halal: false,
            kosher: true,
            readyToEat: true,
            updatedAt: new Date('2026-05-24T12:00:00.000Z'),
          },
        ],
      },
      {
        id: 2,
        name: 'Empty Category',
        translations: [],
        icon: 'package',
        limit: 10,
        limitType: 'household',
        foodItems: [],
      },
    ]);
    mockPrisma.translation.findMany.mockResolvedValue([]);

    const { default: createServer } = await import('../../src/server');
    const app = createServer();

    const response = await request(app)
      .get('/api/public/inventory.json')
      .set('Origin', 'https://lotto.example.org')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body).toMatchObject({
      languages: ['Spanish', 'Arabic'],
      totals: {
        categories: 1,
        foodItems: 1,
      },
      categories: [
        {
          id: 1,
          name: 'Produce',
          translations: {
            Spanish: 'Frutas y verduras',
            Arabic: 'منتجات زراعية',
          },
          icon: 'apple',
          limit: 2,
          limitType: 'household',
          itemCount: 1,
          items: [
            {
              id: 10,
              name: 'Apples',
              translations: {
                Spanish: 'Manzanas',
                Arabic: 'تفاح',
              },
              limit: 1,
              limitType: 'person',
              statusTags: {
                inStock: true,
                limited: true,
                clearance: false,
              },
              dietaryFlags: {
                vegan: true,
                vegetarian: true,
                glutenFree: true,
                organic: false,
                halal: false,
                kosher: true,
                readyToEat: true,
              },
              updatedAt: '2026-05-24T12:00:00.000Z',
            },
          ],
        },
      ],
    });
    expect(response.body.generatedAt).toEqual(expect.any(String));
    expect(response.body.version).toEqual(expect.any(String));
    expect(mockPrisma.language.findMany).toHaveBeenCalledWith({
      where: { isEnabled: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        name: true,
      },
    });
    expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
      include: {
        translations: {
          where: {
            language: { in: ['Spanish', 'Arabic'] },
          },
          select: {
            language: true,
            name: true,
          },
        },
        foodItems: {
          where: { isInStock: true },
          include: {
            translations: {
              where: {
                language: { in: ['Spanish', 'Arabic'] },
              },
              select: {
                language: true,
                name: true,
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  });

  test('fills denormalized translation gaps from the completed generic Translation cache, denormalized winning', async () => {
    mockPrisma.language.findMany.mockResolvedValue([
      { name: 'Spanish' },
      { name: 'Arabic' },
    ]);
    mockPrisma.category.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Canned Goods',
        // Denormalized CategoryTranslation has only Spanish; Arabic is a gap.
        translations: [{ language: 'Spanish', name: 'Productos enlatados (denorm)' }],
        icon: 'package',
        limit: 2,
        limitType: 'household',
        foodItems: [
          {
            id: 10,
            name: 'Black Beans',
            // No denormalized rows at all; both must come from the generic cache.
            translations: [],
            limit: 100,
            limitType: 'person',
            isLimited: false,
            isClearance: false,
            vegan: true,
            vegetarian: true,
            glutenFree: true,
            organic: false,
            halal: false,
            kosher: false,
            readyToEat: false,
            updatedAt: new Date('2026-05-24T12:00:00.000Z'),
          },
        ],
      },
    ]);
    mockPrisma.translation.findMany.mockImplementation((args: { where: { type: string } }) => {
      if (args.where.type === 'Category') {
        return Promise.resolve([
          { originalText: 'Canned Goods', language: 'Arabic', translatedText: 'معلبات' },
          // Spanish exists in the generic cache too, but the denormalized row must win.
          { originalText: 'Canned Goods', language: 'Spanish', translatedText: 'GENERIC SHOULD LOSE' },
        ]);
      }
      if (args.where.type === 'FoodItem') {
        return Promise.resolve([
          { originalText: 'Black Beans', language: 'Spanish', translatedText: 'Frijoles negros' },
          // Null translatedText must be skipped, so Arabic stays absent for this item.
          { originalText: 'Black Beans', language: 'Arabic', translatedText: null },
        ]);
      }
      return Promise.resolve([]);
    });

    const { default: createServer } = await import('../../src/server');
    const app = createServer();

    const response = await request(app).get('/api/public/inventory.json').expect(200);

    const category = response.body.categories[0];
    expect(category.translations).toEqual({
      Spanish: 'Productos enlatados (denorm)',
      Arabic: 'معلبات',
    });
    expect(category.items[0].translations).toEqual({
      Spanish: 'Frijoles negros',
    });

    // Only completed rows are queried, so failed/pending error strings cannot leak.
    expect(mockPrisma.translation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'Category',
          status: 'completed',
          language: { in: ['Spanish', 'Arabic'] },
          originalText: { in: ['Canned Goods'] },
        }),
      })
    );
    expect(mockPrisma.translation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'FoodItem',
          status: 'completed',
          originalText: { in: ['Black Beans'] },
        }),
      })
    );
  });
});
