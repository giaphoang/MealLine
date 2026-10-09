// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The example Shopping List Builder template, and the saved components it was
 * built from.
 *
 * Authored by hand in the Builder against the example inventory, then captured
 * here. It exists because the Builder is the hardest feature in FEED to
 * discover and the least served by documentation: a template that already binds
 * a real inventory-backed section table to real categories and limits teaches
 * more than any prose. It is documentation that runs.
 *
 * ## Why the ids are symbolic
 *
 * The authored template referenced categories and food items by **database
 * id** — `categoryId: 14`, `foodItemId: 177`, and component ids like
 * `inventory-category-14-instance-...`. Those ids are not stable: SQLite keeps
 * an autoincrement high-water mark in `sqlite_sequence` that survives the
 * deletes a reset performs, so the same seed run twice produces different ids,
 * and a different instance produces different ids again.
 *
 * Embedding them literally would bind the example table to whatever rows happen
 * to hold those ids later — the wrong food items, or none. That is the same
 * identity problem that makes restore replace rather than merge
 * (docs/data-management/beta-6-backup-restore-brief.md).
 *
 * So ids are stored as `@@CAT:Name@@` / `@@ITEM:Name@@` placeholders and
 * resolved against the rows the seed just created. Names are the stable key
 * here; the seed owns both sides of that mapping.
 */

export const EXAMPLE_TEMPLATE_NAME = 'Example Shopping List Template';

/** Category and item names this template expects the illustrative layer to create. */
export const TEMPLATE_REQUIRES = {
  categories: ['Dairy', 'Meat', 'Produce'],
  items: ['Apples', 'Beef', 'Cheese', 'Chicken', 'Grapes', 'Milk', 'Pork', 'Yogurt'],
} as const;

/** Reusable building blocks, so a new template starts with pieces to drag in. */
export const EXAMPLE_SAVED_COMPONENTS: readonly {
  name: string;
  componentType: string;
  componentData: unknown;
}[] = [
  {
    "name": "Page flip notice",
    "componentType": "text",
    "componentData": {
      "id": "text-1785889019553",
      "type": "text",
      "name": "Page flip notice",
      "region": "footer",
      "x": 21,
      "y": 756,
      "width": 267,
      "height": 18,
      "content": "Please turn paper over \u27a1",
      "fontSize": 12,
      "fontWeight": "bold",
      "align": "left",
      "lineHeight": 1.1
    }
  },
  {
    "name": "Title",
    "componentType": "text",
    "componentData": {
      "id": "text-1785888615469",
      "type": "text",
      "name": "Title",
      "region": "header",
      "x": 21,
      "y": 18,
      "width": 148,
      "height": 18,
      "content": "Pantry Shopping List",
      "fontSize": 14,
      "fontWeight": "bold",
      "align": "left",
      "lineHeight": 1,
      "translationMode": "skip"
    }
  },
  {
    "name": "Language tag",
    "componentType": "language-tag",
    "componentData": {
      "id": "language-tag-1785888860161",
      "type": "language-tag",
      "name": "Language tag",
      "region": "header",
      "x": 174,
      "y": 15,
      "width": 72,
      "height": 13,
      "mode": "hide-english",
      "fontSize": 12,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.2
    }
  },
  {
    "name": "Date",
    "componentType": "date",
    "componentData": {
      "id": "date-1785888780662",
      "type": "date",
      "name": "Date",
      "region": "body",
      "x": 21,
      "y": 81,
      "width": 267,
      "height": 18,
      "dateMode": "today",
      "formatId": "long-ordinal",
      "fontSize": 12,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.2,
      "translationMode": "skip"
    }
  },
  {
    "name": "Custom form fields",
    "componentType": "form-field-group",
    "componentData": {
      "id": "form-field-group-1785888507638",
      "type": "form-field-group",
      "name": "Custom form fields",
      "region": "body",
      "x": 21,
      "y": 168,
      "width": 267,
      "height": 36,
      "labelWidth": 150,
      "fontSize": 10,
      "cornerRadius": 9,
      "fields": [
        {
          "id": "form-field-group-1785888507638-field-1",
          "label": "Client Name:",
          "translationMode": "translate-with-original-block"
        },
        {
          "id": "form-field-group-1785888507638-field-2",
          "label": "Household size:",
          "translationMode": "translate-with-original-block"
        },
        {
          "id": "form-field-group-1785888507638-field-1785889195102",
          "label": "Dietary needs or allergies:",
          "translationMode": "translate-with-original-block"
        },
        {
          "id": "form-field-group-1785888507638-field-1785889232376",
          "label": "Total bags can you carry:",
          "translationMode": "translate-with-original-block"
        }
      ],
      "showColumnDividers": false
    }
  },
  {
    "name": "Instructions",
    "componentType": "text",
    "componentData": {
      "id": "text-1785888599505",
      "type": "text",
      "name": "Instructions",
      "region": "body",
      "x": 21,
      "y": 111,
      "width": 267,
      "height": 24,
      "content": "Please write how many of each item you want in the \u201cWant\u201d column.",
      "fontSize": 10,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.1
    }
  },
  {
    "name": "Legend",
    "componentType": "legend",
    "componentData": {
      "id": "legend-1785888989597",
      "type": "legend",
      "name": "Legend",
      "region": "body",
      "x": 21,
      "y": 147,
      "width": 267,
      "height": 18,
      "fontSize": 10,
      "layout": "horizontal",
      "showLimited": true,
      "limitedLabel": "= Limited supply",
      "showClearance": true,
      "clearanceLabel": "= Clearance"
    }
  },
  {
    "name": "List number",
    "componentType": "text",
    "componentData": {
      "id": "text-1785888716415",
      "type": "text",
      "name": "List number",
      "region": "header",
      "x": 252,
      "y": 20,
      "width": 32,
      "height": 16,
      "content": "#_____",
      "fontSize": 10,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.1,
      "translationMode": "skip"
    }
  }
];

/**
 * Template body with `@@CAT:` / `@@ITEM:` placeholders where ids belong.
 *
 * Exported so a test can assert no literal id ever creeps back in — that is the
 * property the whole placeholder scheme exists to guarantee.
 */
export const TEMPLATE_BLUEPRINT = {
  "id": "blank-shopping-list-builder-template",
  "name": "Example Shopping List Template",
  "paper": {
    "size": "letter",
    "width": 612,
    "height": 792,
    "unit": "pt"
  },
  "layoutMode": "guided",
  "bodyLayoutMode": "split",
  "gridSize": 3,
  "headerHeight": 36,
  "footerHeight": 36,
  "bodyColumnGap": 18,
  "maxPages": 1,
  "printMode": "single-sided",
  "includeCategoryIcons": true,
  "components": [
    {
      "id": "text-1785888615469",
      "type": "text",
      "name": "Title",
      "region": "header",
      "x": 21,
      "y": 18,
      "width": 148,
      "height": 18,
      "content": "Pantry Shopping List",
      "fontSize": 14,
      "fontWeight": "bold",
      "align": "left",
      "lineHeight": 1,
      "translationMode": "skip"
    },
    {
      "id": "date-1785888780662",
      "type": "date",
      "name": "Date",
      "region": "body",
      "x": 21,
      "y": 81,
      "width": 267,
      "height": 18,
      "dateMode": "today",
      "formatId": "long-ordinal",
      "fontSize": 12,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.2,
      "translationMode": "skip"
    },
    {
      "id": "form-field-group-1785888507638",
      "type": "form-field-group",
      "name": "Custom form fields",
      "region": "body",
      "x": 21,
      "y": 168,
      "width": 267,
      "height": 36,
      "labelWidth": 150,
      "fontSize": 10,
      "cornerRadius": 9,
      "fields": [
        {
          "id": "form-field-group-1785888507638-field-1",
          "label": "Client Name:",
          "translationMode": "translate-with-original-block"
        },
        {
          "id": "form-field-group-1785888507638-field-2",
          "label": "Household size:",
          "translationMode": "translate-with-original-block"
        },
        {
          "id": "form-field-group-1785888507638-field-1785889195102",
          "label": "Dietary needs or allergies:",
          "translationMode": "translate-with-original-block"
        },
        {
          "id": "form-field-group-1785888507638-field-1785889232376",
          "label": "Total bags can you carry:",
          "translationMode": "translate-with-original-block"
        }
      ],
      "showColumnDividers": false
    },
    {
      "id": "text-1785888599505",
      "type": "text",
      "name": "Instructions",
      "region": "body",
      "x": 21,
      "y": 111,
      "width": 267,
      "height": 24,
      "content": "Please write how many of each item you want in the \u201cWant\u201d column.",
      "fontSize": 10,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.1
    },
    {
      "id": "text-1785888716415",
      "type": "text",
      "name": "List number",
      "region": "header",
      "x": 252,
      "y": 20,
      "width": 32,
      "height": 16,
      "content": "#_____",
      "fontSize": 10,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.1,
      "translationMode": "skip"
    },
    {
      "id": "language-tag-1785888860161",
      "type": "language-tag",
      "name": "Language tag",
      "region": "header",
      "x": 174,
      "y": 15,
      "width": 72,
      "height": 13,
      "mode": "hide-english",
      "fontSize": 12,
      "fontWeight": "normal",
      "align": "left",
      "lineHeight": 1.2
    },
    {
      "id": "legend-1785888989597",
      "type": "legend",
      "name": "Legend",
      "region": "body",
      "x": 21,
      "y": 147,
      "width": 267,
      "height": 18,
      "fontSize": 10,
      "layout": "horizontal",
      "showLimited": true,
      "limitedLabel": "= Limited supply",
      "showClearance": true,
      "clearanceLabel": "= Clearance"
    },
    {
      "id": "inventory-category-@@CAT:Produce@@-instance",
      "type": "section-table",
      "name": "Produce inventory table",
      "title": "Produce",
      "x": 21,
      "y": 291,
      "width": 267,
      "height": 45,
      "showLimit": true,
      "limitHeader": "Limit",
      "wantHeader": "Want",
      "limitWidth": 51,
      "wantWidth": 57,
      "fontSize": 10,
      "rowHeight": 15,
      "alternateRows": true,
      "flowMode": "flowing",
      "repeatHeaderRows": true,
      "keepHeaderWithFirstRow": true,
      "keepRowsTogether": true,
      "cornerRadius": 9,
      "categoryLimit": null,
      "categoryLimitType": "household",
      "translationSettings": {
        "headers": "translate",
        "tags": "translate",
        "rows": "translate-with-original-adaptive"
      },
      "rows": [
        {
          "id": "inventory-item-@@ITEM:Apples@@",
          "item": "Apples",
          "limit": "",
          "limitSource": "none",
          "isLimited": false,
          "isClearance": false
        },
        {
          "id": "inventory-item-@@ITEM:Grapes@@",
          "item": "Grapes",
          "limit": "",
          "limitSource": "none",
          "isLimited": false,
          "isClearance": false
        }
      ],
      "inventorySource": {
        "categoryName": "Produce",
        "categoryIcon": "apple"
      },
      "region": "body"
    },
    {
      "id": "inventory-category-@@CAT:Meat@@-instance",
      "type": "section-table",
      "name": "Meat inventory table",
      "title": "Meat",
      "x": 21,
      "y": 354,
      "width": 267,
      "height": 72,
      "showLimit": true,
      "limitHeader": "Limit",
      "wantHeader": "Want",
      "limitWidth": 51,
      "wantWidth": 57,
      "fontSize": 10,
      "rowHeight": 15,
      "alternateRows": true,
      "flowMode": "flowing",
      "repeatHeaderRows": true,
      "keepHeaderWithFirstRow": true,
      "keepRowsTogether": true,
      "cornerRadius": 9,
      "categoryLimit": 3,
      "categoryLimitType": "household",
      "translationSettings": {
        "headers": "translate",
        "tags": "translate",
        "rows": "translate-with-original-adaptive"
      },
      "rows": [
        {
          "id": "inventory-item-@@ITEM:Beef@@",
          "item": "Beef",
          "limit": "1",
          "limitSource": "food-item",
          "isLimited": false,
          "isClearance": false
        },
        {
          "id": "inventory-item-@@ITEM:Chicken@@",
          "item": "Chicken",
          "limit": "1",
          "limitSource": "food-item",
          "isLimited": true,
          "isClearance": false
        },
        {
          "id": "inventory-item-@@ITEM:Pork@@",
          "item": "Pork",
          "limit": "1",
          "limitSource": "food-item",
          "isLimited": false,
          "isClearance": false
        }
      ],
      "inventorySource": {
        "categoryName": "Meat",
        "categoryIcon": "drumstick"
      },
      "region": "body"
    },
    {
      "id": "inventory-category-@@CAT:Dairy@@-instance",
      "type": "section-table",
      "name": "Dairy inventory table",
      "title": "Dairy",
      "x": 21,
      "y": 417,
      "width": 267,
      "height": 72,
      "showLimit": true,
      "limitHeader": "Limit",
      "wantHeader": "Want",
      "limitWidth": 51,
      "wantWidth": 57,
      "fontSize": 10,
      "rowHeight": 15,
      "alternateRows": true,
      "flowMode": "flowing",
      "repeatHeaderRows": true,
      "keepHeaderWithFirstRow": true,
      "keepRowsTogether": true,
      "cornerRadius": 9,
      "categoryLimit": 3,
      "categoryLimitType": "household",
      "translationSettings": {
        "headers": "translate",
        "tags": "translate",
        "rows": "translate-with-original-adaptive"
      },
      "rows": [
        {
          "id": "inventory-item-@@ITEM:Cheese@@",
          "item": "Cheese",
          "limit": "1",
          "limitSource": "food-item",
          "isLimited": false,
          "isClearance": false
        },
        {
          "id": "inventory-item-@@ITEM:Milk@@",
          "item": "Milk",
          "limit": "1",
          "limitSource": "food-item",
          "isLimited": false,
          "isClearance": false
        },
        {
          "id": "inventory-item-@@ITEM:Yogurt@@",
          "item": "Yogurt",
          "limit": "1",
          "limitSource": "food-item",
          "isLimited": false,
          "isClearance": true
        }
      ],
      "inventorySource": {
        "categoryName": "Dairy",
        "categoryIcon": "glass-water"
      },
      "region": "body"
    },
    {
      "id": "text-1785889019553",
      "type": "text",
      "name": "Page flip notice",
      "region": "footer",
      "x": 21,
      "y": 756,
      "width": 267,
      "height": 18,
      "content": "Please turn paper over \u27a1",
      "fontSize": 12,
      "fontWeight": "bold",
      "align": "left",
      "lineHeight": 1.1
    }
  ]
};

/**
 * Substitute real ids for the placeholders.
 *
 * Throws rather than guessing if a name is missing: a template silently bound
 * to nothing renders an empty table, which looks like a Builder bug rather than
 * a seeding one.
 */
export const buildExampleTemplateData = (
  categoryIds: ReadonlyMap<string, number>,
  itemIds: ReadonlyMap<string, number>
): unknown => {
  const resolve = (_match: string, kind: string, name: string): string => {
    const id = kind === 'CAT' ? categoryIds.get(name) : itemIds.get(name);
    if (id === undefined) {
      throw new Error(
        `Example template references ${kind === 'CAT' ? 'category' : 'food item'} "${name}", ` +
          'which the seed did not create.'
      );
    }
    return String(id);
  };

  // One pass over the serialised form: the placeholders appear both as whole
  // values and embedded inside id strings, so a string replace covers both
  // without walking the tree twice.
  const withIds = JSON.stringify(TEMPLATE_BLUEPRINT).replace(
    /@@(CAT|ITEM):([^@]+)@@/g,
    resolve
  );

  const parsed = JSON.parse(withIds) as {
    components: {
      inventorySource?: { categoryName: string; categoryId?: number };
      rows?: { item: string; foodItemId?: number }[];
    }[];
  };

  // The numeric fields were stripped when this was captured; put them back from
  // the same map so the data matches what the Builder writes itself.
  for (const component of parsed.components) {
    if (component.inventorySource) {
      component.inventorySource.categoryId = categoryIds.get(
        component.inventorySource.categoryName
      );
    }
    for (const row of component.rows ?? []) {
      row.foodItemId = itemIds.get(row.item);
    }
  }

  return parsed;
};
