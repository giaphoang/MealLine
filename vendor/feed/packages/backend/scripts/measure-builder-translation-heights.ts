/// <reference path="../src/types/express.d.ts" />

import puppeteer from 'puppeteer';
import type { Page } from 'puppeteer';
import prisma from '../src/db';
import {
  BUILDER_CELL_VERTICAL_PADDING_PT,
  BUILDER_LINE_HEIGHT_MULTIPLIER,
  BUILDER_GRID_PT,
  BUILDER_MIN_ROW_HEIGHT_PT,
} from '../src/lib/builder-typography';
import { createFlowingTablePlan, refreshInventoryBackedTemplate } from '../src/routes/shopping-list-builder';

type BuilderTranslationMode =
  | 'skip'
  | 'translate'
  | 'translate-with-original'
  | 'translate-with-original-block'
  | 'translate-with-original-adaptive';

interface SectionTableRow {
  id: string;
  item: string;
  limit: string;
  foodItemId?: number;
}

interface SectionTableComponent {
  id: string;
  type: 'section-table';
  title: string;
  width: number;
  rows: SectionTableRow[];
  showLimit: boolean;
  limitHeader: string;
  wantHeader: string;
  limitWidth: number;
  wantWidth: number;
  fontSize: number;
  rowHeight: number;
  flowMode?: 'fixed' | 'flowing';
  translationSettings?: {
    headers?: BuilderTranslationMode;
    tags?: BuilderTranslationMode;
    rows?: BuilderTranslationMode;
  };
  inventorySource?: {
    categoryId: number;
    categoryName: string;
  };
}

interface BuilderTemplate {
  components: Array<SectionTableComponent | { id: string; type: string }>;
}

const DEFAULT_TEMPLATE_NAME = 'Space saving test';
const DEFAULT_CATEGORIES = ['Produce', 'Dry Goods', 'Frozen', 'Grab & Go'];

const parseListArg = (name: string): string[] | null => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return null;
  return match.slice(prefix.length).split(',').map((value) => value.trim()).filter(Boolean);
};

const parseStringArg = (name: string): string | null => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character] ?? character));

const fontFace = (family: string, file: string, weight = 400) => (
  `@font-face{font-family:"${family}";src:url("file://${process.cwd()}/assets/fonts/noto-sans/${file}") format("truetype");font-weight:${weight};}`
);

const fontCss = [
  fontFace('Noto Sans', 'NotoSans-Regular.ttf'),
  fontFace('Noto Sans', 'NotoSans-Bold.ttf', 700),
  fontFace('Noto Naskh Arabic', 'NotoNaskhArabic-Regular.ttf'),
  fontFace('Noto Naskh Arabic', 'NotoNaskhArabic-Bold.ttf', 700),
  fontFace('Noto Sans Hebrew', 'NotoSansHebrew-Regular.ttf'),
  fontFace('Noto Sans Hebrew', 'NotoSansHebrew-Bold.ttf', 700),
].join('\n');

// Snap a Chromium-measured row height onto the typography engine's grid so
// it compares apples-to-apples with the planner. Uses the shared grid
// quantum and minimum-row-height constants rather than hard-coded values.
const snapHeight = (height: number) => Math.max(
  BUILDER_MIN_ROW_HEIGHT_PT,
  Math.ceil(height / BUILDER_GRID_PT) * BUILDER_GRID_PT,
);

const enabledLanguages = async () => {
  const rows = await prisma.language.findMany({
    where: { isEnabled: true, name: { not: 'English' } },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map((row) => row.name);
};

const loadTemplate = async (templateName: string): Promise<BuilderTemplate> => {
  const saved = await prisma.shoppingListBuilderTemplate.findFirst({
    where: { name: templateName },
    orderBy: { updatedAt: 'desc' },
  });
  if (!saved) {
    throw new Error(`Saved builder template not found: ${templateName}`);
  }
  return saved.templateData as unknown as BuilderTemplate;
};

const inventoryTables = (
  template: BuilderTemplate,
  categoryNames: string[],
) => template.components.filter((component): component is SectionTableComponent => (
  component.type === 'section-table'
  && 'title' in component
  && Boolean(component.inventorySource?.categoryId)
  && categoryNames.includes(component.title)
));

const lookupTranslations = async (
  tables: SectionTableComponent[],
  language: string,
) => {
  const categoryIds = Array.from(new Set(
    tables
      .map((table) => table.inventorySource?.categoryId)
      .filter((id): id is number => typeof id === 'number'),
  ));
  const foodItemIds = Array.from(new Set(
    tables.flatMap((table) => (
      table.rows
        .map((row) => row.foodItemId)
        .filter((id): id is number => typeof id === 'number')
    )),
  ));
  const [categoryRows, foodItemRows] = await Promise.all([
    prisma.categoryTranslation.findMany({ where: { categoryId: { in: categoryIds }, language } }),
    prisma.foodItemTranslation.findMany({ where: { foodItemId: { in: foodItemIds }, language } }),
  ]);
  return {
    categories: Object.fromEntries(categoryRows.map((row) => [row.categoryId, row.name])),
    foodItems: Object.fromEntries(foodItemRows.map((row) => [row.foodItemId, row.name])),
  };
};

const renderedRowHtml = (
  row: SectionTableRow,
  translation: string | undefined,
  rowMode: BuilderTranslationMode,
) => {
  if (rowMode === 'skip' || !translation) return escapeHtml(row.item);
  if (
    rowMode === 'translate-with-original'
    || rowMode === 'translate-with-original-block'
    || rowMode === 'translate-with-original-adaptive'
  ) {
    const block = rowMode === 'translate-with-original-block';
    const adaptive = rowMode === 'translate-with-original-adaptive';
    const tagStyle = `font-size:8pt;font-weight:700${block ? ';display:block' : ''}${adaptive ? ';white-space:nowrap' : ''}`;
    return `${escapeHtml(translation)}${block ? '' : ' '}<span style="${tagStyle}">${escapeHtml(row.item)}</span>`;
  }
  return escapeHtml(translation);
};

const measureRows = async (
  page: Page,
  table: SectionTableComponent,
  foodTranslations: Record<number, string>,
) => {
  const limitWidth = table.showLimit ? table.limitWidth : 0;
  const itemWidth = table.width - limitWidth - table.wantWidth;
  const rowMode = table.translationSettings?.rows ?? 'translate-with-original';
  const html = `
    <style>
      ${fontCss}
      * { box-sizing: border-box; }
      body {
        font-family: "Noto Sans", "Noto Naskh Arabic", "Noto Sans Hebrew", Arial, sans-serif;
        font-size: ${table.fontSize}pt;
        margin: 0;
      }
      .row {
        display: grid;
        grid-template-columns: ${itemWidth}pt ${limitWidth}pt ${table.wantWidth}pt;
        width: ${table.width}pt;
      }
      .cell {
        line-height: ${BUILDER_LINE_HEIGHT_MULTIPLIER};
        overflow-wrap: break-word;
        padding: ${BUILDER_CELL_VERTICAL_PADDING_PT}pt 4pt;
        unicode-bidi: plaintext;
        white-space: pre-wrap;
      }
    </style>
    ${table.rows.map((row) => `
      <div class="row">
        <div class="cell" dir="auto">${renderedRowHtml(
    row,
    row.foodItemId ? foodTranslations[row.foodItemId] : undefined,
    rowMode,
  )}</div>
        <div class="cell">${escapeHtml(row.limit)}</div>
        <div></div>
      </div>
    `).join('')}
  `;
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => (globalThis as any).document.fonts.ready);
  return page.$$eval('.row', (rows) => rows.map((row: any) => row.getBoundingClientRect().height * 72 / 96))
    .then((heights) => heights.map(snapHeight));
};

const main = async () => {
  const templateName = parseStringArg('template') ?? DEFAULT_TEMPLATE_NAME;
  const categories = parseListArg('categories') ?? DEFAULT_CATEGORIES;
  const languages = parseListArg('languages') ?? await enabledLanguages();
  const savedTemplate = await loadTemplate(templateName);
  // Replicate the /preview-pdf flow: inventory components are rebuilt from
  // the DB so their row heights reflect the current DEFAULT_SECTION_TABLE_ROW_HEIGHT
  // instead of whatever was persisted when the template was last saved.
  const template = await refreshInventoryBackedTemplate(savedTemplate as any) as unknown as BuilderTemplate;
  const tables = inventoryTables(template, categories);
  if (tables.length === 0) {
    throw new Error(`No matching inventory tables found in "${templateName}".`);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
  });

  try {
    const page = await browser.newPage();
    for (const language of languages) {
      const inventoryTranslations = await lookupTranslations(tables, language);
      const plan = createFlowingTablePlan(template as any, { language, inventoryTranslations });
      for (const table of tables) {
        const plannedRows = plan.segments
          .filter((segment) => segment.component.id === table.id)
          .flatMap((segment) => segment.rowHeights);
        const actualRows = await measureRows(page, table, inventoryTranslations.foodItems);
        const plannedTotal = plannedRows.reduce((sum, value) => sum + value, 0);
        const actualTotal = actualRows.reduce((sum, value) => sum + value, 0);
        const delta = plannedTotal - actualTotal;
        if (delta !== 0) {
          console.log(`${table.title} / ${language}: planned ${plannedTotal}pt, chromium ${actualTotal}pt, delta ${delta > 0 ? '+' : ''}${delta}pt`);
          table.rows.forEach((row, index) => {
            const rowDelta = (plannedRows[index] ?? 0) - (actualRows[index] ?? 0);
            if (rowDelta !== 0) {
              console.log(`  ${row.item}: planned ${plannedRows[index] ?? 'n/a'}pt, chromium ${actualRows[index] ?? 'n/a'}pt, delta ${rowDelta > 0 ? '+' : ''}${rowDelta}pt`);
            }
          });
        }
      }
    }
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
};

main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});
