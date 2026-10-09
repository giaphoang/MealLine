// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { PrismaClient, type AIConfiguration } from '@prisma/client';
import { wouldExceedLimit } from '../../config/limits';
import { alertService } from '../alerts';
import { convertToPerTokenRate } from '../token/calculation';

const prisma = new PrismaClient();

interface TokenUsageCheck {
  canProceed: boolean;
  remainingTokens: number;
  warningLevel: 'WARNING' | 'ELEVATED_WARNING' | 'FINAL_WARNING' | null;
  reason?: string;
}

interface UsagePeriod {
  dailyCost: number;
  monthlyCost: number;
}

export class LimitEnforcementService {
  private static instance: LimitEnforcementService;

  /**
   * The share of the input estimate booked as output when pricing a request.
   *
   * Deliberately a ratio, and deliberately still this one — `calculateCost`
   * records why the better-looking alternative would make this limit protect
   * less than it does today.
   */
  private readonly OUTPUT_TO_INPUT_RATIO = 0.5;

  /**
   * Configurations already reported as having an unenforceable cost limit.
   *
   * This check sits before every translation, and `createAlert` writes a row
   * and emits an event, so alerting per request would bury the alert list
   * during a bulk import. Once per configuration per process is enough to be
   * seen, and resets on restart — which for a service redeployed on every
   * release is a reasonable cadence to be reminded.
   */
  private readonly unmeteredWarned = new Set<number>();

  private constructor() {}

  public static getInstance(): LimitEnforcementService {
    if (!LimitEnforcementService.instance) {
      LimitEnforcementService.instance = new LimitEnforcementService();
    }
    return LimitEnforcementService.instance;
  }

  async checkTokenUsage(
    estimatedInputTokens: number,
    config: AIConfiguration
  ): Promise<TokenUsageCheck> {
    if (!config.model || !config.id) {
      throw new Error('Model configuration required for limit enforcement.');
    }

    const usage = await this.getCurrentUsage(config.id);
    
    const dailyCostLimit = config.dailyCostLimit && config.dailyCostLimit > 0
      ? config.dailyCostLimit
      : null;
    const monthlyCostLimit = config.monthlyCostLimit && config.monthlyCostLimit > 0
      ? config.monthlyCostLimit
      : null;
    
    // A cost limit with no price behind it cannot fire. `estimatedCost` is
    // zero, `usage.dailyCost` sums a `totalCost` written at the same zero
    // rate, and both comparisons below reduce to `0 + 0 > limit` on every
    // request — so the limit reads as protection while stopping nothing
    // (defect 6, ISSUES.md #84).
    //
    // The API now refuses to save this pair, but rows saved before it did,
    // and restore-from-backup and the scripts directory write configurations
    // without passing through the route at all. Translation is allowed to
    // continue: this is a configuration defect, and halting the pantry's
    // translations over it would be a worse outcome than spend that is
    // uncapped but now visible.
    if (dailyCostLimit !== null || monthlyCostLimit !== null) {
      const inputRate = convertToPerTokenRate(config.inputCost || 0, config.unitPrice);
      const outputRate = convertToPerTokenRate(config.outputCost || 0, config.unitPrice);

      if (inputRate === 0 && outputRate === 0 && !this.unmeteredWarned.has(config.id)) {
        this.unmeteredWarned.add(config.id);
        await alertService.createAlert(
          'critical',
          `"${config.name}" has a cost limit but no input or output rate, so FEED cannot `
          + 'measure what it spends and the limit will never stop a translation. '
          + 'Open it and set the rates for this model.'
        );
      }
    }

    const estimatedCost = await this.calculateCost(estimatedInputTokens, config);
    if (dailyCostLimit !== null && wouldExceedLimit(usage.dailyCost, estimatedCost, dailyCostLimit)) {
      return {
        canProceed: false,
        remainingTokens: await this.calculateRemainingTokens(usage.dailyCost, dailyCostLimit, config),
        warningLevel: 'FINAL_WARNING',
        reason: 'Daily cost limit would be exceeded'
      };
    }

    if (monthlyCostLimit !== null && wouldExceedLimit(usage.monthlyCost, estimatedCost, monthlyCostLimit)) {
      return {
        canProceed: false,
        remainingTokens: await this.calculateRemainingTokens(usage.monthlyCost, monthlyCostLimit, config),
        warningLevel: 'FINAL_WARNING',
        reason: 'Monthly cost limit would be exceeded'
      };
    }

    return {
      canProceed: true,
      remainingTokens: 0,
      warningLevel: null
    };
  }

  private async getCurrentUsage(configId: number): Promise<UsagePeriod> {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [dailyUsage, monthlyUsage] = await Promise.all([
      prisma.usageRecord.aggregate({
        where: {
          aiConfigurationId: configId,
          timestamp: { gte: startOfDay },
          success: true
        },
        _sum: {
          totalCost: true
        }
      }),
      prisma.usageRecord.aggregate({
        where: {
          aiConfigurationId: configId,
          timestamp: { gte: startOfMonth },
          success: true
        },
        _sum: {
          totalCost: true
        }
      })
    ]);

    return {
      dailyCost: dailyUsage._sum.totalCost || 0,
      monthlyCost: monthlyUsage._sum.totalCost || 0
    };
  }

  /**
   * What this request would add to the period's spend.
   *
   * The argument is the pre-flight *input* estimate, which since the prompt
   * fix carries the system prompt that will actually be sent plus the user's
   * text. This method used to read
   *
   *   const promptTokens = this.SYSTEM_PROMPT_TOKENS + (tokens * 0.5);
   *   const completionTokens = tokens * 0.5;
   *
   * and that was wrong twice over (ISSUES.md #84).
   *
   * `SYSTEM_PROMPT_TOKENS` was a flat 61 added on top of a count that already
   * contained the real prompt, so the prompt was paid for twice. And `* 0.5`
   * halved the input, as though the argument were a combined input-plus-output
   * total waiting to be split between the two rates — it never was. The two
   * errors pull opposite ways and so partly concealed each other: for this
   * deployment's 143-token FOOD_TRANSLATION prompt the pair returned 132.5
   * prompt tokens against a true 143, close enough to look right and arrived
   * at entirely by accident. The flat 61 was also the third hardcoded guess at
   * a prompt this codebase now measures, after the two in `calculation.ts`.
   *
   * Input is now priced as what it is. Output stays a fraction of input, and
   * stays this fraction on purpose. The obvious replacement is FEED's own
   * `estimateOutputMetrics`, at 1.5x the *user text* — about six tokens for a
   * three-word pantry item. Measured on 2026-09-13, `gemini-3.1-pro-preview`
   * returned 262 completion tokens for exactly such an item, nearly all of it
   * thinking. Swapping a conservative ratio for a confident underestimate
   * would leave this limit protecting less than it does now, so the ratio
   * holds until output is measured per model.
   */
  private async calculateCost(estimatedInputTokens: number, config: AIConfiguration): Promise<number> {
    const promptCost = convertToPerTokenRate(config?.inputCost || 0, config?.unitPrice);
    const completionCost = convertToPerTokenRate(config?.outputCost || 0, config?.unitPrice);

    const completionTokens = estimatedInputTokens * this.OUTPUT_TO_INPUT_RATIO;
    return (estimatedInputTokens * promptCost) + (completionTokens * completionCost);
  }

  private async calculateRemainingTokens(
    currentCost: number,
    costLimit: number,
    config: AIConfiguration
  ): Promise<number> {
    const promptCost = convertToPerTokenRate(config?.inputCost || 0, config?.unitPrice);
    const completionCost = convertToPerTokenRate(config?.outputCost || 0, config?.unitPrice);
    const avgRate = (promptCost + completionCost) / 2;
    
    if (avgRate === 0) return 0;
    
    const remainingCost = costLimit - currentCost;
    return Math.floor(remainingCost / avgRate);
  }

  // Use configured model
  async suggestModelOptimization(): Promise<string> {
    const config = await prisma.aIConfiguration.findFirst({
      where: { isActive: true, type: 'apikey' },
      orderBy: { updatedAt: 'desc' }
    });
    
    return config?.model || 'unknown';
  }
}

export const limitEnforcement = LimitEnforcementService.getInstance();
