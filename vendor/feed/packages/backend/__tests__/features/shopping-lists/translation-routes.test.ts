import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

/**
 * Slice 1 of the Translated Shopping Lists initiative covers the text
 * component only. These tests exercise the three new translation surfaces
 * on the Shopping List Builder router:
 *   - POST /preview-pdf with targetLanguage (cache lookup + render)
 *   - POST /translation-preflight
 *   - POST /translate-missing-strings
 *
 * Mocks: Prisma (translation + builder template tables) and the AI service
 * factory's translateTextBatch method. We do NOT mock the puppeteer/Chromium
 * pipeline; the route tests for `/preview-pdf` rely on the same end-to-end
 * PDF rendering as the existing shopping-list-builder.test.ts cases.
 */

const mockPrisma = vi.hoisted(() => ({
  translation: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  categoryTranslation: { findMany: vi.fn() },
  foodItemTranslation: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
  foodItem: { findUnique: vi.fn(), update: vi.fn() },
  globalLimit: { findFirst: vi.fn() },
  shoppingListBuilderComponent: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  shoppingListBuilderTemplate: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../../src/db', () => ({
  default: mockPrisma,
}));

const mockTranslateTextBatch = vi.hoisted(() => vi.fn());
vi.mock('../../../src/services/ai/factory/AIServiceFactory', () => ({
  AIServiceFactory: {
    createService: vi.fn(async () => ({
      translateTextBatch: mockTranslateTextBatch,
    })),
  },
}));

// Mock alertService so the per-batch daily-aggregate alert hooks invoked by
// translateBuilderStrings (mirrors docx/translation.ts:1326-1331) do not
// trip on the test's Prisma mock lacking `.aggregate`.
const mockAlertService = vi.hoisted(() => ({
  checkTokenUsage: vi.fn().mockResolvedValue(undefined),
  checkCostUsage: vi.fn().mockResolvedValue(undefined),
  checkResponseTime: vi.fn().mockResolvedValue(undefined),
  createAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/services/alerts', () => ({
  alertService: mockAlertService,
}));

const paper = { size: 'letter' as const, width: 612, height: 792, unit: 'pt' as const };

const helloComponent = {
  id: 'text-hello',
  type: 'text' as const,
  name: 'Hello',
  content: 'Welcome to FEED',
  x: 45,
  y: 54,
  width: 253,
  height: 27,
  fontSize: 12,
  fontWeight: 'bold' as const,
  align: 'left' as const,
  lineHeight: 1.2,
};

const callAheadComponent = {
  ...helloComponent,
  id: 'text-call-ahead',
  name: 'Call ahead',
  content: 'Please call ahead',
  y: 90,
};

const template = {
  id: 'translation-test-template',
  name: 'Translation Test',
  paper,
  components: [helloComponent, callAheadComponent],
};

describe('Shopping List Builder translation routes', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.shoppingListBuilderComponent.findMany.mockResolvedValue([]);
    mockPrisma.shoppingListBuilderTemplate.findMany.mockResolvedValue([]);
    // Sensible defaults; individual tests override.
    mockPrisma.translation.findMany.mockResolvedValue([]);
    mockPrisma.translation.upsert.mockResolvedValue({ id: 1 });
    mockPrisma.translation.update.mockResolvedValue({});
    mockPrisma.translation.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.categoryTranslation.findMany.mockResolvedValue([]);
    mockPrisma.foodItemTranslation.findMany.mockResolvedValue([]);
    // Global Limit defaults ON for section tables (ISSUES.md #39), so the
    // preview-pdf renderer queries it whenever a table doesn't opt out.
    mockPrisma.globalLimit.findFirst.mockResolvedValue({ id: 1, value: 10 });

    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      // Matches the auth shape `getOwnerId` reads from in the route module
      // (see shopping-list-builder.test.ts for the established pattern).
      req.auth = {
        userId: 'test-owner',
        email: 'test-owner@example.org',
        role: 'STAFF',
        accessState: 'ALLOWED',
      };
      next();
    });

    const { default: builderRouter } = await import('../../../src/routes/shopping-list-builder');
    app.use('/api/shopping-list-builder', builderRouter);
    // The real global handler, not a stub. A stub that forwards every
    // `error.message` verbatim is what let the withheld-5xx defect ship:
    // these routes' curated 503 copy passed in tests and was replaced by
    // the generic internal-failure text in production (ISSUES.md #80).
    const { errorHandler } = await import('../../../src/middleware/error-handler');
    app.use(errorHandler);
  });

  describe('POST /translation-preflight', () => {
    test('reports total / cached / missing for a target language', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Welcome to FEED', translatedText: 'Bienvenido a FEED' },
      ]);

      const response = await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template, targetLanguage: 'Spanish' })
        .expect(200);

      expect(response.body).toEqual({
        totalStrings: 2,
        cachedCount: 1,
        missingStrings: ['Please call ahead'],
        cached: { 'Welcome to FEED': 'Bienvenido a FEED' },
      });
    });

    test('de-duplicates repeated strings in the preflight count', async () => {
      const dupTemplate = {
        ...template,
        components: [
          { ...helloComponent, id: 'a' },
          { ...helloComponent, id: 'b' },
          { ...helloComponent, id: 'c' },
        ],
      };
      mockPrisma.translation.findMany.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template: dupTemplate, targetLanguage: 'Spanish' })
        .expect(200);

      expect(response.body.totalStrings).toBe(1);
      expect(response.body.missingStrings).toEqual(['Welcome to FEED']);
    });

    test('includes table title/headers/tags/rows, form-field labels, and date values in the Generated List preflight', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Limit', translatedText: 'Límite' },
        { originalText: '(Choose up to 3)', translatedText: '(Elija hasta 3)' },
        { originalText: 'May 14, 2026', translatedText: '14 de mayo de 2026' },
      ]);

      const mixedTemplate = {
        ...template,
        components: [
          {
            id: 'section-generated-strings',
            type: 'section-table' as const,
            name: 'Generated strings table',
            title: 'Produce',
            x: 45,
            y: 54,
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
            categoryLimit: 3,
            categoryLimitType: 'household' as const,
            rows: [{ id: 'apples', item: 'Apples', limit: '' }],
          },
          {
            id: 'form-generated-strings',
            type: 'form-field-group' as const,
            name: 'Client form',
            x: 45,
            y: 126,
            width: 253,
            height: 54,
            region: 'body' as const,
            labelWidth: 120,
            fontSize: 10,
            fields: [
              { id: 'name', label: 'Name' },
              { id: 'phone', label: 'Phone', translationMode: 'skip' as const },
              { id: 'notes', label: 'Notes', translationMode: 'translate-with-original' as const },
            ],
          },
          {
            id: 'date-generated-string',
            type: 'date' as const,
            name: 'Date',
            x: 45,
            y: 198,
            width: 253,
            height: 18,
            region: 'body' as const,
            dateMode: 'custom' as const,
            customDate: '2026-05-14',
            formatId: 'medium' as const,
            fontSize: 12,
            fontWeight: 'normal' as const,
            align: 'left' as const,
            lineHeight: 1.2,
          },
        ],
      };

      const response = await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template: mixedTemplate, targetLanguage: 'Spanish' })
        .expect(200);

      // The section table has no `inventorySource`, so it is a base-component
      // table: its user-typed title ('Produce') and row item ('Apples') route
      // through the Generated (List) cache alongside the limit/want headers
      // and the category-limit tag. Extraction order is component order, then
      // within the section table: limitHeader, wantHeader, tag, title, rows.
      expect(response.body).toEqual({
        totalStrings: 8,
        cachedCount: 3,
        missingStrings: ['Want', 'Produce', 'Apples', 'Name', 'Notes'],
        cached: {
          Limit: 'Límite',
          '(Choose up to 3)': '(Elija hasta 3)',
          'May 14, 2026': '14 de mayo de 2026',
        },
      });
    });

    test('returns 0 / 0 / [] for a template with no translatable strings', async () => {
      // Use a non-text component (line) so the template still has at least
      // one component to pass validateTemplate, but contributes zero
      // translatable strings to the extractor.
      const nonTextTemplate = {
        ...template,
        components: [{
          id: 'line-1',
          type: 'line' as const,
          name: 'Horizontal line',
          direction: 'horizontal' as const,
          x: 0,
          y: 100,
          width: 200,
          height: 1,
          strokeWidth: 1,
        }],
      };
      const response = await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template: nonTextTemplate, targetLanguage: 'Spanish' })
        .expect(200);

      expect(response.body).toEqual({
        totalStrings: 0,
        cachedCount: 0,
        missingStrings: [],
        cached: {},
      });
      expect(mockPrisma.translation.findMany).not.toHaveBeenCalled();
    });

    test('400 when targetLanguage is missing', async () => {
      await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template })
        .expect(400);
    });
  });

  describe('POST /translate-missing-strings', () => {
    test('calls the AI provider for missing strings and returns the resolved map', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 401 });
      mockTranslateTextBatch.mockResolvedValue({
        translations: [{ id: '401', translatedText: 'Hola' }],
      });

      const response = await request(app)
        .post('/api/shopping-list-builder/translate-missing-strings')
        .send({ strings: ['Hello'], targetLanguage: 'Spanish' })
        .expect(200);

      expect(response.body).toEqual({ translations: { Hello: 'Hola' } });
      expect(mockTranslateTextBatch).toHaveBeenCalledTimes(1);
      expect(mockTranslateTextBatch.mock.calls[0][0].targetLanguage).toBe('Spanish');
      expect(mockTranslateTextBatch.mock.calls[0][0].context).toBe('custom');
    });

    test('returns cached entries when nothing is missing without calling the AI provider', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Hello', translatedText: 'Hola' },
      ]);

      const response = await request(app)
        .post('/api/shopping-list-builder/translate-missing-strings')
        .send({ strings: ['Hello'], targetLanguage: 'Spanish' })
        .expect(200);

      expect(response.body).toEqual({ translations: { Hello: 'Hola' } });
      expect(mockTranslateTextBatch).not.toHaveBeenCalled();
    });

    test('400 when targetLanguage is missing', async () => {
      await request(app)
        .post('/api/shopping-list-builder/translate-missing-strings')
        .send({ strings: ['Hello'] })
        .expect(400);
    });

    test('400 when strings is not an array', async () => {
      await request(app)
        .post('/api/shopping-list-builder/translate-missing-strings')
        .send({ strings: 'Hello', targetLanguage: 'Spanish' })
        .expect(400);
    });

    // ISSUES.md #80. Two rules hold for every provider failure here:
    // the status is 503 (Cloudflare rewrites an origin 502 into its own HTML
    // error page, which destroys the body), and the curated message actually
    // reaches the client (the error handler used to withhold every 5xx
    // message and substitute the generic internal-failure text).
    const providerFailure = async (thrown: unknown) => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      mockPrisma.translation.upsert.mockResolvedValueOnce({ id: 1 });
      mockTranslateTextBatch.mockRejectedValueOnce(thrown);

      const response = await request(app)
        .post('/api/shopping-list-builder/translate-missing-strings')
        .send({ strings: ['Hello'], targetLanguage: 'Spanish' })
        .expect(503);
      return response.body.error;
    };

    test('503 with a curated message when the AI provider does not respond', async () => {
      const error = await providerFailure(new Error('provider down'));

      expect(error.code).toBe('AI_TRANSLATION_UNAVAILABLE');
      expect(error.message).toContain('Spanish');
      expect(error.message).not.toContain('could not complete that request');
    });

    test('a briefly overloaded model tells the user to retry in a minute', async () => {
      const overloaded = Object.assign(new Error('The model is overloaded. Please try again later.'), {
        status: 503,
      });
      const error = await providerFailure(overloaded);

      expect(error.code).toBe('AI_TRANSLATION_BUSY');
      expect(error.message).toContain('busy right now');
      expect(error.message).toContain('wait about a minute');
    });

    // The reported production failure. Gemini reports depleted prepayment
    // credits as HTTP 429 / RESOURCE_EXHAUSTED -- the same status as genuine
    // rate limiting -- and the old classifier saw "429" and told staff to
    // wait a minute for a condition that no amount of waiting resolves.
    test('depleted provider credits are not reported as temporary', async () => {
      const exhausted = Object.assign(
        new Error(
          '{"error":{"code":429,"message":"Your prepayment credits are depleted. '
            + 'Please go to AI Studio to manage your project and billing.",'
            + '"status":"RESOURCE_EXHAUSTED"}}',
        ),
        { status: 429 },
      );
      const error = await providerFailure(exhausted);

      expect(error.code).toBe('AI_TRANSLATION_QUOTA_EXHAUSTED');
      expect(error.message).toMatch(/quota or prepaid credits/);
      expect(error.message).toContain('administrator');
      expect(error.message).not.toContain('wait about a minute');
      // No provider URLs, JSON, or raw payload reaches the user.
      expect(error.message).not.toContain('{');
      expect(error.message).not.toContain('http');
    });

    // Observed while switching the production account from Gemini to OpenAI.
    // A model the project has not been granted is a 403 on the merits: it
    // reads as a service failure but no retry can clear it, and the fix is a
    // different model or a different key, not patience.
    test('a model the API key cannot call is reported as configuration', async () => {
      const forbidden = Object.assign(
        new Error(
          "403 Project 'proj_D1SVivR2OD2RCM9V5UnAwpi1' does not have access to model "
            + "'gpt-5-mini-2025-08-07'",
        ),
        { status: 403 },
      );
      const error = await providerFailure(forbidden);

      expect(error.code).toBe('AI_TRANSLATION_MISCONFIGURED');
      expect(error.message).toContain('AI Configuration');
      expect(error.message).toContain('Retrying will not help');
      expect(error.message).not.toContain('wait about a minute');
      // The project id and model id are provider internals, not user copy.
      expect(error.message).not.toContain('proj_');
      expect(error.message).not.toContain('gpt-5');
    });

    test('an instance with no active AI model says so, and says what to do', async () => {
      const error = await providerFailure(
        new Error('AI configuration required. Please configure AI settings in Tools → AI Configuration.')
      );

      expect(error.code).toBe('AI_TRANSLATION_NOT_CONFIGURED');
      expect(error.message).toContain('no AI model is switched on');
      expect(error.message).toContain('restored from a backup');
      expect(error.message).not.toContain("didn't respond");
    });

    test('a rejected API key is configuration, not an outage', async () => {
      const badKey = Object.assign(
        new Error('401 Incorrect API key provided. You can find your API key at ...'),
        { status: 401 },
      );
      const error = await providerFailure(badKey);

      expect(error.code).toBe('AI_TRANSLATION_MISCONFIGURED');
    });
  });

  describe('POST /preview-pdf with targetLanguage', () => {
    test('looks up translations in the Generated (List) cache for the target language', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Welcome to FEED', translatedText: 'Bienvenido a FEED' },
        { originalText: 'Please call ahead', translatedText: 'Por favor llame con anticipación' },
      ]);

      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({ template, targetLanguage: 'Spanish' })
        .expect(200);

      // The cache query must use the Generated (List) type and the right
      // language, otherwise the renderer would miss the user's translations.
      expect(mockPrisma.translation.findMany).toHaveBeenCalled();
      const where = mockPrisma.translation.findMany.mock.calls[0][0].where;
      expect(where.type).toBe('Generated (List)');
      expect(where.language).toBe('Spanish');
      expect(where.status).toBe('completed');
      // Valid PDF returned.
      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
    }, 15000);

    test('does NOT look up translations when targetLanguage is omitted (English-only path unchanged)', async () => {
      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({ template })
        .expect(200);

      expect(mockPrisma.translation.findMany).not.toHaveBeenCalled();
      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
    }, 15000);

    test('does NOT look up translations when targetLanguage is English', async () => {
      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({ template, targetLanguage: 'English' })
        .expect(200);

      expect(mockPrisma.translation.findMany).not.toHaveBeenCalled();
      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
    }, 15000);

    test('renders successfully when some strings are missing translations (silent English fallback)', async () => {
      // Only one of the two text strings is cached -> the other falls back.
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Welcome to FEED', translatedText: 'Bienvenido a FEED' },
      ]);

      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({ template, targetLanguage: 'Spanish' })
        .expect(200);

      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
      // We never called the AI provider during render -- per the plan, the
      // pre-flight step is responsible for pre-populating the cache.
      expect(mockTranslateTextBatch).not.toHaveBeenCalled();
    }, 15000);
  });

  describe('per-component translation mode (slice 2)', () => {
    const skippedComponent = { ...helloComponent, id: 'text-skip', translationMode: 'skip' as const };
    const translateWithOriginalComponent = {
      ...helloComponent,
      id: 'text-bilingual',
      translationMode: 'translate-with-original' as const,
    };

    test('preflight excludes components in skip mode from the count', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]);
      const mixed = {
        ...template,
        components: [helloComponent, skippedComponent, callAheadComponent],
      };

      const response = await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template: mixed, targetLanguage: 'Spanish' })
        .expect(200);

      // helloComponent + callAheadComponent contribute; skippedComponent
      // is excluded. helloComponent and skippedComponent share content
      // ("Welcome to FEED"), but skip is removed BEFORE dedup so the
      // remaining set is { "Welcome to FEED", "Please call ahead" } = 2.
      expect(response.body.totalStrings).toBe(2);
      expect(response.body.missingStrings.sort()).toEqual([
        'Please call ahead',
        'Welcome to FEED',
      ]);
    });

    test('preflight returns 0 when every text component is in skip mode', async () => {
      const allSkipped = {
        ...template,
        components: [skippedComponent, { ...callAheadComponent, translationMode: 'skip' as const }],
      };

      const response = await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template: allSkipped, targetLanguage: 'Spanish' })
        .expect(200);

      expect(response.body).toEqual({
        totalStrings: 0,
        cachedCount: 0,
        missingStrings: [],
        cached: {},
      });
      expect(mockPrisma.translation.findMany).not.toHaveBeenCalled();
    });

    test('preview-pdf with skip mode renders the original text even when a translation is cached', async () => {
      // Cache the translation that would be used if the mode weren't skip.
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Welcome to FEED', translatedText: 'Bienvenido a FEED' },
      ]);
      // Both components have identical content "Welcome to FEED"; one is
      // 'translate', the other is 'skip'. The render output is verified
      // structurally via successful PDF generation.
      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({
          template: { ...template, components: [helloComponent, skippedComponent] },
          targetLanguage: 'Spanish',
        })
        .expect(200);

      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
    }, 15000);

    test('preview-pdf with translate-with-original mode renders successfully with both translation and English tag', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Welcome to FEED', translatedText: 'Bienvenido a FEED' },
      ]);
      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({
          template: { ...template, components: [translateWithOriginalComponent] },
          targetLanguage: 'Spanish',
        })
        .expect(200);

      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
    }, 15000);

    test('preview-pdf with translate-with-original mode + missing cache falls back to original alone (no empty tag)', async () => {
      mockPrisma.translation.findMany.mockResolvedValue([]); // no cache hits
      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({
          template: { ...template, components: [translateWithOriginalComponent] },
          targetLanguage: 'Spanish',
        })
        .expect(200);

      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
    }, 15000);

    test('legacy text components without translationMode behave like translate (slice-1 contract preserved)', async () => {
      // helloComponent has no translationMode field, simulating a saved
      // template from before slice 2 existed.
      mockPrisma.translation.findMany.mockResolvedValue([
        { originalText: 'Welcome to FEED', translatedText: 'Bienvenido a FEED' },
      ]);

      const preflight = await request(app)
        .post('/api/shopping-list-builder/translation-preflight')
        .send({ template: { ...template, components: [helloComponent] }, targetLanguage: 'Spanish' })
        .expect(200);

      // 1 string, 1 cached, 0 missing -- proves the undefined default is
      // treated as 'translate' rather than 'skip'.
      expect(preflight.body).toEqual({
        totalStrings: 1,
        cachedCount: 1,
        missingStrings: [],
        cached: { 'Welcome to FEED': 'Bienvenido a FEED' },
      });
    });
  });

  describe('inventory-backed translation fallback', () => {
    // An inventory section table whose rows carry foodItemId / categoryId.
    const inventoryTable = {
      id: 'section-inventory',
      type: 'section-table' as const,
      name: 'Dairy table',
      title: 'Dairy',
      x: 45,
      y: 54,
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
      categoryLimit: 3,
      categoryLimitType: 'household' as const,
      inventorySource: { categoryId: 7, categoryName: 'Dairy' },
      rows: [{ id: 'eggs', item: 'Eggs', limit: '', foodItemId: 47 }],
    };
    const inventoryTemplate = { ...template, components: [inventoryTable] };

    // refreshInventoryBackedTemplate rebuilds inventory rows from the DB, so
    // the category (with its in-stock food items) must be mockable.
    const mockDairyCategory = {
      id: 7,
      name: 'Dairy',
      icon: null,
      limit: 3,
      limitType: 'household',
      foodItems: [{ id: 47, name: 'Eggs', limit: 0, isLimited: false }],
    };

    test('falls back to the generic Translation table when the denormalized FoodItemTranslation row is missing', async () => {
      mockPrisma.category.findMany.mockResolvedValue([mockDairyCategory]);
      // Denormalized tables have a gap: no Arabic row for Eggs / Dairy.
      mockPrisma.foodItemTranslation.findMany.mockResolvedValue([]);
      mockPrisma.categoryTranslation.findMany.mockResolvedValue([]);
      // The generic Translation table DOES have them (type FoodItem / Category).
      mockPrisma.translation.findMany.mockImplementation(async (args: {
        where: { type?: string };
      }) => {
        if (args.where.type === 'FoodItem') {
          return [{ originalText: 'Eggs', translatedText: 'بيض' }];
        }
        if (args.where.type === 'Category') {
          return [{ originalText: 'Dairy', translatedText: 'منتجات الألبان' }];
        }
        return [];
      });

      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({ template: inventoryTemplate, targetLanguage: 'Arabic' })
        .expect(200);

      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
      // The generic table was consulted with the inventory types as a backstop.
      const types = mockPrisma.translation.findMany.mock.calls.map(
        (call) => call[0].where.type,
      );
      expect(types).toContain('FoodItem');
      expect(types).toContain('Category');
    }, 15000);

    test('prefers the denormalized FoodItemTranslation row when present (no generic fallback query)', async () => {
      mockPrisma.category.findMany.mockResolvedValue([mockDairyCategory]);
      mockPrisma.foodItemTranslation.findMany.mockResolvedValue([
        { foodItemId: 47, language: 'Arabic', name: 'بيض' },
      ]);
      mockPrisma.categoryTranslation.findMany.mockResolvedValue([
        { categoryId: 7, language: 'Arabic', name: 'منتجات الألبان' },
      ]);
      mockPrisma.translation.findMany.mockResolvedValue([]);

      const response = await request(app)
        .post('/api/shopping-list-builder/preview-pdf')
        .send({ template: inventoryTemplate, targetLanguage: 'Arabic' })
        .expect(200);

      expect(response.body.toString('utf-8', 0, 4)).toBe('%PDF');
      // Denormalized rows satisfied every id, so no FoodItem/Category fallback
      // query should have been issued against the generic Translation table.
      const types = mockPrisma.translation.findMany.mock.calls.map(
        (call) => call[0].where.type,
      );
      expect(types).not.toContain('FoodItem');
      expect(types).not.toContain('Category');
    }, 15000);
  });
});
