// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * How hard the model should think before answering.
 *
 * Three things were wrong here, and all three cost money on every request.
 * The slider offered all four levels to every model, including the ones with
 * no reasoning control at all — a level set on those was accepted by the form
 * and then silently discarded. It defaulted to `high`, the most expensive
 * setting, and did so in two places of its own beyond the Add dialog, so any
 * configuration with no stored level opened at `high` and persisted it on the
 * next save. And nothing warned that raising the level raises the cost of
 * every request from then on.
 *
 * The levels now come from the model's catalogue entry, and an unset level
 * stays unset: the backend resolves it to the cheapest value that model
 * accepts (D2), which is `low` for a model that cannot turn thinking off and
 * nothing at all for a model without the control. This step never writes a
 * level the administrator did not choose.
 */

import React from 'react'
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Brain } from "@/components/ui/icons";
import { StepWrapper } from '../shared/StepWrapper'
import { BaseStepProps } from '../shared/types'
import type { CatalogueModel } from '../types'
import { useModelCatalogue } from '@/hooks/ai-config/useModelCatalogue'

/**
 * Every storable level, cheapest first. Used for *ordering* — which level
 * counts as above medium, and what order a model's own values appear in.
 */
const COST_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
type ThinkingLevel = typeof COST_ORDER[number]

/**
 * What to offer when the catalogue has nothing to say — a Custom id, or a
 * request that has not returned.
 *
 * Deliberately not `COST_ORDER`. Offering `xhigh` or `max` for a model nobody
 * can vouch for points at the expensive end on a guess, and `none` is refused
 * by everything except GPT-5.6. These four are the values the catalogued
 * models actually use, and the backend substitutes anything a model rejects.
 */
const FALLBACK_LEVELS: readonly ThinkingLevel[] = ['minimal', 'low', 'medium', 'high']

/** Levels above this raise the cost of every request, so they are warned about. */
const WARN_ABOVE: ThinkingLevel = 'medium'

interface ThinkingLevelStepProps extends BaseStepProps {
  data: {
    thinkingLevel?: ThinkingLevel | null
    /** Present at runtime: the dialog passes the whole configuration. */
    model?: string
  }
}

/** What this model will actually accept, in cheap-to-expensive order. */
const levelsFor = (entry: CatalogueModel | undefined): ThinkingLevel[] => {
  // No entry means a Custom id, or a catalogue that has not arrived. Neither
  // is grounds for hiding the control: offer everything and let the backend
  // substitute, exactly as it does for any level a model turns out to refuse.
  if (!entry) return [...FALLBACK_LEVELS]

  const { reasoning } = entry.capabilities
  if (reasoning.kind === 'none' || reasoning.kind === 'extended') return []
  return COST_ORDER.filter((level) => reasoning.values.includes(level))
}

export function ThinkingLevelStep({
  mode,
  data,
  onChange,
  isLoading = false,
  validation,
  onBlur
}: ThinkingLevelStepProps) {
  const { models } = useModelCatalogue()
  const entry = models.find((candidate) => candidate.id === data.model)
  const levels = levelsFor(entry)

  if (levels.length === 0) {
    return (
      <StepWrapper
        icon={Brain}
        title="Thinking Level"
        description="Configure model thinking"
      >
        <p className="text-sm text-muted-foreground">
          {entry?.displayName ?? 'This model'} has no thinking or reasoning
          setting, so there is nothing to configure here. Any level saved
          against it would be ignored.
        </p>
      </StepWrapper>
    )
  }

  // An unset level is shown at the cheapest the model takes, because that is
  // what the backend will apply — but it is only *shown*. Nothing is written
  // until the administrator moves the slider, so the stored value stays unset
  // and keeps tracking the model's own cheapest setting if the model changes.
  const effective: ThinkingLevel = data.thinkingLevel ?? levels[0]
  const currentIndex = Math.max(0, levels.indexOf(effective))
  const currentLevel = levels[currentIndex] ?? levels[0]
  const isUnset = data.thinkingLevel === undefined || data.thinkingLevel === null
  const isAboveWarnThreshold =
    COST_ORDER.indexOf(currentLevel) > COST_ORDER.indexOf(WARN_ABOVE)

  return (
    <StepWrapper
      icon={Brain}
      title="Thinking Level"
      description="Configure model thinking"
    >
      <div className="space-y-2">
        <Label htmlFor="thinkingLevel">Thinking Level</Label>
        <div className="px-3">
          <Slider
            id="thinkingLevel"
            value={[currentIndex]}
            onValueChange={([value]) => onChange({ thinkingLevel: levels[value] })}
            min={0}
            max={Math.max(0, levels.length - 1)}
            step={1}
            className="w-full"
            disabled={isLoading || levels.length === 1}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            {levels.map((level) => (
              <span key={level}>{level}</span>
            ))}
          </div>
          <div className="text-center text-sm font-medium mt-2">
            {currentLevel}
            {isUnset && (
              <span className="text-muted-foreground font-normal">
                {' '}(model default)
              </span>
            )}
          </div>
        </div>
        {isAboveWarnThreshold && (
          <p className="text-xs text-destructive">
            Thinking above medium raises the cost of every request this
            configuration makes, and translation rarely reads better for it.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Lower values = faster responses, Higher values = slower responses, higher quality
        </p>
      </div>
    </StepWrapper>
  )
}
