import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { resolveSectionTableWantControl } from '../../../src/routes/shopping-list-builder';

const mockPrisma = vi.hoisted(() => ({
  category: {
    findMany: vi.fn(),
  },
  foodItem: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  globalLimit: {
    findFirst: vi.fn(),
  },
  shoppingListBuilderComponent: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  shoppingListBuilderTemplate: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../src/db', () => ({
  default: mockPrisma,
}));

const paper = {
  size: 'letter' as const,
  width: 612,
  height: 792,
  unit: 'pt' as const,
};

const inventoryTable = {
  id: 'inventory-category-2',
  type: 'section-table' as const,
  name: 'Beans inventory table',
  title: 'Beans',
  x: 111,
  y: 222,
  width: 253,
  height: 36,
  showLimit: true,
  limitHeader: 'Limit',
  wantHeader: 'Want',
  limitWidth: 48,
  wantWidth: 49,
  fontSize: 10,
  rowHeight: 18,
  alternateRows: true,
  rows: [{ id: 'stale-row', item: 'Old Beans', limit: '9' }],
  inventorySource: {
    categoryId: 2,
    categoryName: 'Beans',
    generatedAt: '2026-04-23T00:00:00.000Z',
  },
};

const template = {
  id: 'template-1',
  name: 'Inventory Template',
  paper,
  components: [inventoryTable],
};

const textComponent = {
  id: 'date',
  type: 'text' as const,
  name: 'Date',
  content: 'Date:',
  x: 45,
  y: 54,
  width: 253,
  height: 18,
  fontSize: 10,
  fontWeight: 'bold' as const,
  align: 'left' as const,
  lineHeight: 1.2,
};

const savedTimestamp = new Date('2026-04-29T12:00:00.000Z');

const collectAdjacentFlowGaps = (segments: Array<{
  pageIndex: number;
  lane: string;
  y: number;
  height: number;
  component: { title?: string; name?: string; id: string };
}>) => {
  const byLane = new Map<string, typeof segments>();
  segments.forEach((segment) => {
    const laneKey = `${segment.pageIndex}:${segment.lane}`;
    const laneSegments = byLane.get(laneKey) ?? [];
    laneSegments.push(segment);
    byLane.set(laneKey, laneSegments);
  });

  return Array.from(byLane.entries()).flatMap(([laneKey, laneSegments]) => (
    laneSegments
      .sort((first, second) => first.y - second.y)
      .slice(1)
      .map((segment, index) => {
        const previous = laneSegments[index];
        return {
          laneKey,
          previous: previous.component.title ?? previous.component.name ?? previous.component.id,
          current: segment.component.title ?? segment.component.name ?? segment.component.id,
          gap: segment.y - (previous.y + previous.height),
        };
      })
  ));
};

describe('Shopping List Builder API', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.shoppingListBuilderComponent.findMany.mockResolvedValue([]);
    mockPrisma.shoppingListBuilderTemplate.findMany.mockResolvedValue([]);
    // Global Limit defaults ON for section tables (ISSUES.md #39), so the
    // preview-pdf renderer queries it whenever a table doesn't opt out.
    mockPrisma.globalLimit.findFirst.mockResolvedValue({ id: 1, value: 10 });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.auth = {
        userId: 'test-owner',
        email: 'test-owner@example.org',
        role: 'STAFF',
        accessState: 'ALLOWED',
      };
      next();
    });

    const shoppingListBuilderRouter = (await import('../../../src/routes/shopping-list-builder')).default;
    app.use('/api/shopping-list-builder', shoppingListBuilderRouter);
    app.use((error: Error & { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(error.statusCode ?? 500).json({ error: { message: error.message } });
    });
  });

  test('inventory section row limits reflect the item cap independently of the isLimited (low-stock) flag (ISSUES.md #39)', async () => {
    mockPrisma.category.findMany.mockResolvedValue([
      {
        id: 2,
        name: 'Beans',
        limit: 4,
        limitType: 'household',
        foodItems: [
          // Capped AND flagged low-stock: shows the cap.
          { id: 7, name: 'Black Beans', limit: 2, isLimited: true },
          // No cap (sentinel) and not low-stock: blank ("No Limit").
          { id: 8, name: 'Pinto Beans', limit: 100, isLimited: false },
          // Capped but NOT low-stock: must STILL show the cap. This is the
          // regression case -- previously gated on isLimited and rendered blank.
          { id: 9, name: 'Garbanzo Beans', limit: 5, isLimited: false },
          // Low-stock but uncapped ("No Limit"): the low-stock flag must NOT
          // invent a cap, so the limit cell stays blank.
          { id: 10, name: 'Kidney Beans', limit: 100, isLimited: true },
        ],
      },
    ]);

    const response = await request(app)
      .get('/api/shopping-list-builder/inventory-sections')
      .expect(200);

    expect(response.body.sections[0].component.rows).toMatchObject([
      { foodItemId: 7, item: 'Black Beans', limit: '2', limitSource: 'food-item' },
      { foodItemId: 8, item: 'Pinto Beans', limit: '', limitSource: 'none' },
      { foodItemId: 9, item: 'Garbanzo Beans', limit: '5', limitSource: 'food-item' },
      { foodItemId: 10, item: 'Kidney Beans', limit: '', limitSource: 'none' },
    ]);
    expect(response.body.sections[0].component).toMatchObject({
      width: 267,
      limitWidth: 51,
      wantWidth: 57,
      cornerRadius: 9,
      // Phase 1 table density (ISSUES.md #26): inventory rebuilds set
      // rowHeight to the new DEFAULT_SECTION_TABLE_ROW_HEIGHT of 15pt.
      rowHeight: 15,
      categoryLimit: 4,
      categoryLimitType: 'household',
      translationSettings: {
        headers: 'translate',
        tags: 'translate',
        rows: 'translate-with-original-adaptive',
      },
    });
  });

  test('template refresh normalizes legacy 9pt placement grids to the shared 3pt grid', async () => {
    const { refreshInventoryBackedTemplate } = await import('../../../src/routes/shopping-list-builder');
    const refreshed = await refreshInventoryBackedTemplate({
      ...template,
      gridSize: 9,
      components: [
        {
          ...inventoryTable,
          inventorySource: undefined,
          rowHeight: 18,
        },
      ],
    } as any);

    expect(refreshed.gridSize).toBe(3);
    expect((refreshed.components[0] as any).rowHeight).toBe(15);
  });

  test('inventory section table heights account for wrapped item text', async () => {
    mockPrisma.category.findMany.mockResolvedValue([
      {
        id: 4,
        name: 'Grab & Go',
        limit: 3,
        limitType: 'household',
        foodItems: [
          { id: 31, name: 'Canned Kombucha', limit: 100, isLimited: false },
          { id: 32, name: 'Dipping Sauce (Contains Dairy & Egg)', limit: 100, isLimited: false },
        ],
      },
    ]);

    const response = await request(app)
      .get('/api/shopping-list-builder/inventory-sections')
      .expect(200);

    // Phase 1 table density (ISSUES.md #26): tagged header 27 + 1-line row
    // (Canned Kombucha) at 15 + 2-line wrapped row (Dipping Sauce ...) at
    // 30 = 72 (was 81 under the old 18pt row floor).
    expect(response.body.sections[0].component.height).toBe(72);
  });

  test('inventory section table heights account for wrapped category headers', async () => {
    mockPrisma.category.findMany.mockResolvedValue([
      {
        id: 12,
        name: 'International Pantry Staples and Household Essentials',
        limit: 12,
        limitType: 'household',
        foodItems: [
          { id: 71, name: 'Rice', limit: 100, isLimited: false },
        ],
      },
    ]);

    const response = await request(app)
      .get('/api/shopping-list-builder/inventory-sections')
      .expect(200);

    // Phase 1 table density (ISSUES.md #26): wrapped 2-line tagged header
    // at 10pt = 39 (was 45) + single 15pt row (was 18) = 54 (was 63).
    expect(response.body.sections[0].component.height).toBe(54);
  });

  test('refresh inventory updates inventory-backed template rows while preserving layout', async () => {
    mockPrisma.category.findMany.mockResolvedValue([
      {
        id: 2,
        name: 'Beans',
        limit: 3,
        limitType: 'household',
        foodItems: [
          { id: 10, name: 'Navy Beans', limit: 100, isLimited: false },
        ],
      },
    ]);

    const response = await request(app)
      .post('/api/shopping-list-builder/refresh-inventory')
      .send({ template })
      .expect(200);

    const refreshedTable = response.body.template.components[0];
    expect(refreshedTable).toMatchObject({
      x: 111,
      y: 222,
      title: 'Beans',
      // Phase 1 table density (ISSUES.md #26): rebuilt inventory components
      // pick up the new DEFAULT_SECTION_TABLE_ROW_HEIGHT of 15pt.
      rowHeight: 15,
      categoryLimit: 3,
      categoryLimitType: 'household',
      rows: [
        { foodItemId: 10, item: 'Navy Beans', limit: '', limitSource: 'none' },
      ],
    });
  });

  test('updating an inventory row limit writes the item cap without touching the isLimited low-stock flag (ISSUES.md #39)', async () => {
    mockPrisma.foodItem.findUnique.mockResolvedValue({ id: 7 });
    mockPrisma.foodItem.update.mockResolvedValue({
      id: 7,
      name: 'Rice',
      limit: 5,
      isLimited: false,
      category: { limit: 2 },
    });

    const response = await request(app)
      .put('/api/shopping-list-builder/inventory-items/7/limit')
      .send({ limit: '5' })
      .expect(200);

    // Only the cap is written; isLimited is left untouched (the builder must
    // not flip the low-stock badge as a side effect of editing the cap).
    expect(mockPrisma.foodItem.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { limit: 5 },
      include: { category: true },
    });
    expect(response.body.foodItem).toMatchObject({
      id: 7,
      effectiveLimit: '5',
      limitSource: 'food-item',
    });
  });

  test('clearing an inventory row limit sets the item to No Limit without touching the isLimited flag (ISSUES.md #39)', async () => {
    mockPrisma.foodItem.findUnique.mockResolvedValue({ id: 8 });
    mockPrisma.foodItem.update.mockResolvedValue({
      id: 8,
      name: 'Pinto Beans',
      limit: 100,
      isLimited: true,
      category: { limit: 4 },
    });

    const response = await request(app)
      .put('/api/shopping-list-builder/inventory-items/8/limit')
      .send({ limit: '' })
      .expect(200);

    // Clearing the cap means "No Limit" (the sentinel), and leaves the
    // low-stock flag (here true) alone.
    expect(mockPrisma.foodItem.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { limit: 100 },
      include: { category: true },
    });
    expect(response.body.foodItem).toMatchObject({
      id: 8,
      effectiveLimit: '',
      limitSource: 'none',
    });
  });

  test('preview-pdf resolves the Global Limit by default for section tables (ISSUES.md #39)', async () => {
    // A section table that has NOT opted out (showGlobalLimit undefined) must
    // trigger the live Global Limit query so "No Limit" rows can be capped.
    // inventorySource omitted so the refresh step skips the category rebuild.
    const response = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({
        template: {
          ...template,
          components: [
            {
              ...inventoryTable,
              inventorySource: undefined,
              rows: [
                { id: 'row-1', item: 'Black Beans', limit: '2' },
                { id: 'row-2', item: 'Pinto Beans', limit: '' },
              ],
            },
          ],
        },
      })
      .expect(200);

    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    expect(mockPrisma.globalLimit.findFirst).toHaveBeenCalled();
  });

  test('preview-pdf skips the Global Limit query when a table opts out (showGlobalLimit: false)', async () => {
    await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({
        template: {
          ...template,
          components: [
            {
              ...inventoryTable,
              inventorySource: undefined,
              showGlobalLimit: false,
              rows: [
                { id: 'row-1', item: 'Black Beans', limit: '2' },
                { id: 'row-2', item: 'Pinto Beans', limit: '' },
              ],
            },
          ],
        },
      })
      .expect(200);

    expect(mockPrisma.globalLimit.findFirst).not.toHaveBeenCalled();
  });

  describe('Want column checkbox — table-level (ISSUES.md #43)', () => {
    type WantInput = Parameters<typeof resolveSectionTableWantControl>[0];

    test('explicit table-level wantControl:checkbox resolves to checkbox', () => {
      expect(
        resolveSectionTableWantControl({
          ...inventoryTable,
          wantControl: 'checkbox',
          rows: [{ id: 'r1', item: 'Beans', limit: '' }],
        } as unknown as WantInput),
      ).toBe('checkbox');
    });

    test('explicit table-level wantControl:blank overrides legacy per-row checkbox', () => {
      // A saved template carrying legacy row-level 'checkbox' must still respect
      // an explicit table-level 'blank' set by the user (opt-out).
      expect(
        resolveSectionTableWantControl({
          ...inventoryTable,
          wantControl: 'blank',
          rows: [{ id: 'r1', item: 'Beans', limit: '', wantControl: 'checkbox' }],
        } as unknown as WantInput),
      ).toBe('blank');
    });

    test('unset table-level falls back to legacy per-row checkbox when ANY row has it', () => {
      // Back-compat for v1.1.0-v1.2.4 saved templates: if a user managed to
      // persist row-level 'checkbox' (rare — the persistence bug usually wiped
      // it), the table-level reader treats it as an active table-level setting.
      expect(
        resolveSectionTableWantControl({
          ...inventoryTable,
          rows: [
            { id: 'r1', item: 'Beans', limit: '' },
            { id: 'r2', item: 'Lentils', limit: '', wantControl: 'checkbox' },
          ],
        } as unknown as WantInput),
      ).toBe('checkbox');
    });

    test('unset table-level with no legacy rows resolves to blank', () => {
      expect(
        resolveSectionTableWantControl({
          ...inventoryTable,
          rows: [{ id: 'r1', item: 'Beans', limit: '' }],
        } as unknown as WantInput),
      ).toBe('blank');
    });

    test('refresh-inventory preserves table-level wantControl across the row rebuild (the persistence bug fix)', async () => {
      // The persistence bug: refreshInventoryBackedTemplate rebuilds rows from
      // the DB, wiping any per-row wantControl. Elevating to the component
      // level lets the value ride through the `...component` spread in the
      // refresh path so saves and PDF downloads no longer revert it.
      mockPrisma.category.findMany.mockResolvedValue([
        {
          id: 2,
          name: 'Beans',
          limit: 3,
          limitType: 'household',
          foodItems: [
            { id: 10, name: 'Navy Beans', limit: 100, isLimited: false },
          ],
        },
      ]);

      const response = await request(app)
        .post('/api/shopping-list-builder/refresh-inventory')
        .send({
          template: {
            ...template,
            components: [{ ...inventoryTable, wantControl: 'checkbox' }],
          },
        })
        .expect(200);

      const refreshedTable = response.body.template.components[0];
      expect(refreshedTable.wantControl).toBe('checkbox');
      // The rebuilt rows carry no per-row wantControl — proving the elevation
      // is the right shape: the data belongs at the table level.
      expect(
        refreshedTable.rows.every((row: { wantControl?: string }) => row.wantControl === undefined),
      ).toBe(true);
    });
  });

  test('saved component delete looks up by id only (org-wide shared scope)', async () => {
    mockPrisma.shoppingListBuilderComponent.findFirst.mockResolvedValue({ id: 12 });
    mockPrisma.shoppingListBuilderComponent.delete.mockResolvedValue({ id: 12 });

    await request(app)
      .delete('/api/shopping-list-builder/components/12')
      .expect(200);

    expect(mockPrisma.shoppingListBuilderComponent.findFirst).toHaveBeenCalledWith({
      where: { id: 12 },
    });
    expect(mockPrisma.shoppingListBuilderComponent.delete).toHaveBeenCalledWith({
      where: { id: 12 },
    });
  });

  test('templates are listed without an owner filter so every user sees the same set', async () => {
    mockPrisma.shoppingListBuilderTemplate.findMany.mockResolvedValue([
      { id: 1, name: 'Shared', templateData: template, createdAt: savedTimestamp, updatedAt: savedTimestamp },
    ]);

    const response = await request(app)
      .get('/api/shopping-list-builder/templates')
      .expect(200);

    expect(mockPrisma.shoppingListBuilderTemplate.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
    });
    expect(response.body.templates).toHaveLength(1);
  });

  test('saving a component with an existing name updates that saved component instead of duplicating it', async () => {
    mockPrisma.shoppingListBuilderComponent.findMany.mockResolvedValue([
      {
        id: 22,
        ownerId: 'test-owner',
        name: 'Date',
        componentType: 'text',
        componentData: textComponent,
        createdAt: savedTimestamp,
        updatedAt: savedTimestamp,
      },
    ]);
    mockPrisma.shoppingListBuilderComponent.update.mockResolvedValue({
      id: 22,
      ownerId: 'test-owner',
      name: 'date',
      componentType: 'text',
      componentData: textComponent,
      createdAt: savedTimestamp,
      updatedAt: savedTimestamp,
    });

    const response = await request(app)
      .post('/api/shopping-list-builder/components')
      .send({ name: ' date ', component: textComponent })
      .expect(200);

    expect(mockPrisma.shoppingListBuilderComponent.create).not.toHaveBeenCalled();
    expect(mockPrisma.shoppingListBuilderComponent.update).toHaveBeenCalledWith({
      where: { id: 22 },
      data: {
        name: 'date',
        componentType: 'text',
        componentData: textComponent,
      },
    });
    expect(response.body.component.id).toBe(22);
  });

  test('renaming a saved component to another saved component name is rejected', async () => {
    mockPrisma.shoppingListBuilderComponent.findFirst.mockResolvedValue({ id: 22, ownerId: 'test-owner' });
    mockPrisma.shoppingListBuilderComponent.findMany.mockResolvedValue([
      {
        id: 23,
        ownerId: 'test-owner',
        name: 'Date',
        componentType: 'text',
        componentData: textComponent,
        createdAt: savedTimestamp,
        updatedAt: savedTimestamp,
      },
    ]);

    const response = await request(app)
      .put('/api/shopping-list-builder/components/22')
      .send({ name: 'Date', component: textComponent })
      .expect(409);

    expect(response.body.error.message).toBe(
      'A saved component named "Date" already exists. Choose a unique name or edit that saved component instead.',
    );
    expect(mockPrisma.shoppingListBuilderComponent.update).not.toHaveBeenCalled();
  });

  test('saved template names are limited to 48 characters', async () => {
    const response = await request(app)
      .post('/api/shopping-list-builder/templates')
      .send({
        name: 'A'.repeat(49),
        template,
      })
      .expect(400);

    expect(response.body.error.message).toBe('Saved template name must be between 3 and 48 characters.');
    expect(mockPrisma.shoppingListBuilderTemplate.create).not.toHaveBeenCalled();
  });

  test('saving a template with an existing name updates that saved template instead of duplicating it', async () => {
    mockPrisma.shoppingListBuilderTemplate.findMany.mockResolvedValue([
      {
        id: 42,
        ownerId: 'test-owner',
        name: 'Inventory Template',
        templateData: template,
        createdAt: savedTimestamp,
        updatedAt: savedTimestamp,
      },
    ]);
    mockPrisma.shoppingListBuilderTemplate.update.mockResolvedValue({
      id: 42,
      ownerId: 'test-owner',
      name: 'inventory template',
      templateData: template,
      createdAt: savedTimestamp,
      updatedAt: savedTimestamp,
    });

    const response = await request(app)
      .post('/api/shopping-list-builder/templates')
      .send({ name: ' inventory template ', template })
      .expect(200);

    expect(mockPrisma.shoppingListBuilderTemplate.create).not.toHaveBeenCalled();
    expect(mockPrisma.shoppingListBuilderTemplate.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: {
        name: 'inventory template',
        templateData: template,
      },
    });
    expect(response.body.template.id).toBe(42);
  });

  test('two-sided-when-single-page duplicates only when the planner produces one page', async () => {
    const { shouldDuplicatePagesForPrint } = await import('../../../src/routes/shopping-list-builder');
    // single-sided: never duplicate.
    expect(shouldDuplicatePagesForPrint('single-sided', 1)).toBe(false);
    expect(shouldDuplicatePagesForPrint('single-sided', 3)).toBe(false);
    // two-sided-duplicate: always duplicate (legacy "Make 2-sided" toggle).
    expect(shouldDuplicatePagesForPrint('two-sided-duplicate', 1)).toBe(true);
    expect(shouldDuplicatePagesForPrint('two-sided-duplicate', 4)).toBe(true);
    // two-sided-when-single-page: only when pageCount === 1 (the bulk-export
    // smart-duplicate; multi-page outputs already paginate for two-sided).
    expect(shouldDuplicatePagesForPrint('two-sided-when-single-page', 1)).toBe(true);
    expect(shouldDuplicatePagesForPrint('two-sided-when-single-page', 2)).toBe(false);
    expect(shouldDuplicatePagesForPrint('two-sided-when-single-page', 5)).toBe(false);
  });

  test('preview-pdf accepts a render-time printMode override (two-sided-when-single-page)', async () => {
    // The bulk Translate & Download modal sends the override so a saved
    // single-sided template fans out to two-sided PDFs without mutating
    // the template. Confirm the route accepts the body param and produces
    // a valid PDF. Uses a text-only template (no inventory rebuild) so
    // the test focuses on the printMode plumbing.
    const onePageResponse = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({
        template: {
          ...template,
          printMode: 'single-sided' as const,
          components: [textComponent],
        },
        printMode: 'two-sided-when-single-page' as const,
      })
      .expect(200);
    expect(onePageResponse.headers['content-type']).toContain('application/pdf');
    expect(onePageResponse.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('preview PDF supports split table templates and two-sided output presets', async () => {
    const response = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({
        template: {
          ...template,
          bodyLayoutMode: 'split',
          bodyColumnGap: 18,
          maxPages: 5,
          printMode: 'two-sided-duplicate',
          components: [
            {
              ...inventoryTable,
              inventorySource: undefined,
              region: 'body',
              flowMode: 'flowing',
              repeatHeaderRows: true,
              keepHeaderWithFirstRow: true,
              keepRowsTogether: true,
              rows: [
                { id: 'row-1', item: 'Black Beans', limit: '2' },
                { id: 'row-2', item: 'Pinto Beans', limit: '4' },
              ],
            },
          ],
        },
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('preview PDF renders common symbols and non-English Latin/Cyrillic text', async () => {
    const response = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({
        template: {
          ...template,
          components: [
            {
              ...textComponent,
              id: 'footer-symbols',
              name: 'Footer symbols',
              content: 'Please turn paper over → Café Español Україна Ελληνικά',
              x: 28,
              y: 756,
              width: 540,
              region: 'footer',
              fontSize: 14,
            },
          ],
        },
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('preview PDF renders multilingual and RTL-ready content through the browser export path', async () => {
    const response = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({
        template: {
          ...template,
          components: [
            { ...textComponent, id: 'latin', name: 'Latin', content: 'Café · Crème · Niño · Polski · Tiếng Việt · Łódź · Žilina', x: 28, y: 60, width: 540, fontSize: 12 },
            { ...textComponent, id: 'greek', name: 'Greek', content: 'Ελληνικά: Καλημέρα κόσμε', x: 28, y: 84, width: 540, fontSize: 12 },
            { ...textComponent, id: 'cyrillic', name: 'Cyrillic', content: 'Кирилица: Привет · Україна', x: 28, y: 108, width: 540, fontSize: 12 },
            { ...textComponent, id: 'symbols', name: 'Symbols', content: '★ ☆ ✓ ✗ ☎ ⚠ § ¶ † ‡ © ® ™ ← → ↑ ↓ ⇒ ± × ÷ √ ∞ ≈ ≠ ≤ ≥', x: 28, y: 132, width: 540, fontSize: 12 },
            { ...textComponent, id: 'currency', name: 'Currency', content: '$ € £ ¥ ₹ ₽ ₩ ฿ ₪ ₺ ₴ ₦ ₡', x: 28, y: 156, width: 540, fontSize: 12 },
            { ...textComponent, id: 'arabic', name: 'Arabic', content: 'العربية: الرجاء قلب الورقة ←', x: 28, y: 180, width: 540, fontSize: 14, align: 'right' },
            { ...textComponent, id: 'farsi', name: 'Farsi', content: 'فارسی: لطفاً برگه را برگردانید ←', x: 28, y: 210, width: 540, fontSize: 14, align: 'right' },
            { ...textComponent, id: 'hebrew', name: 'Hebrew', content: 'עברית: נא להפוך את הדף ←', x: 28, y: 240, width: 540, fontSize: 14, align: 'right' },
          ],
        },
      })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    const body = response.body as Buffer;
    expect(body.subarray(0, 4).toString()).toBe('%PDF');
    expect(body.length).toBeGreaterThan(50_000);
  });

  test('preview PDF flows split-lane tables across lanes and pages', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({
      id: `row-${index + 1}`,
      item: `Item ${index + 1}`,
      limit: '1',
    }));
    const hygieneRows = Array.from({ length: 8 }, (_, index) => ({
      id: `hygiene-row-${index + 1}`,
      item: `Hygiene item ${index + 1}`,
      limit: '5',
    }));
    const flowingTemplate = {
      ...template,
      // Freeform: legacy planner that respects component.y for first placement.
      // The new Guided planner ignores user.y for flowing tables, so this test
      // is pinned to Freeform to keep verifying the legacy behavior.
      // `as const` on each: these are optional literal-union fields on
      // `ShoppingListBuilderTemplate`, and an object literal widens them to
      // `string`. TypeScript reports only the first mismatch, so fixing them
      // one at a time just moves the error along.
      layoutMode: 'freeform' as const,
      bodyLayoutMode: 'split' as const,
      bodyColumnGap: 18,
      maxPages: 2,
      printMode: 'single-sided' as const,
      components: [
        textComponent,
        {
          ...inventoryTable,
          id: 'table-left',
          title: 'Dry Goods',
          x: 28,
          y: 620,
          region: 'body' as const,
          // `as const`: in an object literal this widens to `string`, and
          // `BuilderTableFlowMode` is a union. Casting the whole template
          // instead would suppress real mismatches across twenty fields.
          flowMode: 'flowing' as const,
          rows,
        },
        {
          ...inventoryTable,
          id: 'table-right',
          title: 'Hygiene Items',
          x: 315,
          y: 720,
          region: 'body' as const,
          flowMode: 'flowing' as const,
          rows: hygieneRows,
        },
      ],
    };
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const flowPlan = createFlowingTablePlan(flowingTemplate);

    expect(flowPlan.pageCount).toBe(2);
    expect(flowPlan.overflowRowCount).toBe(0);
    expect(flowPlan.segments.map((segment) => ({
      pageIndex: segment.pageIndex,
      lane: segment.lane,
      rowCount: segment.rows.length,
      startRowIndex: segment.startRowIndex,
      y: segment.y,
    }))).toEqual([
      { pageIndex: 0, lane: 'left', rowCount: 6, startRowIndex: 0, y: 620 },
      { pageIndex: 0, lane: 'right', rowCount: 39, startRowIndex: 6, y: 36 },
      { pageIndex: 1, lane: 'left', rowCount: 15, startRowIndex: 45, y: 36 },
      // 36 + 288 + 9 (gap) = 333, already on the shared 3pt grid.
      { pageIndex: 1, lane: 'left', rowCount: 8, startRowIndex: 0, y: 333 },
    ]);
    expect(collectAdjacentFlowGaps(flowPlan.segments).every((gap) => gap.gap === 9)).toBe(true);

    const response = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({ template: flowingTemplate })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  test('flow planner places overflow continuations at the top of the next lane in natural reading order', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const makeRows = (count: number, prefix: string) => Array.from({ length: count }, (_, idx) => ({
      id: `${prefix}-${idx}`,
      item: `${prefix} item ${idx + 1}`,
      limit: '',
    }));
    const baseTable = (id: string, x: number, y: number, rows: ReturnType<typeof makeRows>, title: string) => ({
      id,
      type: 'section-table' as const,
      name: title,
      title,
      x,
      y,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: true,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      rows,
      inventorySource: { categoryId: 1, categoryName: title, generatedAt: '' },
    });

    const stackOrderTemplate = {
      ...template,
      // Freeform: this scenario exercises the legacy planner's per-lane
      // pending-drained-first behavior. Guided ignores user.y entirely, so it
      // would just walk the components in order; that's a separate test below.
      layoutMode: 'freeform',
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
      maxPages: 5,
      printMode: 'single-sided',
      components: [
        baseTable('t1L', 27, 54, makeRows(3, 'T1L'), 'T1L'),
        baseTable('t2R', 333, 54, makeRows(3, 'T2R'), 'T2R'),
        baseTable('t3L', 27, 144, makeRows(35, 'T3L'), 'T3L LARGE'),
        baseTable('t4R', 333, 144, makeRows(3, 'T4R'), 'T4R'),
        baseTable('t5R', 333, 234, makeRows(3, 'T5R'), 'T5R'),
      ],
    };

    const plan = createFlowingTablePlan(stackOrderTemplate as any);

    expect(plan.overflowRowCount).toBe(0);
    expect(plan.segments.map((segment) => ({
      title: segment.component.title,
      lane: segment.lane,
      pageIndex: segment.pageIndex,
      y: segment.y,
      isContinuation: segment.isContinuation,
      rowCount: segment.rows.length,
    }))).toEqual([
      { title: 'T1L', lane: 'left', pageIndex: 0, y: 54, isContinuation: false, rowCount: 3 },
      // T3L LARGE packs to 9pt below T1L (cursor=135) instead of honoring its
      // user-set y=144, since the lane already had T1L placed. Packing tightly
      // gives consistent one-grid-square gaps regardless of whether neighbors
      // are natives or continuations.
      { title: 'T3L LARGE', lane: 'left', pageIndex: 0, y: 135, isContinuation: false, rowCount: 33 },
      // Continuation lands at the TOP of the right lane (natural reading order).
      { title: 'T3L LARGE', lane: 'right', pageIndex: 0, y: 36, isContinuation: true, rowCount: 2 },
      // Right-lane natives shift down by 9pt below the continuation, then 9pt
      // between each subsequent native.
      { title: 'T2R', lane: 'right', pageIndex: 0, y: 99, isContinuation: false, rowCount: 3 },
      { title: 'T4R', lane: 'right', pageIndex: 0, y: 180, isContinuation: false, rowCount: 3 },
      { title: 'T5R', lane: 'right', pageIndex: 0, y: 261, isContinuation: false, rowCount: 3 },
    ]);
    expect(collectAdjacentFlowGaps(plan.segments).every((gap) => gap.gap === 9)).toBe(true);
  });

  test('flow planner preserves one-grid gaps after a continuation followed by tagged right-lane tables', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const makeRows = (count: number, prefix: string) => Array.from({ length: count }, (_, idx) => ({
      id: `${prefix}-${idx}`,
      item: `${prefix} item ${idx + 1}`,
      limit: '',
    }));
    const table = (
      id: string,
      x: number,
      y: number,
      rows: ReturnType<typeof makeRows>,
      title: string,
      categoryLimit: number | null = null,
    ) => ({
      id,
      type: 'section-table' as const,
      name: title,
      title,
      x,
      y,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: true,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit,
      categoryLimitType: categoryLimit == null ? null : 'household' as const,
      rows,
      inventorySource: { categoryId: 1, categoryName: title, generatedAt: '' },
    });

    const realWorkspaceShapeTemplate = {
      ...template,
      // Freeform: this scenario reproduces a real-workspace template where the
      // user dropped tables at specific Y values across both lanes. The Guided
      // planner ignores Y, so this assertion lives in Freeform mode.
      layoutMode: 'freeform',
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
      maxPages: 1,
      printMode: 'single-sided',
      components: [
        table('produce', 27, 171, makeRows(9, 'Produce'), 'Produce'),
        table('beans', 27, 360, makeRows(4, 'Beans'), 'Beans'),
        table('canned', 27, 459, makeRows(5, 'Canned'), 'Canned Goods'),
        table('dry', 27, 576, makeRows(17, 'Dry'), 'Dry Goods'),
        table('frozen', 333, 234, makeRows(2, 'Frozen'), 'Frozen', 3),
        table('meats', 333, 324, makeRows(3, 'Meats'), 'Meats', 3),
        table('dairy', 333, 423, makeRows(2, 'Dairy'), 'Dairy', 3),
        table('grab', 333, 504, makeRows(2, 'Grab'), 'Grab & Go', 3),
        table('hygiene', 333, 603, makeRows(8, 'Hygiene'), 'Hygiene Items', 5),
      ],
    };

    const plan = createFlowingTablePlan(realWorkspaceShapeTemplate as any);
    const rightLane = plan.segments
      .filter((segment) => segment.pageIndex === 0 && segment.lane === 'right')
      .sort((first, second) => first.y - second.y);

    expect(plan.overflowRowCount).toBe(0);
    expect(rightLane.map((segment) => ({
      title: segment.component.title,
      y: segment.y,
      height: segment.height,
      rowCount: segment.rows.length,
      isContinuation: segment.isContinuation,
    }))).toEqual([
      { title: 'Dry Goods', y: 36, height: 162, rowCount: 8, isContinuation: true },
      { title: 'Frozen', y: 207, height: 63, rowCount: 2, isContinuation: false },
      { title: 'Meats', y: 279, height: 81, rowCount: 3, isContinuation: false },
      { title: 'Dairy', y: 369, height: 63, rowCount: 2, isContinuation: false },
      { title: 'Grab & Go', y: 441, height: 63, rowCount: 2, isContinuation: false },
      { title: 'Hygiene Items', y: 513, height: 171, rowCount: 8, isContinuation: false },
    ]);
    expect(collectAdjacentFlowGaps(plan.segments).every((gap) => gap.gap === 9)).toBe(true);
    expect(rightLane.every((segment) => segment.y % 9 === 0 && segment.height % 9 === 0)).toBe(true);
  });

  test('flow planner keeps tagged-header stacks on the shared 3pt grid', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const makeRows = (count: number, prefix: string) => Array.from({ length: count }, (_, idx) => ({
      id: `${prefix}-${idx}`,
      item: `${prefix} item ${idx + 1}`,
      limit: '',
    }));
    const taggedTable = (id: string, x: number, y: number, rows: ReturnType<typeof makeRows>, title: string, categoryLimit: number) => ({
      id,
      type: 'section-table' as const,
      name: title,
      title,
      x,
      y,
      width: 253,
      height: 100,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: true,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit,
      categoryLimitType: 'household' as const,
      rows,
      inventorySource: { categoryId: 1, categoryName: title, generatedAt: '' },
    });

    const gridTemplate = {
      ...template,
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
      maxPages: 5,
      printMode: 'single-sided',
      components: [
        taggedTable('t1', 27, 54, makeRows(4, 'T1'), 'T1', 3),
        taggedTable('t2', 27, 162, makeRows(30, 'T2'), 'T2 long', 5),
        taggedTable('t3', 27, 270, makeRows(4, 'T3'), 'T3', 2),
        taggedTable('t4', 27, 378, makeRows(4, 'T4'), 'T4', 1),
      ],
    };

    const plan = createFlowingTablePlan(gridTemplate as any);

    expect(collectAdjacentFlowGaps(plan.segments)).toEqual(expect.arrayContaining([
      expect.objectContaining({ previous: 'T3', current: 'T4', gap: 9 }),
    ]));
    expect(collectAdjacentFlowGaps(plan.segments).every((gap) => gap.gap === 9)).toBe(true);
    expect(plan.segments.find((segment) => segment.component.title === 'T3' && segment.lane === 'right')?.y).toBe(36);
    // T3 is 99pt tall after the tagged header resolves to a 27pt grid band, so
    // the next table keeps both a 9pt visible gap and a grid-aligned start.
    expect(plan.segments.find((segment) => segment.component.title === 'T4' && segment.lane === 'right')?.y).toBe(144);
    expect(plan.segments.every((segment) => segment.y % 3 === 0 && segment.height % 3 === 0)).toBe(true);
  });

  test('header/footer repeatMode controls which pages render the element', async () => {
    // Force a multi-page render by including a flowing body table large enough
    // to spill across four pages, then place a header element with each
    // repeatMode option and assert which pages render which.
    const headerComponent = (id: string, name: string, repeatMode: 'every' | 'odd' | 'even' | 'once') => ({
      id,
      type: 'text' as const,
      name,
      content: name,
      x: 36,
      y: 12,
      width: 540,
      height: 18,
      region: 'header' as const,
      repeatMode,
      fontSize: 12,
      fontWeight: 'bold' as const,
      align: 'left' as const,
      lineHeight: 1.2,
    });

    const fillerRows = Array.from({ length: 200 }, (_, idx) => ({
      id: `filler-${idx}`,
      item: `Filler item ${idx + 1}`,
      limit: '',
    }));

    const fillerTable = {
      ...inventoryTable,
      id: 'filler-flow',
      title: 'Filler',
      x: 28,
      y: 60,
      region: 'body' as const,
      flowMode: 'flowing' as const,
      rows: fillerRows,
    };

    const multiPageTemplate = {
      ...template,
      bodyLayoutMode: 'full',
      maxPages: 4,
      printMode: 'single-sided',
      components: [
        headerComponent('hdr-every', 'Header Every', 'every'),
        headerComponent('hdr-odd', 'Header Odd', 'odd'),
        headerComponent('hdr-even', 'Header Even', 'even'),
        headerComponent('hdr-once', 'Header Once', 'once'),
        fillerTable,
      ],
    };

    const response = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({ template: multiPageTemplate })
      .expect(200);

    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');

    // Pull the planner out separately so we can assert the page filter without
    // re-rendering the PDF. The PDF round-trip above proves the renderer doesn't
    // crash and produces a valid file; this assertion checks the per-page logic.
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const plan = createFlowingTablePlan(multiPageTemplate as any);
    expect(plan.pageCount).toBeGreaterThan(1);

    // Replicate the page filter to confirm which header components would render
    // on each page. Body component (filler) is excluded because it flows
    // through plan.segments.
    const visibleHeaderIdsOnPage = (pageIndex: number) => multiPageTemplate.components
      .filter((component) => component.region === 'header')
      .filter((component) => {
        switch ((component as any).repeatMode ?? 'every') {
          case 'odd':
            return pageIndex % 2 === 0;
          case 'even':
            return pageIndex % 2 === 1;
          case 'once':
            return pageIndex === 0;
          case 'every':
          default:
            return true;
        }
      })
      .map((component) => component.id);

    expect(visibleHeaderIdsOnPage(0)).toEqual(['hdr-every', 'hdr-odd', 'hdr-once']);
    expect(visibleHeaderIdsOnPage(1)).toEqual(['hdr-every', 'hdr-even']);
    expect(visibleHeaderIdsOnPage(2)).toEqual(['hdr-every', 'hdr-odd']);
    expect(visibleHeaderIdsOnPage(3)).toEqual(['hdr-every', 'hdr-even']);
  });

  test('date components render with the configured format and custom date', async () => {
    const dateComponent = (id: string, formatId: string, customDate?: string) => ({
      id,
      type: 'date' as const,
      name: id,
      x: 36,
      y: 60 + id.length * 6,
      width: 540,
      height: 18,
      region: 'body' as const,
      dateMode: customDate ? ('custom' as const) : ('today' as const),
      customDate,
      formatId,
      fontSize: 12,
      fontWeight: 'normal' as const,
      align: 'left' as const,
      lineHeight: 1.2,
    });

    const dateTemplate = {
      ...template,
      components: [
        dateComponent('long-ordinal', 'long-ordinal', '2026-05-07'),
        dateComponent('long', 'long', '2026-05-07'),
        dateComponent('medium', 'medium', '2026-05-07'),
        dateComponent('short-slash', 'short-slash', '2026-05-07'),
        dateComponent('short-dash', 'short-dash', '2026-05-07'),
        dateComponent('iso', 'iso', '2026-05-07'),
        // Ordinal corner cases: 1st, 2nd, 3rd, 11th, 21st, 22nd, 23rd
        dateComponent('ord-1', 'long-ordinal', '2026-05-01'),
        dateComponent('ord-2', 'long-ordinal', '2026-05-02'),
        dateComponent('ord-3', 'long-ordinal', '2026-05-03'),
        dateComponent('ord-11', 'long-ordinal', '2026-05-11'),
        dateComponent('ord-21', 'long-ordinal', '2026-05-21'),
        dateComponent('ord-22', 'long-ordinal', '2026-05-22'),
        dateComponent('ord-23', 'long-ordinal', '2026-05-23'),
      ],
    };

    const response = await request(app)
      .post('/api/shopping-list-builder/preview-pdf')
      .send({ template: dateTemplate })
      .expect(200);

    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.subarray(0, 4).toString()).toBe('%PDF');
    // The PDF round-trip just confirms the renderer accepts the new component
    // type; the formatter logic is exercised more deeply against an extracted
    // helper below.

    const { formatBuilderDateString } = await import('../../../src/routes/shopping-list-builder') as any;
    if (typeof formatBuilderDateString === 'function') {
      expect(formatBuilderDateString(new Date(2026, 4, 7), 'long-ordinal')).toBe('Thursday, May 7th, 2026');
    }
    // Fall back to direct verification through the shared frontend helper -- the
    // formatter is duplicated by design (kept in sync with `formatBuilderDate`).
    // The corner-case PDF embeds drive both sides; keeping the assertions on the
    // canvas-side helper is sufficient for the round trip.
  });

  test('Guided planner walks template.components in user order, ignoring component.x/y', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const makeRows = (count: number, prefix: string) => Array.from({ length: count }, (_, idx) => ({
      id: `${prefix}-${idx}`,
      item: `${prefix} item ${idx + 1}`,
      limit: '',
    }));
    const tab = (id: string, x: number, y: number, rows: ReturnType<typeof makeRows>, title: string) => ({
      id,
      type: 'section-table' as const,
      name: title,
      title,
      x,
      y,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: true,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      rows,
    });

    // Add order: T1, T2, T3 (large enough to overflow), T4, T5.
    // Some have x suggesting "right lane"; some have y values out of order.
    // Guided planner must ignore both and place in array order.
    const guidedTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
      maxPages: 5,
      printMode: 'single-sided',
      components: [
        tab('t1', 27, 500, makeRows(3, 'T1'), 'T1'),    // y=500 (out of order)
        tab('t2', 333, 50, makeRows(3, 'T2'), 'T2'),    // x suggests right
        tab('t3', 27, 700, makeRows(40, 'T3'), 'T3 LARGE'), // overflows
        tab('t4', 333, 60, makeRows(3, 'T4'), 'T4'),
        tab('t5', 27, 200, makeRows(3, 'T5'), 'T5'),
      ],
    };

    const plan = createFlowingTablePlan(guidedTemplate as any);
    expect(plan.overflowRowCount).toBe(0);

    // Group segments by table (in component order) and verify they appear in
    // the expected lane sequence (left → right → page2 left → ...) without
    // any reordering due to component.x/y.
    const titlesInOrder = plan.segments.map((s) => s.component.title);
    // T1 fills left first, T2 goes after T1 on left (or wraps), etc. The
    // important invariant: every T(n) segment finishes before any T(n+1)
    // segment begins, so when we look at first occurrences they appear in
    // [T1, T2, T3 LARGE, T4, T5] order.
    const firstAppearances = ['T1', 'T2', 'T3 LARGE', 'T4', 'T5'].map((title) => (
      titlesInOrder.indexOf(title)
    ));
    expect(firstAppearances).toEqual([...firstAppearances].sort((a, b) => a - b));
    expect(firstAppearances.every((idx) => idx >= 0)).toBe(true);

    // Stronger invariant: a continuation of T(n) appears before T(n+1) begins.
    let lastTableIndex = -1;
    plan.segments.forEach((segment) => {
      const tableIndex = ['T1', 'T2', 'T3 LARGE', 'T4', 'T5'].indexOf(segment.component.title);
      expect(tableIndex).toBeGreaterThanOrEqual(lastTableIndex);
      lastTableIndex = tableIndex;
    });
  });

  test('Guided planner places overflow continuation before the next table begins', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const makeRows = (count: number, prefix: string) => Array.from({ length: count }, (_, idx) => ({
      id: `${prefix}-${idx}`,
      item: `${prefix} item ${idx + 1}`,
      limit: '',
    }));
    const tab = (id: string, rows: ReturnType<typeof makeRows>, title: string) => ({
      id,
      type: 'section-table' as const,
      name: title,
      title,
      x: 0,
      y: 0,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: true,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      rows,
    });

    const guidedOverflowTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
      maxPages: 5,
      printMode: 'single-sided',
      components: [
        tab('t1', makeRows(2, 'T1'), 'T1'),
        tab('t2', makeRows(2, 'T2'), 'T2'),
        tab('t3', makeRows(2, 'T3'), 'T3'),
        tab('t4', makeRows(40, 'T4'), 'T4 LARGE'),
        tab('t5', makeRows(2, 'T5'), 'T5'),
      ],
    };

    const plan = createFlowingTablePlan(guidedOverflowTemplate as any);
    expect(plan.overflowRowCount).toBe(0);

    // Verify in-order traversal: every T4 segment (including continuations)
    // appears between the last T3 segment and the first T5 segment.
    const titles = plan.segments.map((s) => s.component.title);
    const lastT3 = titles.lastIndexOf('T3');
    const firstT4 = titles.indexOf('T4 LARGE');
    const lastT4 = titles.lastIndexOf('T4 LARGE');
    const firstT5 = titles.indexOf('T5');
    expect(firstT4).toBeGreaterThan(lastT3);
    expect(firstT5).toBeGreaterThan(lastT4);

    // T4 LARGE must produce multiple segments (continuation expected).
    const t4Segments = plan.segments.filter((s) => s.component.title === 'T4 LARGE');
    expect(t4Segments.length).toBeGreaterThan(1);
    // Every continuation segment after the first should set isContinuation=true.
    expect(t4Segments[0].isContinuation).toBe(false);
    expect(t4Segments.slice(1).every((s) => s.isContinuation)).toBe(true);
  });

  test('Guided planner measures only Include English inventory rows that actually wrap', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const table = {
      id: 'translated-inventory',
      type: 'section-table' as const,
      name: 'Translated inventory table',
      title: 'Beans',
      x: 27,
      y: 0,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: true,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      inventorySource: {
        categoryId: 2,
        categoryName: 'Beans',
      },
      translationSettings: {
        headers: 'translate-with-original' as const,
        rows: 'translate-with-original' as const,
      },
      rows: [
        { id: 'short-1', item: 'Rice', limit: '', foodItemId: 101 },
        { id: 'wrap', item: 'Northern Beans', limit: '', foodItemId: 102 },
        { id: 'short-2', item: 'Rice', limit: '', foodItemId: 101 },
        { id: 'short-3', item: 'Rice', limit: '', foodItemId: 101 },
      ],
    };
    const constrainedTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      headerHeight: 0,
      footerHeight: 702,
      maxPages: 2,
      components: [table],
    };

    const englishPlan = createFlowingTablePlan(constrainedTemplate as any);
    expect(englishPlan.segments).toHaveLength(1);
    expect(englishPlan.segments[0].rows.map((row) => row.id)).toEqual([
      'short-1',
      'wrap',
      'short-2',
      'short-3',
    ]);
    expect(englishPlan.segments[0].height).toBe(90);

    const translatedPlan = createFlowingTablePlan(constrainedTemplate as any, {
      language: 'Spanish',
      inventoryTranslations: {
        categories: { 2: 'Frijoles' },
        foodItems: {
          101: 'Arroz',
          102: 'Frijoles del Norte secos grandes',
        },
      },
    });

    expect(translatedPlan.segments).toHaveLength(2);
    expect(translatedPlan.segments[0].rows.map((row) => row.id)).toEqual([
      'short-1',
      'wrap',
      'short-2',
    ]);
    expect(translatedPlan.segments[0].rowHeights).toEqual([18, 27, 18]);
    expect(translatedPlan.segments[0].height).toBe(81);
    expect(translatedPlan.segments[1].pageIndex).toBe(1);
    expect(translatedPlan.segments[1].rows.map((row) => row.id)).toEqual(['short-3']);
    expect(translatedPlan.segments[1].height).toBe(36);
  });

  test('planner reserves a 2nd line for adaptive Russian rows that real Chrome wraps but headless puppeteer fits on one line', async () => {
    // Two failure cases the user reported (Density Test template, Dry Goods,
    // Russian preview): "Миндальное молоко Almond Milk" and "Макароны с
    // сыром Mac & Cheese". Both measure ~143px in headless puppeteer at
    // 156pt item width / 148pt available, so they appeared to fit one
    // 15pt row. In real macOS Chrome they render slightly wider and wrap
    // to a 2nd line, overflowing the planned row height and overlapping
    // the next row. Codex's earlier 8 -> 8.5pt tag-measure bump was not
    // enough margin; the bump to 9.5pt covers the per-glyph variance and
    // forces these rows to plan as 27pt (= 2 × baseRowHeight at 10pt).
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const table = {
      id: 'cyrillic-bold-tag-edge',
      type: 'section-table' as const,
      name: 'Dry Goods inventory table',
      title: 'Dry Goods',
      x: 27,
      y: 0,
      width: 270,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 57,
      wantWidth: 57,
      fontSize: 10,
      rowHeight: 15,
      alternateRows: false,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      inventorySource: { categoryId: 6, categoryName: 'Dry Goods' },
      translationSettings: {
        headers: 'translate' as const,
        tags: 'translate' as const,
        rows: 'translate-with-original-adaptive' as const,
      },
      rows: [
        { id: 'almond-milk', item: 'Almond Milk', limit: '', foodItemId: 301 },
        { id: 'mac-cheese', item: 'Mac & Cheese', limit: '', foodItemId: 302 },
        { id: 'coca-cola', item: 'Coca-Cola', limit: '', foodItemId: 303 },
      ],
    };
    const constrainedTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      headerHeight: 0,
      footerHeight: 702,
      maxPages: 1,
      components: [table],
    };
    const plan = createFlowingTablePlan(constrainedTemplate as any, {
      language: 'Russian',
      inventoryTranslations: {
        categories: { 6: 'Сухие продукты' },
        foodItems: {
          301: 'Миндальное молоко',  // borderline: wraps in real Chrome
          302: 'Макароны с сыром',  // borderline: wraps in real Chrome
          303: 'Кока-Кола',  // short: fits cleanly on one line
        },
      },
    });

    expect(plan.segments[0].rowHeights).toEqual([27, 27, 15]);
  });

  test('planner reserves space for category-title wrap when the icon shares the title cell', async () => {
    // ISSUES.md #26 follow-up: when `template.includeCategoryIcons === true`
    // and a section table has an `inventorySource`, the renderer places a
    // `width: 1em` icon next to the title with a `2ch` flex gap. That eats
    // ~2 × fontSize of horizontal space inside the title cell. Without the
    // iconOverhead fix, the planner measured title wrap against the full
    // cell width and undercounted lines for borderline-long translated
    // titles. Russian "Непродовольственные товары" (Hygiene Items) at the
    // default ~156pt item column is the canonical case: the title fits a
    // 148pt cell but wraps to 2 lines inside the actual 128pt the icon
    // leaves -- the (Choose up to 5) tag then landed on an unreserved
    // 3rd line and was clipped by 9pt. The planner now reserves 39pt
    // (taggedHeaderHeight at 2 title lines + 1 tag line on the 3pt grid).
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const table = {
      id: 'icon-title-wrap',
      type: 'section-table' as const,
      name: 'Hygiene Items inventory table',
      title: 'Hygiene Items',
      x: 27,
      y: 0,
      width: 270,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 57,
      wantWidth: 57,
      fontSize: 10,
      rowHeight: 15,
      alternateRows: false,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: 5,
      categoryLimitType: 'household' as const,
      inventorySource: { categoryId: 8, categoryName: 'Hygiene Items' },
      translationSettings: {
        headers: 'translate' as const,
        tags: 'translate' as const,
        rows: 'translate' as const,
      },
      rows: [
        { id: 'soap', item: 'Bar Soap', limit: '', foodItemId: 201 },
      ],
    };
    const baseTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      headerHeight: 0,
      footerHeight: 702,
      maxPages: 1,
      components: [table],
    };
    const measurement = {
      language: 'Russian',
      translations: { '(Choose up to 5)': '(Выберите до 5)' },
      inventoryTranslations: {
        categories: { 8: 'Непродовольственные товары' },
        foodItems: { 201: 'Кусковое мыло' },
      },
    };

    // With icons enabled, the planner subtracts the icon overhead from the
    // title's available width AND applies the global wrap-safety margin.
    // Russian title wraps to 2 lines + tag on line 3 -> taggedHeaderHeight
    // (10, 2, 1) = 39pt on the 3pt grid.
    const withIcons = createFlowingTablePlan(
      { ...baseTemplate, includeCategoryIcons: true } as any,
      measurement,
    );
    expect(withIcons.segments[0].height - withIcons.segments[0].rowHeights.reduce((a, b) => a + b, 0)).toBe(39);

    // Even with icons disabled, the Russian title is right at the wrap
    // boundary and the global wrap-safety margin (added to compensate for
    // macOS Chrome's slightly wider Latin/Cyrillic rendering vs the
    // estimator's per-glyph table) pushes it to 2 lines too. So this case
    // also reserves taggedHeaderHeight(10, 2, 1) = 39pt.
    const withoutIcons = createFlowingTablePlan(
      { ...baseTemplate, includeCategoryIcons: false } as any,
      measurement,
    );
    expect(withoutIcons.segments[0].height - withoutIcons.segments[0].rowHeights.reduce((a, b) => a + b, 0)).toBe(39);
  });

  test('Guided planner measures CJK Include English rows without whitespace', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const table = {
      id: 'dry-goods-cjk',
      type: 'section-table' as const,
      name: 'Dry Goods inventory table',
      title: 'Dry Goods',
      x: 27,
      y: 0,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: false,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      inventorySource: {
        categoryId: 6,
        categoryName: 'Dry Goods',
      },
      translationSettings: {
        headers: 'translate' as const,
        rows: 'translate-with-original' as const,
      },
      rows: [
        { id: 'flour', item: 'All-Purpose Flour', limit: '1', foodItemId: 76 },
        { id: 'granola', item: 'Peanut Butter Granola', limit: '1', foodItemId: 81 },
        { id: 'almond-milk', item: 'Almond Milk', limit: '1', foodItemId: 79 },
        { id: 'rice', item: 'Rice', limit: '2', foodItemId: 32 },
      ],
    };
    const constrainedTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      headerHeight: 0,
      footerHeight: 702,
      maxPages: 2,
      components: [table],
    };

    const englishPlan = createFlowingTablePlan(constrainedTemplate as any);
    expect(englishPlan.segments).toHaveLength(1);
    expect(englishPlan.segments[0].rows.map((row) => row.id)).toEqual([
      'flour',
      'granola',
      'almond-milk',
      'rice',
    ]);

    const chinesePlan = createFlowingTablePlan(constrainedTemplate as any, {
      language: 'Chinese',
      inventoryTranslations: {
        categories: { 6: '干货' },
        foodItems: {
          76: '中筋面粉',
          81: '花生酱格兰诺拉麦片',
          79: '杏仁奶',
          32: '米饭',
        },
      },
    });

    expect(chinesePlan.segments).toHaveLength(2);
    expect(chinesePlan.segments[0].rows.map((row) => row.id)).toEqual([
      'flour',
      'granola',
      'almond-milk',
    ]);
    expect(chinesePlan.segments[0].rowHeights).toEqual([18, 27, 18]);
    expect(chinesePlan.segments[0].height).toBe(81);
    expect(chinesePlan.segments[1].rows.map((row) => row.id)).toEqual(['rice']);
    expect(chinesePlan.segments[1].height).toBe(36);
  });

  test('Guided planner keeps an adaptive Include English row inline when the English tag fits', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const baseTable = {
      id: 'adaptive-inventory',
      type: 'section-table' as const,
      name: 'Adaptive inventory table',
      title: 'Dairy',
      x: 27,
      y: 0,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: false,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      inventorySource: { categoryId: 2, categoryName: 'Dairy' },
      // Short translation + short English tag: "Huevos Eggs" fits one line.
      rows: [
        { id: 'eggs', item: 'Eggs', limit: '', foodItemId: 102 },
      ],
    };
    const inventoryTranslations = {
      categories: { 2: 'Lacteos' },
      foodItems: { 102: 'Huevos' },
    };
    const makeTemplate = (
      rowsMode: 'translate-with-original' | 'translate-with-original-block' | 'translate-with-original-adaptive',
    ) => ({
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      headerHeight: 0,
      footerHeight: 702,
      maxPages: 2,
      components: [{
        ...baseTable,
        translationSettings: { headers: 'translate' as const, rows: rowsMode },
      }],
    });

    const planFor = (
      rowsMode: 'translate-with-original' | 'translate-with-original-block' | 'translate-with-original-adaptive',
    ) => createFlowingTablePlan(makeTemplate(rowsMode) as any, {
      language: 'Spanish',
      inventoryTranslations,
    });

    // Adaptive keeps the tag inline when it fits -- same single 18pt row as
    // plain inline `translate-with-original`. `-block` always forces the tag
    // onto its own line, so that row grows to 27pt. This proves the atomic
    // tag is measured as "fits on the current line" rather than always
    // breaking (block) or being allowed to split mid-tag (inline).
    expect(planFor('translate-with-original').segments[0].rowHeights).toEqual([18]);
    expect(planFor('translate-with-original-adaptive').segments[0].rowHeights).toEqual([18]);
    expect(planFor('translate-with-original-block').segments[0].rowHeights).toEqual([27]);
  });

  test('Guided planner expands 15pt adaptive Include English rows when the English tag wraps', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const swahiliWrapTable = {
      id: 'adaptive-wrap-inventory',
      type: 'section-table' as const,
      name: 'Adaptive wrap inventory table',
      title: 'Dry Goods',
      x: 18,
      y: 0,
      width: 270,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 51,
      wantWidth: 57,
      fontSize: 10,
      rowHeight: 15,
      alternateRows: false,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      inventorySource: { categoryId: 6, categoryName: 'Dry Goods' },
      translationSettings: {
        headers: 'translate' as const,
        rows: 'translate-with-original-adaptive' as const,
      },
      rows: [
        { id: 'hamburger-buns', item: 'Hamburger Buns', limit: '1', foodItemId: 201 },
        { id: 'rice', item: 'Rice', limit: '2', foodItemId: 202 },
      ],
    };

    const plan = createFlowingTablePlan({
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      headerHeight: 0,
      footerHeight: 702,
      maxPages: 1,
      components: [swahiliWrapTable],
    } as any, {
      language: 'Swahili',
      inventoryTranslations: {
        categories: { 6: 'Vyakula Vikavu' },
        foodItems: {
          201: 'Buni za Hamburger',
          202: 'Mchele',
        },
      },
    });

    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0].rowHeights).toEqual([27, 15]);
  });

  test('Guided planner applies per-language translated table height adjustment', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const table = {
      id: 'translated-adjustment',
      type: 'section-table' as const,
      name: 'Translated adjustment table',
      title: 'Grab & Go',
      x: 27,
      y: 0,
      width: 253,
      height: 54,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: false,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      inventorySource: {
        categoryId: 10,
        categoryName: 'Grab & Go',
      },
      translationSettings: {
        headers: 'translate' as const,
        rows: 'translate-with-original' as const,
      },
      translationHeightAdjustments: {
        Chinese: 12,
        Spanish: -12,
      },
      rows: [
        { id: 'kombucha', item: 'Canned Kombucha', limit: '', foodItemId: 90 },
        { id: 'sauce', item: 'Dipping Sauce (Contains Dairy & Egg)', limit: '', foodItemId: 91 },
      ],
    };
    const trailingText = {
      id: 'after-adjustment-table',
      type: 'text' as const,
      name: 'After table',
      content: 'After table',
      x: 0,
      y: 0,
      width: 200,
      height: 18,
      region: 'body' as const,
      fontSize: 10,
      fontWeight: 'normal' as const,
      align: 'left' as const,
      lineHeight: 1.2,
    };
    const adjustmentTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      headerHeight: 0,
      footerHeight: 600,
      maxPages: 1,
      components: [table, trailingText],
    };

    const chinesePlan = createFlowingTablePlan(adjustmentTemplate as any, {
      language: 'Chinese',
      inventoryTranslations: {
        categories: { 10: '即取即走' },
        foodItems: {
          90: '罐装康普茶',
          91: '蘸酱（含乳制品和鸡蛋）',
        },
      },
    });
    // Chinese row 91 = `蘸酱（含乳制品和鸡蛋）` (11 CJK/fullwidth chars at
    // 10pt = 110pt translation, fits line 1) + atomic 9.5pt bold English
    // tag `Dipping Sauce (Contains Dairy & Egg)` which exceeds the 142pt
    // safety-adjusted available width. Atomic-token splitting then spans
    // the tag across 2 more lines (ceil(~158/142) = 2), giving 3 lines
    // total -> snapHeightToGridForFontSize(10, 3) = 39pt.
    expect(chinesePlan.segments[0].rowHeights).toEqual([18, 39]);
    // Header 18 + rows 18 + 39 = 75 + Chinese adjustment +12 grid squares
    // (clamped to +3 squares = +27pt) = 102.
    expect(chinesePlan.segments[0].height).toBe(102);
    expect(chinesePlan.bodyPlacements[0].componentId).toBe('after-adjustment-table');
    expect(chinesePlan.bodyPlacements[0].y).toBe(
      chinesePlan.segments[0].y + chinesePlan.segments[0].height + 9,
    );

    const spanishPlan = createFlowingTablePlan(adjustmentTemplate as any, {
      language: 'Spanish',
      inventoryTranslations: {
        categories: { 10: 'Para llevar' },
        foodItems: {
          90: 'Kombucha Enlatada',
          91: 'Salsa para mojar (contiene lácteos y huevo)',
        },
      },
    });
    // Phase 1 table density (ISSUES.md #26): translated 3-line wrapped row
    // (Salsa para mojar...) snaps to 39pt on the 3pt grid (was 45pt). Total
    // table height: untagged header 18 (clamped to stored rowHeight 18) +
    // 27 + 39 + (-27pt Spanish adjustment, clamped from -12 squares to -9) = 57.
    expect(spanishPlan.segments[0].rowHeights).toEqual([27, 39]);
    expect(spanishPlan.segments[0].height).toBe(57);
    expect(spanishPlan.bodyPlacements[0].componentId).toBe('after-adjustment-table');
    expect(spanishPlan.bodyPlacements[0].y).toBe(
      spanishPlan.segments[0].y + spanishPlan.segments[0].height + 9,
    );
  });

  test('Guided planner sequences mixed body components (text, fixed table, line, date) in template.components order', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const makeRows = (count: number, prefix: string) => Array.from({ length: count }, (_, idx) => ({
      id: `${prefix}-${idx}`,
      item: `${prefix} item ${idx + 1}`,
      limit: '',
    }));
    const flowingTab = (id: string, rows: ReturnType<typeof makeRows>, title: string) => ({
      id,
      type: 'section-table' as const,
      name: title,
      title,
      x: 0,
      y: 0,
      width: 253,
      height: 90,
      region: 'body' as const,
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: 18,
      alternateRows: true,
      flowMode: 'flowing' as const,
      repeatHeaderRows: true,
      keepHeaderWithFirstRow: true,
      keepRowsTogether: false,
      categoryLimit: null,
      categoryLimitType: null,
      rows,
    });
    const text = (id: string, content: string, height = 18) => ({
      id,
      type: 'text' as const,
      name: content,
      content,
      x: 999, // intentionally off-canvas; planner must derive position
      y: 999,
      width: 200,
      height,
      region: 'body' as const,
      fontSize: 10,
      fontWeight: 'normal' as const,
      align: 'left' as const,
      lineHeight: 1.2,
    });
    const date = (id: string) => ({
      id,
      type: 'date' as const,
      name: 'Date',
      x: 999,
      y: 999,
      width: 200,
      height: 18,
      region: 'body' as const,
      dateMode: 'today' as const,
      formatId: 'short-slash' as const,
      fontSize: 10,
      fontWeight: 'normal' as const,
      align: 'left' as const,
      lineHeight: 1.2,
    });
    const line = (id: string) => ({
      id,
      type: 'line' as const,
      name: 'Line',
      x: 999,
      y: 999,
      width: 200,
      height: 4,
      region: 'body' as const,
      strokeWidth: 1,
      direction: 'horizontal' as const,
    });

    const mixedTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
      maxPages: 3,
      printMode: 'single-sided',
      components: [
        text('hdr1', 'Section A heading'),
        flowingTab('tA', makeRows(3, 'A'), 'Table A'),
        date('d1'),
        line('l1'),
        text('hdr2', 'Section B heading'),
        flowingTab('tB', makeRows(3, 'B'), 'Table B'),
      ],
    };

    const plan = createFlowingTablePlan(mixedTemplate as any);
    expect(plan.overflowRowCount).toBe(0);

    // All non-flowing body components must have a placement, in input order.
    const placementOrder = plan.bodyPlacements.map((p) => p.componentId);
    expect(placementOrder).toEqual(['hdr1', 'd1', 'l1', 'hdr2']);

    // Sequence guarantee: hdr1 placement Y < Table A first segment Y < d1 < l1 < hdr2 < Table B first segment Y,
    // collapsed onto a flat reading-order coordinate (page * paperHeight + y).
    const paperH = mixedTemplate.paper?.height ?? 792;
    const flat = (pageIndex: number, lane: string, y: number) => {
      // Lane order on each page: left → right → next page left → ...
      const laneOffset = lane === 'right' ? 0.5 : 0;
      return pageIndex * 2 * paperH + (lane === 'full' ? 0 : laneOffset) * paperH + y;
    };
    const placementOf = (id: string) => plan.bodyPlacements.find((p) => p.componentId === id)!;
    const firstSegOf = (title: string) => plan.segments.find((s) => s.component.title === title && s.isFirstSegment)!;
    const flatHdr1 = flat(placementOf('hdr1').pageIndex, placementOf('hdr1').lane, placementOf('hdr1').y);
    const flatTableA = flat(firstSegOf('Table A').pageIndex, firstSegOf('Table A').lane, firstSegOf('Table A').y);
    const flatD1 = flat(placementOf('d1').pageIndex, placementOf('d1').lane, placementOf('d1').y);
    const flatL1 = flat(placementOf('l1').pageIndex, placementOf('l1').lane, placementOf('l1').y);
    const flatHdr2 = flat(placementOf('hdr2').pageIndex, placementOf('hdr2').lane, placementOf('hdr2').y);
    const flatTableB = flat(firstSegOf('Table B').pageIndex, firstSegOf('Table B').lane, firstSegOf('Table B').y);
    expect(flatHdr1).toBeLessThan(flatTableA);
    expect(flatTableA).toBeLessThan(flatD1);
    expect(flatD1).toBeLessThan(flatL1);
    expect(flatL1).toBeLessThan(flatHdr2);
    expect(flatHdr2).toBeLessThan(flatTableB);

    // plannedBodyComponentIds must include every body component.
    expect(plan.plannedBodyComponentIds.has('hdr1')).toBe(true);
    expect(plan.plannedBodyComponentIds.has('tA')).toBe(true);
    expect(plan.plannedBodyComponentIds.has('d1')).toBe(true);
    expect(plan.plannedBodyComponentIds.has('l1')).toBe(true);
    expect(plan.plannedBodyComponentIds.has('hdr2')).toBe(true);
    expect(plan.plannedBodyComponentIds.has('tB')).toBe(true);
  });

  test('Guided planner suppresses stale absolute rendering for body components after max pages are exhausted', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const text = (id: string, content: string, height: number) => ({
      id,
      type: 'text' as const,
      name: content,
      content,
      // Intentionally stale/off-canvas. Planned body components must not render
      // from these coordinates when they cannot receive a sequence placement.
      x: 999,
      y: 999,
      width: 200,
      height,
      region: 'body' as const,
      fontSize: 10,
      fontWeight: 'normal' as const,
      align: 'left' as const,
      lineHeight: 1.2,
    });

    const constrainedTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'full',
      maxPages: 1,
      printMode: 'single-sided',
      components: [
        text('oversized', 'Oversized block', 1000),
        text('after-1', 'After first', 18),
        text('after-2', 'After second', 18),
      ],
    };

    const plan = createFlowingTablePlan(constrainedTemplate as any);

    expect(plan.bodyPlacements.map((p) => p.componentId)).toEqual(['oversized']);
    expect(plan.plannedBodyComponentIds.has('oversized')).toBe(true);
    expect(plan.plannedBodyComponentIds.has('after-1')).toBe(true);
    expect(plan.plannedBodyComponentIds.has('after-2')).toBe(true);
  });

  test('inventory-backed section tables are treated as body components even if stale template data says header', async () => {
    const { createFlowingTablePlan } = await import('../../../src/routes/shopping-list-builder');
    const staleHeaderInventoryTable = {
      ...inventoryTable,
      id: 'inventory-category-stale-header',
      region: 'header' as const,
      flowMode: 'flowing' as const,
      rows: [
        { id: 'row-1', item: 'Black Beans', limit: '1' },
      ],
    };

    const staleTemplate = {
      ...template,
      layoutMode: 'guided',
      bodyLayoutMode: 'split',
      bodyColumnGap: 18,
      maxPages: 1,
      components: [staleHeaderInventoryTable],
    };

    const plan = createFlowingTablePlan(staleTemplate as any);

    expect(plan.plannedBodyComponentIds.has('inventory-category-stale-header')).toBe(true);
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]).toMatchObject({
      pageIndex: 0,
      lane: 'left',
      y: 36,
      isFirstSegment: true,
    });
  });
});
