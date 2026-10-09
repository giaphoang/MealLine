// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { INCLUDED_TABLES } from '../backup/table-contract';

/**
 * What a partial restore may select.
 *
 * Not arbitrary table checkboxes: the tables are not independent, and a
 * selection that is not **closed under foreign keys** produces rows pointing at
 * rows that were not restored. Each unit here is closed, and `requires` names
 * the units that must come with it.
 *
 * The names and groupings match `DATABASE_SUMMARY_GROUPS` on the Database tab
 * so that the vocabulary staff read is the vocabulary restore uses.
 */

export type UnitId =
  | 'staffRoster'
  | 'inventory'
  | 'languages'
  | 'shoppingLists'
  | 'nourish'
  | 'procurement'
  | 'service'
  | 'configuration';

export interface RestoreUnit {
  id: UnitId;
  label: string;
  /** Plain-language description of what reverting this unit means. */
  description: string;
  tables: readonly string[];
  /** Units that must be restored alongside this one to stay FK-closed. */
  requires: readonly UnitId[];
}

export const RESTORE_UNITS: readonly RestoreUnit[] = [
  {
    id: 'staffRoster',
    label: 'Staff roster',
    description:
      'Staff accounts without administrator authority. The administrator performing the restore keeps their role.',
    tables: ['User'],
    requires: [],
  },
  {
    id: 'languages',
    label: 'Languages & translations',
    description: 'Enabled languages and the translation cache.',
    tables: ['Language', 'Translation'],
    // `Translation.classificationPromptId` points at `SystemPrompt`, which
    // lives in the configuration unit. Nothing declared that, so restoring
    // translations onto an instance whose prompt ids differed aborted the
    // whole operation. `Translation.documentId` reaches outside too, at a
    // table no unit carries — that one is blanked on insert instead, see
    // RESTORE_NULLED_REFERENCES.
    requires: ['configuration'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description:
      'Categories, food items, their translations, limits, and the recorded history of stock changes.',
    // FoodItemTranslation and the inventory events reference FoodItem/Category
    // by autoincrement id, which is exactly why this unit cannot be split.
    tables: [
      'Category',
      'CategoryTranslation',
      'FoodItem',
      'FoodItemTranslation',
      'GlobalLimit',
      'FoodItemInventoryEvent',
      'CategoryInventoryEvent',
    ],
    // Nothing. Every foreign key in this unit points inside it, which makes
    // Inventory the only unit that is closed on its own.
    //
    // This used to require `languages`, and that edge had no foreign key
    // behind it: `CategoryTranslation.language` and
    // `FoodItemTranslation.language` are TEXT columns holding a language
    // *name*, and no table in the schema references `Language` at all. The
    // edge encoded a reasonable worry — translated item names for a language
    // the instance has not enabled — but it encoded it as a hard dependency,
    // so selecting Inventory pulled in Languages, and Languages' own broken
    // reference aborted a restore that Inventory alone completes cleanly.
    // A semantic association of that kind belongs in the dialog copy.
    requires: [],
  },
  {
    id: 'shoppingLists',
    label: 'Shopping lists',
    description: 'Builder templates and saved components.',
    // Section tables bind to categories and items, so inventory comes too.
    tables: [
      'ShoppingListTemplate',
      'ShoppingListSection',
      'ShoppingListBuilderTemplate',
      'ShoppingListBuilderComponent',
    ],
    requires: ['inventory'],
  },
  {
    id: 'nourish',
    label: 'MealLine fulfilment',
    description: 'Client households and revisions, retained phone text, follow-ups, intakes, baskets, volunteers (without credentials), and deliveries. Contains household contact information. Synchronization receipts are cleared; restored contacts require fresh phone verification. Pause the phone worker during recovery. Select matching Inventory too for pending baskets from another installation; conflicting food identities are refused safely.',
    tables: ['NourishClient', 'NourishClientRevision', 'NourishPhoneCall', 'NourishChangeRequest', 'NourishDeliveryEvent', 'NourishIntake', 'NourishBasket', 'NourishVolunteer', 'NourishDelivery'],
    // Basket JSON is a semantic association, not an FK dependency. A pre-swap
    // identity check protects pending allocations without unnecessarily
    // overwriting this installation's inventory during a same-instance restore.
    requires: [],
  },
  {
    id: 'procurement',
    label: 'Procurement',
    description: 'Imports, order revisions, products, lines, and data rules.',
    // Genuinely independent: procurement identity comes from natural keys
    // (source order references, the unified file hash), not from inventory ids.
    // That independence is what makes it the most useful unit in practice.
    tables: [
      'ProcurementImport',
      'ProcurementOrderRevision',
      'ProcurementProduct',
      'ProcurementLine',
      'ProcurementDataRule',
    ],
    requires: [],
  },
  {
    id: 'service',
    label: 'Service',
    description: 'Formal service imports, profiles, quality evidence, capacity plans, and operational metrics.',
    tables: [
      'ServiceImport',
      'ServiceClient',
      'ServicePerson',
      'ServiceEncounterRevision',
      'ServiceEncounterPerson',
      'ServiceClientProfileRevision',
      'ServiceClientProfileResponse',
      'ServicePersonProfileRevision',
      'ServicePersonProfileResponse',
      'ServiceQualityIssue',
      'ServiceQualityIssueDecision',
      'ServiceSourceResolution',
      'ServiceMetricDefinition',
      'ServiceMetricDefinitionRevision',
      'ServiceMetricObservationRevision',
      'ServiceDayStatusRevision',
      'ServiceCapacityPlan',
      'ServiceCapacityPlanRevision',
      'ServiceCapacityTarget',
      'LottoQueueSyncRun',
      'LottoQueueSessionRevision',
      'LottoQueueTicketObservation',
      'LottoQueueQualityIssue',
      'LottoQueueSessionResolution',
    ],
    requires: [],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    description:
      'Branding and assets, export settings, operating hours, published-data settings, system prompts, formatting, saved text, and AI models (without their keys).',
    tables: [
      'ExportSettings',
      'OperatingHoursRevision',
      'DeploymentSettings',
      'SystemPrompt',
      'FormattingChoice',
      'SavedCustomText',
      'AIConfiguration',
      'BrandConfiguration',
      'BrandAsset',
    ],
    requires: [],
  },
];

const BY_ID = new Map(RESTORE_UNITS.map(unit => [unit.id, unit]));

/**
 * Expand a selection to include everything it depends on.
 *
 * The modal auto-selects dependencies and says why, rather than refusing —
 * refusing makes the user solve a graph problem that the code already knows the
 * answer to. Returns the closure plus the units that were added on the user's
 * behalf, so the UI can explain itself.
 */
export const closeSelection = (
  selected: readonly UnitId[]
): { units: UnitId[]; added: UnitId[] } => {
  const closure = new Set<UnitId>();

  const visit = (id: UnitId): void => {
    if (closure.has(id)) return;
    closure.add(id);
    const unit = BY_ID.get(id);
    if (!unit) throw new Error(`Unknown restore unit: ${id}`);
    unit.requires.forEach(visit);
  };

  selected.forEach(visit);

  const chosen = new Set(selected);
  const added = [...closure].filter(id => !chosen.has(id));

  return { units: [...closure], added };
};

/** Every table the given units cover, in a stable order. */
export const tablesFor = (units: readonly UnitId[]): string[] => {
  const set = new Set<string>();
  for (const id of units) {
    const unit = BY_ID.get(id);
    if (!unit) throw new Error(`Unknown restore unit: ${id}`);
    unit.tables.forEach(table => set.add(table));
  }
  // Order by the backup contract so imports follow a predictable sequence.
  return INCLUDED_TABLES.filter(table => set.has(table));
};

export const unitById = (id: UnitId): RestoreUnit | undefined => BY_ID.get(id);
