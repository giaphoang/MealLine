// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

/**
 * Data-shaping flags: a non-destructive classification overlay on procurement
 * observations (D19).
 *
 * The whole design rests on one separation. An **observation** — when, from
 * whom, how much, from which source record — is an immutable fact. What that
 * observation *means* for a given question ("is this retained inventory?", "is
 * this food?", "can we rely on it?") is an **interpretation**, and it lives
 * here as a reversible overlay. Nothing in this module edits, hides, or deletes
 * an observation; callers ask which flags apply and decide for themselves what
 * to do about it.
 *
 * That is what lets "received" and "retained inventory" be two different,
 * equally honest answers computed from the same rows (D21), instead of one
 * number that has quietly been made to mean both.
 *
 * These functions are deliberately pure and Prisma-free so the matching
 * semantics can be tested exhaustively without a database.
 */

/**
 * Flags that change a metric's total. A view that honors one of these is
 * obliged to disclose what it removed and how much — silent exclusion is as
 * dishonest as silent inflation (D15, generalized).
 */
export const EXCLUSION_FLAGS = ['pass_through', 'other_exclusion'] as const;

/**
 * Flags that change meaning and confidence but never the math. These make
 * dependence, fragility, and imprecision legible without quietly moving a
 * number the agency has already reported.
 */
export const ANNOTATION_FLAGS = ['at_risk', 'estimated', 'program_bound'] as const;

export type ExclusionFlag = (typeof EXCLUSION_FLAGS)[number];
export type AnnotationFlag = (typeof ANNOTATION_FLAGS)[number];
export type DataShapingFlag = ExclusionFlag | AnnotationFlag;

export type FlagFamily = 'exclusion' | 'annotation';

/**
 * Derived from the flag rather than stored alongside it, so a rule's family can
 * never contradict its flag.
 */
export const FLAG_FAMILY: Record<DataShapingFlag, FlagFamily> = {
  pass_through: 'exclusion',
  other_exclusion: 'exclusion',
  at_risk: 'annotation',
  estimated: 'annotation',
  program_bound: 'annotation',
};

export const ALL_FLAGS: DataShapingFlag[] = [...EXCLUSION_FLAGS, ...ANNOTATION_FLAGS];

/** What each flag asserts. Surfaced in the Data Management UI verbatim. */
export const FLAG_DESCRIPTIONS: Record<DataShapingFlag, string> = {
  pass_through:
    'Received, then relayed to another agency. A real donation event, but not this pantry’s inventory.',
  other_exclusion:
    'Weight that should not count toward supply for a reason the built-in flags do not cover. Say what and why in the note — it is required.',
  at_risk: 'Supply that depends on a fragile or temporary arrangement.',
  estimated: 'Lower-resolution data, such as a monthly total with no per-delivery detail.',
  program_bound: 'Tied to a time-limited external program rather than ongoing supply.',
};

export const RULE_SCOPES = ['donor', 'category', 'date_range', 'event'] as const;
export type RuleScope = (typeof RULE_SCOPES)[number];

/**
 * Namespaces a rule may target. `legacy_community` is listed ahead of its
 * import path landing (D16) so a rule authored today keeps working when that
 * data arrives — a rule naming a namespace that holds no data simply matches
 * nothing, which is the correct behavior either way.
 */
export const PROCUREMENT_RULE_SOURCES = ['ofb', 'ofb_pickup', 'legacy_community'] as const;
export type ProcurementRuleSource = (typeof PROCUREMENT_RULE_SOURCES)[number];

/**
 * The flag vocabulary, shipped to the UI so the options staff see are the
 * options the evaluator actually understands — no second, drifting list.
 */
export const DATA_SHAPING_CATALOG = ALL_FLAGS.map((flag) => ({
  flag,
  family: FLAG_FAMILY[flag],
  description: FLAG_DESCRIPTIONS[flag],
}));

export interface DataShapingRule {
  id?: number;
  flag: DataShapingFlag;
  scope: RuleScope;
  /**
   * Primary matcher for `donor` scope. Either identifier is sufficient and a
   * rule may carry both: OFB's donor codes are stabler than its names (which
   * demonstrably drift), while legacy rows carry only a canonical name.
   */
  donorName?: string | null;
  donorCode?: string | null;
  /** Primary matcher for `category` scope. */
  productCode?: string | null;
  /** Primary matcher for `event` scope. */
  orderRevisionId?: number | null;
  /** Narrows any scope to one namespace; absent means every namespace. */
  source?: string | null;
  /** Inclusive ISO `YYYY-MM-DD` bounds; narrow any scope. */
  startDate?: string | null;
  endDate?: string | null;
  enabled?: boolean;
  note?: string | null;
}

/**
 * One observation, flattened for matching. Flags resolve at line level because
 * weight lives on lines: a donor-scoped rule reaches a line through its parent
 * event, while a category-scoped rule addresses the line directly.
 */
export interface ObservationContext {
  orderRevisionId: number;
  source: string;
  /** ISO `YYYY-MM-DD`. */
  deliveryDate: string;
  /** Null where the source reports no donor — never inferred (D4). */
  donorName: string | null;
  /** Null for sources that report no donor code, e.g. legacy monthly rows. */
  donorCode: string | null;
  /** Null for sources that carry no product detail, e.g. legacy monthly rows. */
  productCode: string | null;
}

export function isDataShapingFlag(value: string): value is DataShapingFlag {
  return (ALL_FLAGS as string[]).includes(value);
}

export function isRuleScope(value: string): value is RuleScope {
  return (RULE_SCOPES as readonly string[]).includes(value);
}

export function flagsByFamily(flags: DataShapingFlag[], family: FlagFamily): DataShapingFlag[] {
  return flags.filter((flag) => FLAG_FAMILY[flag] === family);
}

/**
 * Donor names are compared case- and whitespace-insensitively. This is
 * tolerance in matching, not inference of identity (D4): the rule still names
 * the donor the source reported, it simply is not defeated by a stray double
 * space or a capitalization change between exports.
 */
function normalizeDonor(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const collapsed = value.trim().replace(/\s+/g, ' ').toLowerCase();
  return collapsed === '' ? null : collapsed;
}

/** Donor codes are compared trimmed and case-insensitively. */
function normalizeCode(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed === '' ? null : trimmed;
}

/**
 * Structural validation. Returns human-readable problems; an empty array means
 * the rule is well-formed. A rule whose scope and matchers disagree is rejected
 * rather than silently matching more (or less) than its author intended.
 */
export function validateRule(rule: DataShapingRule): string[] {
  const errors: string[] = [];

  if (!isDataShapingFlag(rule.flag)) {
    errors.push(`Unknown flag "${rule.flag}".`);
  }
  if (!isRuleScope(rule.scope)) {
    errors.push(`Unknown scope "${rule.scope}".`);
  }

  switch (rule.scope) {
    case 'donor':
      if (!normalizeDonor(rule.donorName) && !normalizeCode(rule.donorCode)) {
        errors.push('A donor rule requires donorName, donorCode, or both.');
      }
      break;
    case 'category':
      if (!rule.productCode?.trim()) errors.push('A category rule requires productCode.');
      break;
    case 'event':
      if (rule.orderRevisionId === null || rule.orderRevisionId === undefined) {
        errors.push('An event rule requires orderRevisionId.');
      }
      break;
    case 'date_range':
      if (!rule.startDate && !rule.endDate) {
        errors.push('A date-range rule requires startDate, endDate, or both.');
      }
      break;
    default:
      break;
  }

  if (rule.startDate && rule.endDate && rule.startDate > rule.endDate) {
    errors.push('startDate must not be after endDate.');
  }

  // An unexplained catch-all exclusion is exactly the silent exclusion this
  // design forbids: it removes weight from a total and leaves no one able to
  // say why. The note is the disclosure, so it is mandatory here.
  if (rule.flag === 'other_exclusion' && !rule.note?.trim()) {
    errors.push('An "other exclusion" rule requires a note explaining what is excluded and why.');
  }

  return errors;
}

/** Whether a single rule applies to one observation. */
export function ruleMatches(rule: DataShapingRule, context: ObservationContext): boolean {
  if (rule.enabled === false) return false;

  // General narrowers first — cheapest, and they apply to every scope.
  if (rule.source && rule.source !== context.source) return false;
  // ISO YYYY-MM-DD compares correctly as text, so no date parsing is needed.
  if (rule.startDate && context.deliveryDate < rule.startDate) return false;
  if (rule.endDate && context.deliveryDate > rule.endDate) return false;

  switch (rule.scope) {
    case 'donor': {
      // Either identifier is sufficient, so a rule keyed on OFB's donor code
      // survives OFB renaming the donor, and a rule keyed on the name still
      // reaches legacy rows that carry no code.
      const ruleCode = normalizeCode(rule.donorCode);
      const observedCode = normalizeCode(context.donorCode);
      if (ruleCode !== null && ruleCode === observedCode) return true;

      const ruleName = normalizeDonor(rule.donorName);
      const observedName = normalizeDonor(context.donorName);
      return ruleName !== null && ruleName === observedName;
    }
    case 'category':
      return !!rule.productCode && rule.productCode === context.productCode;
    case 'event':
      return rule.orderRevisionId === context.orderRevisionId;
    case 'date_range':
      // The date narrowers above are the whole matcher for this scope.
      return !!(rule.startDate || rule.endDate);
    default:
      return false;
  }
}

/**
 * Every flag that applies to one observation, deduped and in a stable order.
 * Multiple rules may contribute the same flag; that is not an error, it just
 * means more than one reason applies.
 */
export function resolveFlags(
  rules: DataShapingRule[],
  context: ObservationContext
): DataShapingFlag[] {
  const matched = new Set<DataShapingFlag>();
  for (const rule of rules) {
    if (ruleMatches(rule, context)) matched.add(rule.flag);
  }
  return ALL_FLAGS.filter((flag) => matched.has(flag));
}

/**
 * Whether an observation should be left out of a metric that honors
 * `honoredExclusions`. Annotation flags are never excluding, whatever a caller
 * passes — that distinction is the point of the two families.
 */
export function isExcluded(
  flags: DataShapingFlag[],
  honoredExclusions: readonly DataShapingFlag[]
): boolean {
  return flags.some(
    (flag) => FLAG_FAMILY[flag] === 'exclusion' && honoredExclusions.includes(flag)
  );
}
