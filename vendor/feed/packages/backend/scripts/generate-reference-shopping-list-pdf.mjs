#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..', '..');
const DEFAULT_OUTPUT = path.join(repoRoot, 'output', 'pdf', 'shopping-list-reference-regression.pdf');
const TABLE_GAP_PT = 4;

loadEnvFile(path.join(backendRoot, '.env'));
loadEnvFile(path.join(backendRoot, '.env.local'), true);

pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setFonts({
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
});

const prisma = new PrismaClient();

const profile = {
  title: 'Pantry Shopping List',
  date: 'April 23rd, 2026',
  listNumberLabel: '#____',
  instruction: 'Please write how many of each item you want in\nthe "Want" column.',
  footer: 'Please turn paper over',
  sections: [
    {
      category: 'Dry Goods',
      title: 'Dry Goods',
      x: 28,
      y: 153,
      width: 257,
      itemWidth: 160,
      limitWidth: 48,
      wantWidth: 49,
      showLimitHeader: true,
      items: [
        'Cooking Oil',
        'Peanut Butter',
        'Quick Oats',
        'Dried Dates',
        'Masa Corn Flour',
        'All-Purpose Flour',
        'Mac & Cheese',
        'Sliced Bread',
        'Hamburger Buns',
        'Hot Dog Buns',
        'Shelf Stable Milk',
        'Almond Milk',
        'Rice',
        'Pancake Mix',
        'Peanut Butter Granola',
        'Keurig Coffee Pod',
        'Misc. Drinks',
      ],
      limitOverrides: {
        'Mac & Cheese': '2',
      },
    },
    {
      category: 'Canned Goods',
      title: 'Canned Goods',
      x: 28,
      y: 0,
      width: 257,
      itemWidth: 160,
      limitWidth: 48,
      wantWidth: 49,
      showLimitHeader: true,
      items: ['Tuna', 'White Hominy', 'Pumpkin Puree', 'Applesauce', 'Green Beans'],
      displayNames: {
        'White Hominy': 'Hominy',
      },
    },
    {
      category: 'Beans',
      title: 'Beans',
      x: 28,
      y: 0,
      width: 257,
      itemWidth: 160,
      limitWidth: 48,
      wantWidth: 49,
      showLimitHeader: true,
      items: ['Black Beans (Dried)', 'Great Northern Beans (Dried)', 'Pinto Beans (Dried)', 'Navy Beans (Dried)'],
      aliases: {
        'Navy Beans (Dried)': 'Navy Beans (dried)',
      },
      displayNames: {
        'Navy Beans (dried)': 'Navy Beans (Dried)',
      },
      limitOverrides: {
        'Black Beans (Dried)': '1',
      },
    },
    {
      category: 'Produce',
      title: 'Produce',
      x: 324,
      y: 15,
      width: 265,
      itemWidth: 206,
      limitWidth: 0,
      wantWidth: 59,
      showLimitHeader: false,
      items: ['Apples', 'Oranges', 'Spaghetti Squash', 'Parsnips', 'Pears', 'Potatoes', 'Rutabagas', 'Bananas', 'Turnips'],
    },
    {
      category: 'Frozen',
      title: 'Frozen (choose 2)',
      x: 324,
      y: 0,
      width: 265,
      itemWidth: 159,
      limitWidth: 48,
      wantWidth: 58,
      showLimitHeader: true,
      items: ['Chickpeas/Garbanzo Beans', 'Misc. Frozen'],
      limitOverrides: {
        'Chickpeas/Garbanzo Beans': 'Choose\ntwo',
        'Misc. Frozen': '',
      },
    },
    {
      category: 'Meats',
      title: 'Meat (choose 1)',
      x: 324,
      y: 0,
      width: 265,
      itemWidth: 159,
      limitWidth: 48,
      wantWidth: 58,
      showLimitHeader: true,
      items: ['Chicken', 'Turkey', 'Fish'],
      limitOverrides: {
        Chicken: 'Choose\none',
        Turkey: '',
        Fish: '',
      },
    },
    {
      category: 'Dairy',
      title: 'Dairy (choose 3)',
      x: 324,
      y: 0,
      width: 265,
      itemWidth: 159,
      limitWidth: 48,
      wantWidth: 58,
      showLimitHeader: true,
      items: ['Eggs', 'Yogurt'],
    },
    {
      category: 'Grab & Go',
      title: 'Grab & Go',
      x: 324,
      y: 0,
      width: 265,
      itemWidth: 159,
      limitWidth: 48,
      wantWidth: 58,
      showLimitHeader: true,
      items: ['Canned Kombucha', 'Dipping Sauce (Contains Dairy & Egg)'],
      displayNames: {
        'Dipping Sauce (Contains Dairy & Egg)': 'Dipping Sauce (contains\ndairy and egg)',
      },
    },
    {
      category: 'Hygiene Items',
      title: 'Hygiene (choose up to 5)',
      x: 324,
      y: 0,
      width: 265,
      itemWidth: 159,
      limitWidth: 48,
      wantWidth: 58,
      showLimitHeader: true,
      items: ['Toilet Paper', 'Menstrual Items', 'Toothbrush', 'Toothpaste', 'Razor', 'Bar Soap', 'Deodorant', 'Shampoo', 'Dish Soap'],
      limitOverrides: {
        'Menstrual Items': '',
        Toothbrush: '',
        Toothpaste: '',
        Razor: '',
        'Bar Soap': '',
        Deodorant: '',
        Shampoo: '',
        'Dish Soap': '',
      },
    },
  ],
};

function loadEnvFile(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (!override && process.env[key] !== undefined) continue;

    let value = rawValue.trim();
    if ((value.startsWith('"') && value.includes('"', 1)) || (value.startsWith("'") && value.includes("'", 1))) {
      const quote = value[0];
      value = value.slice(1, value.indexOf(quote, 1));
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    process.env[key] = value;
  }
}

function parseArgs(argv) {
  const outIndex = argv.indexOf('--out');
  return {
    out: outIndex >= 0 && argv[outIndex + 1] ? path.resolve(argv[outIndex + 1]) : DEFAULT_OUTPUT,
  };
}

function normalize(value) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

function itemLimitDisplay(item) {
  if (!item || item.limit === 100 || item.limit == null) return '';
  return String(item.limit);
}

async function loadInventory() {
  const categories = await prisma.category.findMany({
    include: {
      foodItems: {
        where: { isInStock: true },
        orderBy: { name: 'asc' },
      },
    },
  });

  const byName = new Map();
  for (const category of categories) {
    for (const item of category.foodItems) {
      byName.set(normalize(item.name), { ...item, categoryName: category.name });
    }
  }

  return { categories, byName };
}

function findItem(section, requestedName, inventory) {
  const alias = section.aliases?.[requestedName] ?? requestedName;
  const candidates = [
    alias,
    requestedName,
    requestedName.replace(/\(Dried\)/g, '(dried)'),
    requestedName.replace(/\(dried\)/g, '(Dried)'),
  ];

  for (const candidate of candidates) {
    const item = inventory.byName.get(normalize(candidate));
    if (item) return item;
  }

  return null;
}

function buildResolvedSections(inventory) {
  const warnings = [];
  const sections = profile.sections.map((section) => {
    const rows = section.items.map((requestedName) => {
      const item = findItem(section, requestedName, inventory);
      if (!item) {
        warnings.push(`Missing in-stock DB item for ${section.title}: ${requestedName}`);
      }

      const sourceName = item?.name ?? requestedName;
      const displayName = section.displayNames?.[sourceName] ?? section.displayNames?.[requestedName] ?? requestedName;
      const limit = section.limitOverrides?.[requestedName] ?? section.limitOverrides?.[sourceName] ?? itemLimitDisplay(item);

      return { requestedName, sourceName, displayName, limit, item };
    });

    return { ...section, rows };
  });

  return { sections, warnings };
}

function textAt(text, x, y, options = {}) {
  const {
    width,
    size = 10,
    bold = false,
    align = 'left',
    lineHeight = 1,
    color = 'black',
  } = options;

  const node = {
    columns: [
      {
        width: width ?? 'auto',
        text,
        fontSize: size,
        bold,
        alignment: align,
        lineHeight,
        color,
      },
    ],
    absolutePosition: { x, y },
  };

  return node;
}

function rectAt(x, y, w, h, options = {}) {
  const { fill = undefined, stroke = '#b9b9b9', lineWidth = 0.45 } = options;
  return {
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w,
        h,
        color: fill,
        lineColor: stroke,
        lineWidth,
      },
    ],
    absolutePosition: { x, y },
  };
}

function lineAt(x1, y1, x2, y2, options = {}) {
  const { stroke = '#b9b9b9', lineWidth = 0.45 } = options;
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: x2 - x1,
        y2: y2 - y1,
        lineColor: stroke,
        lineWidth,
      },
    ],
    absolutePosition: { x: x1, y: y1 },
  };
}

function headerNodes() {
  const nodes = [
    textAt(profile.title, 28, 17, { size: 14, bold: true, width: 190 }),
    textAt(profile.date, 28, 36, { size: 10, width: 150 }),
    textAt(profile.listNumberLabel, 258, 31, { size: 10, bold: true, width: 32, align: 'right' }),
  ];

  const x = 28;
  const y = 50;
  const labelWidth = 158;
  const valueWidth = 102;
  const rowH = 15.7;
  const labels = [
    'Client Name',
    '# of People in Household',
    'Allergies or Diet Restrictions',
    '# of Bags you can carry',
  ];

  labels.forEach((label, index) => {
    const rowY = y + index * rowH;
    nodes.push(rectAt(x, rowY, labelWidth + valueWidth, rowH, { stroke: '#a8a8a8' }));
    nodes.push(lineAt(x + labelWidth, rowY, x + labelWidth, rowY + rowH, { stroke: '#a8a8a8' }));
    nodes.push(textAt(label, x + 3, rowY + 3.2, { size: 10, width: labelWidth - 6 }));
  });

  nodes.push(textAt(profile.instruction, 28, 119, { size: 10, width: 260, lineHeight: 1.12 }));
  return nodes;
}

function lineCount(text) {
  return String(text).split('\n').length;
}

function rowHeight(row) {
  return Math.max(16, lineCount(row.displayName) > 1 || lineCount(row.limit) > 1 ? 32 : 16);
}

function sectionHeight(section) {
  return 16 + section.rows.reduce((total, row) => total + rowHeight(row), 0);
}

function applyColumnFlow(sections) {
  const leftOrder = ['Dry Goods', 'Canned Goods', 'Beans'];
  const rightOrder = ['Produce', 'Frozen', 'Meats', 'Dairy', 'Grab & Go', 'Hygiene Items'];
  const sectionsByCategory = new Map(sections.map((section) => [section.category, section]));

  const place = (order, startY) => {
    let cursorY = startY;
    for (const category of order) {
      const section = sectionsByCategory.get(category);
      if (!section) continue;

      section.y = cursorY;
      cursorY += sectionHeight(section) + TABLE_GAP_PT;
    }
  };

  place(leftOrder, 153);
  place(rightOrder, 15);

  return sections;
}

function sectionNodes(section) {
  const nodes = [];
  const headerH = 16;
  const { x, y, width, itemWidth, limitWidth, wantWidth } = section;

  nodes.push(rectAt(x, y, width, headerH, { fill: 'white', stroke: '#b9b9b9' }));
  nodes.push(textAt(section.title, x, y + 3, { size: 10, bold: true, width: itemWidth + limitWidth, align: 'center' }));

  if (section.showLimitHeader) {
    nodes.push(textAt('Limit', x + itemWidth, y + 3, { size: 10, bold: true, width: limitWidth, align: 'center' }));
  }
  nodes.push(textAt('Want', x + itemWidth + limitWidth, y + 3, { size: 10, bold: true, width: wantWidth, align: 'center' }));
  nodes.push(lineAt(x + itemWidth, y, x + itemWidth, y + headerH));
  if (limitWidth > 0) {
    nodes.push(lineAt(x + itemWidth + limitWidth, y, x + itemWidth + limitWidth, y + headerH));
  }

  let cursorY = y + headerH;
  section.rows.forEach((row, index) => {
    const h = rowHeight(row);
    const fill = index % 2 === 0 ? '#c9c9c9' : 'white';
    nodes.push(rectAt(x, cursorY, width, h, { fill, stroke: '#cfcfcf' }));
    nodes.push(lineAt(x + itemWidth, cursorY, x + itemWidth, cursorY + h, { stroke: '#cfcfcf' }));
    if (limitWidth > 0) {
      nodes.push(lineAt(x + itemWidth + limitWidth, cursorY, x + itemWidth + limitWidth, cursorY + h, { stroke: '#cfcfcf' }));
    }
    nodes.push(textAt(row.displayName, x + 4, cursorY + 3, { size: 10, width: itemWidth - 8, lineHeight: 1.06 }));
    if (limitWidth > 0 && row.limit) {
      nodes.push(textAt(row.limit, x + itemWidth + 2, cursorY + 3, { size: 10, width: limitWidth - 4, align: 'center', lineHeight: 1.06 }));
    }
    cursorY += h;
  });

  return nodes;
}

function buildDocDefinition(sections) {
  return {
    pageSize: 'LETTER',
    pageMargins: [0, 0, 0, 0],
    defaultStyle: {
      font: 'Helvetica',
      fontSize: 10,
    },
    info: {
      title: 'Shopping List Reference Regression',
      author: 'William Temple House',
      subject: 'Procedurally generated shopping list reference',
    },
    content: [
      rectAt(0, 0, 612, 792, { fill: 'white', stroke: 'white', lineWidth: 0 }),
      ...headerNodes(),
      ...sections.flatMap(sectionNodes),
      textAt(profile.footer, 28, 748, { size: 16, bold: true, width: 190 }),
      lineAt(205, 756, 220, 756, { stroke: 'black', lineWidth: 2 }),
      lineAt(220, 756, 214, 750, { stroke: 'black', lineWidth: 2 }),
      lineAt(220, 756, 214, 762, { stroke: 'black', lineWidth: 2 }),
    ],
  };
}

async function createPdf(sections, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const docDefinition = buildDocDefinition(sections);
  await pdfmake.createPdf(docDefinition).write(outPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inventory = await loadInventory();
  const { sections, warnings } = buildResolvedSections(inventory);
  applyColumnFlow(sections);

  await createPdf(sections, args.out);

  console.log(`Generated ${path.relative(repoRoot, args.out)}`);
  if (warnings.length > 0) {
    console.warn('Warnings:');
    warnings.forEach((warning) => console.warn(`- ${warning}`));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
