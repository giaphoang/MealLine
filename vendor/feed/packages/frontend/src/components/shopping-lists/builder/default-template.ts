// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import {
  BuilderComponent,
  BuilderComponentType,
  DEFAULT_BUILDER_COMPONENT_WIDTH,
  DEFAULT_DATE_FORMAT_ID,
  DEFAULT_FORM_FIELD_GROUP_HEIGHT,
  DEFAULT_FORM_FIELD_ROW_HEIGHT,
  DEFAULT_FOOTER_HEIGHT,
  DEFAULT_HEADER_HEIGHT,
  DEFAULT_INCLUDE_CATEGORY_ICONS,
  DEFAULT_LANGUAGE_TAG_MODE,
  DEFAULT_SECTION_TABLE_ROW_HEIGHT,
  DEFAULT_SECTION_TABLE_CORNER_RADIUS,
  DEFAULT_SECTION_TABLE_LIMIT_WIDTH,
  DEFAULT_SECTION_TABLE_WANT_WIDTH,
  SectionTableRow,
  ShoppingListBuilderTemplate,
} from './types';

export const BUILDER_PAPER = {
  size: 'letter' as const,
  width: 612,
  height: 792,
  unit: 'pt' as const,
};

const dryGoodsRows = [
  ['Cooking Oil', ''],
  ['Peanut Butter', ''],
  ['Quick Oats', ''],
  ['Dried Dates', ''],
  ['Masa Corn Flour', ''],
  ['All-Purpose Flour', ''],
  ['Mac & Cheese', '2'],
  ['Sliced Bread', ''],
  ['Hamburger Buns', ''],
  ['Hot Dog Buns', ''],
  ['Shelf Stable Milk', ''],
  ['Almond Milk', ''],
  ['Rice', ''],
  ['Pancake Mix', ''],
  ['Peanut Butter Granola', ''],
  ['Keurig Coffee Pod', ''],
  ['Misc. Drinks', ''],
];

const toRows = (prefix: string, rows: string[][]) =>
  rows.map(([item, limit], index) => ({
    id: `${prefix}-${index + 1}`,
    item,
    limit,
  }));

const TABLE_LIMIT_WIDTH = 48;
const TABLE_WANT_WIDTH = 49;
const TABLE_FONT_SIZE = 10;
const TABLE_CELL_HORIZONTAL_PADDING = 8;
const AVERAGE_TABLE_CHARACTER_WIDTH_RATIO = 0.52;

const estimateWrappedLineCount = (value: string, availableWidth: number) => {
  const maxCharsPerLine = Math.max(
    1,
    Math.floor(availableWidth / Math.max(1, TABLE_FONT_SIZE * AVERAGE_TABLE_CHARACTER_WIDTH_RATIO)),
  );

  return String(value || '').split('\n').reduce((total, line) => {
    const words = line.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      return total + 1;
    }

    let lines = 1;
    let currentLineLength = 0;
    words.forEach((word) => {
      const wordLength = word.length;
      if (currentLineLength === 0) {
        currentLineLength = wordLength;
        return;
      }

      if (currentLineLength + 1 + wordLength <= maxCharsPerLine) {
        currentLineLength += 1 + wordLength;
        return;
      }

      lines += 1;
      currentLineLength = wordLength;
    });

    return total + lines;
  }, 0);
};

const getDefaultTableRowHeight = (row: SectionTableRow) => {
  const itemWidth = DEFAULT_BUILDER_COMPONENT_WIDTH - TABLE_LIMIT_WIDTH - TABLE_WANT_WIDTH;
  const lineCount = Math.max(
    estimateWrappedLineCount(row.item, itemWidth - TABLE_CELL_HORIZONTAL_PADDING),
    estimateWrappedLineCount(row.limit, TABLE_LIMIT_WIDTH - TABLE_CELL_HORIZONTAL_PADDING),
  );

  return Math.max(DEFAULT_SECTION_TABLE_ROW_HEIGHT, DEFAULT_SECTION_TABLE_ROW_HEIGHT * lineCount);
};

const getDefaultTableHeight = (rows: SectionTableRow[]) => (
  DEFAULT_SECTION_TABLE_ROW_HEIGHT + rows.reduce((total, row) => total + getDefaultTableRowHeight(row), 0)
);

const dryGoodsTableRows = toRows('dry-goods', dryGoodsRows);
const cannedGoodsTableRows = toRows('canned-goods', [
  ['Tuna', ''],
  ['Hominy', ''],
  ['Pumpkin Puree', ''],
  ['Applesauce', ''],
  ['Green Beans', ''],
]);
const beansTableRows = toRows('beans', [
  ['Black Beans (Dried)', '1'],
  ['Great Northern Beans (Dried)', ''],
  ['Pinto Beans (Dried)', ''],
  ['Navy Beans (Dried)', ''],
]);
const produceTableRows = toRows('produce', [
  ['Apples', ''],
  ['Oranges', ''],
  ['Spaghetti Squash', ''],
  ['Parsnips', ''],
  ['Pears', ''],
  ['Potatoes', ''],
  ['Rutabagas', ''],
  ['Bananas', ''],
  ['Turnips', ''],
]);
const frozenTableRows = toRows('frozen', [
  ['Chickpeas/Garbanzo Beans', 'Choose\ntwo'],
  ['Misc. Frozen', ''],
]);
const meatTableRows = toRows('meat', [
  ['Chicken', 'Choose\none'],
  ['Turkey', ''],
  ['Fish', ''],
]);
const dairyTableRows = toRows('dairy', [
  ['Eggs', ''],
  ['Yogurt', ''],
]);
const grabGoTableRows = toRows('grab-go', [
  ['Canned Kombucha', ''],
  ['Dipping Sauce (contains\ndairy and egg)', ''],
]);
const hygieneTableRows = toRows('hygiene', [
  ['Toilet Paper', ''],
  ['Menstrual Items', ''],
  ['Toothbrush', ''],
  ['Toothpaste', ''],
  ['Razor', ''],
  ['Bar Soap', ''],
  ['Deodorant', ''],
  ['Shampoo', ''],
  ['Dish Soap', ''],
]);

export const createDefaultBuilderTemplate = (): ShoppingListBuilderTemplate => ({
  id: 'blank-shopping-list-builder-template',
  name: 'Untitled Shopping List Template',
  paper: BUILDER_PAPER,
  layoutMode: 'guided',
  bodyLayoutMode: 'split',
  gridSize: 3,
  headerHeight: DEFAULT_HEADER_HEIGHT,
  footerHeight: DEFAULT_FOOTER_HEIGHT,
  bodyColumnGap: 18,
  maxPages: 1,
  printMode: 'single-sided',
  includeCategoryIcons: DEFAULT_INCLUDE_CATEGORY_ICONS,
  components: [],
});

export const createReferenceBuilderTemplate = (): ShoppingListBuilderTemplate => ({
  id: 'phase-2-builder-reference',
  name: 'Shopping List Builder Reference Template',
  paper: BUILDER_PAPER,
  layoutMode: 'guided',
  bodyLayoutMode: 'full',
  gridSize: 3,
  headerHeight: 54,
  footerHeight: 45,
  bodyColumnGap: 18,
  maxPages: 1,
  printMode: 'single-sided',
  components: [
    {
      id: 'title',
      type: 'text',
      name: 'Document title',
      region: 'header',
      x: 28,
      y: 17,
      width: 190,
      height: 20,
      content: 'Pantry Shopping List',
      fontSize: 14,
      fontWeight: 'bold',
      align: 'left',
      lineHeight: 1,
    },
    {
      id: 'date',
      type: 'text',
      name: 'Date',
      region: 'header',
      x: 28,
      y: 36,
      width: 150,
      height: 16,
      content: 'April 23rd, 2026',
      fontSize: 10,
      fontWeight: 'normal',
      align: 'left',
      lineHeight: 1,
    },
    {
      id: 'list-number',
      type: 'text',
      name: 'List number',
      region: 'header',
      x: 258,
      y: 31,
      width: 32,
      height: 16,
      content: '#____',
      fontSize: 10,
      fontWeight: 'bold',
      align: 'right',
      lineHeight: 1,
    },
    {
      id: 'client-fields',
      type: 'form-field-group',
      name: 'Client form fields',
      region: 'body',
      x: 28,
      y: 63,
      width: 260,
      height: DEFAULT_FORM_FIELD_ROW_HEIGHT * 4,
      labelWidth: 158,
      fontSize: 10,
      fields: [
        { id: 'client-name', label: 'Client Name' },
        { id: 'household-size', label: '# of People in Household' },
        { id: 'diet', label: 'Allergies or Diet Restrictions' },
        { id: 'bags', label: '# of Bags you can carry' },
      ],
    },
    {
      id: 'instruction',
      type: 'text',
      name: 'Instruction',
      region: 'body',
      x: 28,
      y: 144,
      width: 260,
      height: 27,
      content: 'Please write how many of each item you want in\nthe "Want" column.',
      fontSize: 10,
      fontWeight: 'normal',
      align: 'left',
      lineHeight: 1.12,
    },
    {
      id: 'dry-goods',
      type: 'section-table',
      name: 'Dry Goods table',
      region: 'body',
      title: 'Dry Goods',
      x: 28,
      y: 180,
      width: 257,
      height: getDefaultTableHeight(dryGoodsTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: dryGoodsTableRows,
    },
    {
      id: 'canned-goods',
      type: 'section-table',
      name: 'Canned Goods table',
      region: 'body',
      title: 'Canned Goods',
      x: 28,
      y: 513,
      width: 257,
      height: getDefaultTableHeight(cannedGoodsTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: cannedGoodsTableRows,
    },
    {
      id: 'beans',
      type: 'section-table',
      name: 'Beans table',
      region: 'body',
      title: 'Beans',
      x: 28,
      y: 630,
      width: 257,
      height: getDefaultTableHeight(beansTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 49,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: beansTableRows,
    },
    {
      id: 'produce',
      type: 'section-table',
      name: 'Produce table',
      region: 'body',
      title: 'Produce',
      x: 324,
      y: 54,
      width: 265,
      height: getDefaultTableHeight(produceTableRows),
      showLimit: false,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 0,
      wantWidth: 59,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: produceTableRows,
    },
    {
      id: 'frozen',
      type: 'section-table',
      name: 'Frozen table',
      region: 'body',
      title: 'Frozen (choose 2)',
      x: 324,
      y: 243,
      width: 265,
      height: getDefaultTableHeight(frozenTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 58,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: frozenTableRows,
    },
    {
      id: 'meat',
      type: 'section-table',
      name: 'Meat table',
      region: 'body',
      title: 'Meat (choose 1)',
      x: 324,
      y: 324,
      width: 265,
      height: getDefaultTableHeight(meatTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 58,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: meatTableRows,
    },
    {
      id: 'dairy',
      type: 'section-table',
      name: 'Dairy table',
      region: 'body',
      title: 'Dairy (choose 3)',
      x: 324,
      y: 423,
      width: 265,
      height: getDefaultTableHeight(dairyTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 58,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: dairyTableRows,
    },
    {
      id: 'grab-go',
      type: 'section-table',
      name: 'Grab & Go table',
      region: 'body',
      title: 'Grab & Go',
      x: 324,
      y: 486,
      width: 265,
      height: getDefaultTableHeight(grabGoTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 58,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: grabGoTableRows,
    },
    {
      id: 'hygiene',
      type: 'section-table',
      name: 'Hygiene table',
      region: 'body',
      title: 'Hygiene (choose up to 5)',
      x: 324,
      y: 567,
      width: 265,
      height: getDefaultTableHeight(hygieneTableRows),
      showLimit: true,
      limitHeader: 'Limit',
      wantHeader: 'Want',
      limitWidth: 48,
      wantWidth: 58,
      fontSize: 10,
      rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
      alternateRows: true,
      rows: hygieneTableRows,
    },
    {
      id: 'footer',
      type: 'text',
      name: 'Footer note',
      region: 'footer',
      x: 28,
      y: 748,
      width: 190,
      height: 24,
      content: 'Please turn paper over',
      fontSize: 16,
      fontWeight: 'bold',
      align: 'left',
      lineHeight: 1,
    },
    {
      id: 'footer-arrow-line',
      type: 'line',
      name: 'Footer arrow line',
      region: 'footer',
      x: 205,
      y: 756,
      width: 15,
      height: 1,
      strokeWidth: 2,
      direction: 'horizontal',
    },
  ],
});

export const createBuilderComponent = (type: BuilderComponentType, x = 48, y = 48): BuilderComponent => {
  const id = `${type}-${Date.now()}`;

  switch (type) {
    case 'form-field-group':
      return {
        id,
        type,
        name: 'Form fields',
        region: 'body',
        x,
        y,
        width: DEFAULT_BUILDER_COMPONENT_WIDTH,
        height: DEFAULT_FORM_FIELD_GROUP_HEIGHT,
        labelWidth: 150,
        fontSize: 10,
        cornerRadius: 0,
        fields: [
          { id: `${id}-field-1`, label: 'Client Name' },
          { id: `${id}-field-2`, label: '# of People in Household' },
        ],
      };
    case 'section-table':
    {
      const rows = toRows(id, [
        ['Item One', ''],
        ['Item Two', ''],
        ['Item Three', ''],
      ]);

      return {
        id,
        type,
        name: 'Section table',
        region: 'body',
        title: 'New Section',
        x,
        y,
        width: DEFAULT_BUILDER_COMPONENT_WIDTH,
        height: getDefaultTableHeight(rows),
        showLimit: true,
        limitHeader: 'Limit',
        wantHeader: 'Want',
        limitWidth: DEFAULT_SECTION_TABLE_LIMIT_WIDTH,
        wantWidth: DEFAULT_SECTION_TABLE_WANT_WIDTH,
        fontSize: 10,
        rowHeight: DEFAULT_SECTION_TABLE_ROW_HEIGHT,
        alternateRows: true,
        flowMode: 'fixed',
        repeatHeaderRows: true,
        keepHeaderWithFirstRow: true,
        keepRowsTogether: true,
        cornerRadius: DEFAULT_SECTION_TABLE_CORNER_RADIUS,
        rows,
      };
    }
    case 'line':
      return {
        id,
        type,
        name: 'Line',
        region: 'body',
        x,
        y,
        width: DEFAULT_BUILDER_COMPONENT_WIDTH,
        height: 1,
        strokeWidth: 1,
        direction: 'horizontal',
      };
    case 'date':
      return {
        id,
        type: 'date',
        name: 'Date',
        region: 'body',
        x,
        y,
        width: DEFAULT_BUILDER_COMPONENT_WIDTH,
        height: 18,
        dateMode: 'today',
        formatId: DEFAULT_DATE_FORMAT_ID,
        fontSize: 12,
        fontWeight: 'normal',
        align: 'left',
        lineHeight: 1.2,
      };
    case 'language-tag':
      return {
        id,
        type: 'language-tag',
        name: 'Language tag',
        region: 'body',
        x,
        y,
        width: DEFAULT_BUILDER_COMPONENT_WIDTH,
        height: 18,
        mode: DEFAULT_LANGUAGE_TAG_MODE,
        fontSize: 12,
        fontWeight: 'normal',
        align: 'left',
        lineHeight: 1.2,
      };
    case 'legend':
      return {
        id,
        type: 'legend',
        name: 'Legend',
        region: 'body',
        x,
        y,
        width: DEFAULT_BUILDER_COMPONENT_WIDTH,
        height: 18,
        fontSize: 10,
        layout: 'horizontal',
        showLimited: true,
        limitedLabel: 'Limited supply',
        showClearance: true,
        clearanceLabel: 'Clearance',
      };
    case 'text':
    default:
      return {
        id,
        type: 'text',
        name: 'Text block',
        region: 'body',
        x,
        y,
        width: DEFAULT_BUILDER_COMPONENT_WIDTH,
        height: 32,
        content: 'Text block',
        fontSize: 10,
        fontWeight: 'normal',
        align: 'left',
        lineHeight: 1.1,
      };
  }
};
