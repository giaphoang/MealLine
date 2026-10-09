// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What the interface says about a model, in one place.
 *
 * The plan asks for the same facts twice — "a `deprecated` or `retired` model
 * shows its shutdown date and replacement, **in the dialog and as a list
 * badge**", and a frontier model warns "when chosen, and in the configuration
 * list". Writing those sentences separately in `columns.tsx` and `ServiceStep`
 * would be two phrasings of one fact, drifting apart the first time either is
 * edited: the same duplication this whole issue is about, in miniature.
 *
 * So both read from here. The list renders these as badges beside Active /
 * Inactive; the dialog renders them under the model select.
 */

import type { CatalogueModel } from './types'

export type NoticeTone = 'warning' | 'danger'

export interface ModelNotice {
  /** Badge text — short enough to sit in a table cell. */
  label: string
  tone: NoticeTone
  /** The full sentence, for hover text and for the dialog. */
  detail: string
}

/**
 * How much life a model has left, if that is worth saying.
 *
 * Until this existed, a configuration pointing at a shut-down model looked
 * exactly like one pointing at a current model, and the first sign of trouble
 * was a failed translation reported as a provider error (ISSUES.md #84,
 * defect 10).
 */
export const lifecycleNotice = (model: CatalogueModel | undefined): ModelNotice | null => {
  if (!model) return null
  const { status, shutdownDate, replacement } = model.lifecycle
  const moveTo = replacement ? ` Move to ${replacement}.` : ''

  if (status === 'retired') {
    return {
      label: 'Retired',
      tone: 'danger',
      detail: `${model.id} has been shut down and requests to it fail.${moveTo}`,
    }
  }

  if (status === 'deprecated') {
    return {
      // A dated shutdown is the one staff can act on before it lands; an
      // undated deprecation is real but not yet a deadline, and inventing a
      // date would be worse than admitting there is none.
      label: shutdownDate ? `Ends ${shutdownDate}` : 'Deprecated',
      tone: shutdownDate ? 'danger' : 'warning',
      detail: shutdownDate
        ? `${model.id} stops working on ${shutdownDate}.${moveTo}`
        : `${model.id} is deprecated.${moveTo}`,
    }
  }

  if (status === 'preview') {
    return {
      label: 'Preview',
      tone: 'warning',
      detail: `${model.id} is a provider preview and may change or be withdrawn at short notice.`,
    }
  }

  return null
}

/**
 * Whether a model costs far more than this work needs (D1, D7).
 *
 * `frontier` means an output price of $20 per 1M tokens or more. FEED's
 * translations are a sentence or two; the plan's own measurement found a
 * one-sentence translation costing 19 completion tokens at the cheapest
 * reasoning setting. Nothing about that work argues for a flagship model, and
 * the price difference between tiers is a multiple, not a margin.
 *
 * Advisory, never blocking. D1 says warn, and it is the administrator's budget.
 */
export const costNotice = (model: CatalogueModel | undefined): ModelNotice | null => {
  if (!model || model.costTier !== 'frontier') return null
  return {
    label: 'Expensive',
    tone: 'warning',
    detail:
      `${model.id} costs $${model.pricing.input}/$${model.pricing.output} per 1M tokens. ` +
      'Frontier models are far more capable than translation or classification needs, ' +
      'and are not known to translate better.',
  }
}

/** Both notices for a model, in the order they should be read. */
export const noticesFor = (model: CatalogueModel | undefined): ModelNotice[] =>
  [lifecycleNotice(model), costNotice(model)].filter(
    (notice): notice is ModelNotice => notice !== null
  )
