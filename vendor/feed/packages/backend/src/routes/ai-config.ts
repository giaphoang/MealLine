// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { Prisma, type AIConfiguration } from '@prisma/client';
import prisma from '../db';
import { encryptApiKey } from '../services/encryption';
import { encoding_for_model } from 'tiktoken';
import { ENCODING_MODEL } from '../services/token/calculation';

import { requireAdmin } from '../middleware/auth/require-admin';
import {
  CATALOGUE,
  REASONING_VALUES,
  SERVICE_ENDPOINTS,
  acceptedReasoningValues,
  capabilitiesFor,
  capabilityAccepts,
  hasReasoningControl,
  isCatalogueProvider,
  selectableEntries,
  type ReasoningValue,
} from '../services/ai/catalogue';
import { AIServiceFactory } from '../services/ai/factory/AIServiceFactory';
import {
  clearProviderAccessFailureCache,
  verifyProviderEntitlement,
} from '../services/ai/provider-access';

const router = Router();

interface BulkUpdateRequest {
  ids: number[];
  updates: {
    name?: string;
    isActive?: boolean;
  };
}

interface BulkDeleteResult {
  success: {
    count: number;
    names: string[];
  };
  failure: {
    count: number;
    configurations: Array<{
      name: string;
      reason: string;
    }>;
  };
}

// Validate configuration IDs
const validateIds = (ids: any): number[] => {
  console.log('Validating AI Config IDs:', {
    type: typeof ids,
    isArray: Array.isArray(ids),
    value: ids
  });
  
  if (!Array.isArray(ids)) {
    console.log('Invalid input: not an array');
    const error = new Error('Invalid configuration IDs: expected an array') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  if (ids.length === 0) {
    console.log('Invalid input: empty array');
    const error = new Error('Invalid configuration IDs: no IDs provided') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  try {
    const validIds = ids.map((id, index) => {
      console.log(`Processing AI Config ID[${index}]:`, {
        type: typeof id,
        raw: id,
        asNumber: Number(id)
      });
      
      const numId = Number(id);
      if (isNaN(numId) || numId < 1) {
        throw new Error(`Invalid configuration ID at position ${index}: ${id}`);
      }
      return numId;
    });

    console.log('Validated AI Config IDs:', validIds);
    return validIds;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid configuration ID format';
    const formattedError = new Error(message) as Error & { statusCode?: number };
    formattedError.statusCode = 400;
    throw formattedError;
  }
};

// Validate configuration type
const validateType = (type: string): boolean => {
  if (!type || !['prompt', 'apikey'].includes(type)) {
    const error = new Error('Type must be either "prompt" or "apikey"') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return true;
};

// Validate configuration name
const validateName = (name: string): string => {
  if (typeof name !== 'string' || name.length < 3 || name.length > 100) {
    const error = new Error('Name must be between 3 and 100 characters') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return name.trim().replace(/\s+/g, ' ');
};

// Validate prompt value
const validatePromptValue = (value: string): boolean => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 1783) {
    const error = new Error('Prompt value must be between 1 and 1783 characters') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return true;
};

// Validate API key format
/**
 * A model configuration cannot be active without a key to call the provider
 * with.
 *
 * Until restore existed there was no way to create one: `POST /` requires an
 * API key for `type: 'apikey'` and hard-codes `isActive: true`. A restored row
 * breaks that assumption — the artifact deliberately carries the model,
 * temperature, and limits an administrator configured, and deliberately does
 * not carry the secret. Without this guard a single row action could switch
 * such a row on, and the next translation would fail against a provider FEED
 * has no credential for, which reads to staff as an outage rather than as
 * unfinished setup.
 *
 * Derived from `encryptedApiKey`, never stored: a second column recording
 * whether the first is null is a fact that can disagree with itself.
 */
const assertActivatable = (
  configuration: { type: string; encryptedApiKey?: string | null; name: string },
): void => {
  if (configuration.type !== 'apikey' || configuration.encryptedApiKey) return;
  const error = new Error(
    `"${configuration.name}" has no API key yet, so it cannot be made active. `
    + 'Open it, enter the key for this provider, and save — restored configurations '
    + 'arrive without their keys because backups never carry secrets.'
  ) as Error & { statusCode?: number; code?: string };
  error.statusCode = 400;
  error.code = 'AI_CONFIGURATION_NO_API_KEY';
  throw error;
};

const validateApiKeyFormat = (apiKey: string): boolean => {
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    const error = new Error('API key is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return true;
};

// Validate service type
const validateServiceType = (serviceType?: string): boolean => {
  if (serviceType && !['OpenAI', 'Anthropic', 'Google', 'Azure'].includes(serviceType)) {
    const error = new Error('Service type must be one of: OpenAI, Anthropic, Google, Azure') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return true;
};

/**
 * Validate a saved thinking level against the model it is saved for.
 *
 * This was a flat allowlist of `minimal | low | medium | high`, which is not
 * any real model's set: GPT-5.6 refuses `minimal` and adds `none`, `xhigh` and
 * `max`; Anthropic's effort runs `low` to `max`; Gemini 3 Pro takes only `low`
 * and `high`. A single list is wrong for every model at once, and widening it
 * would only be wrong more expensively — so the shape comes from
 * `REASONING_VALUES` and the *membership* from the model's own capabilities.
 *
 * A model with no reasoning control clears the value rather than rejecting it.
 * Rejecting would fail the next save of every configuration already carrying a
 * level for such a model — a field the administrator never touched — where
 * clearing makes the stored row true. A 400 is kept for the one case that is
 * genuinely a mistake: a model that has a control and refuses this value.
 */
const validateThinkingLevel = (
  thinkingLevel: unknown,
  serviceType: unknown,
  model: unknown
): ReasoningValue | null => {
  if (thinkingLevel === null || thinkingLevel === '') {
    return null;
  }

  if (
    typeof thinkingLevel !== 'string' ||
    !REASONING_VALUES.includes(thinkingLevel as ReasoningValue)
  ) {
    const error = new Error(
      `Thinking level must be one of: ${REASONING_VALUES.join(', ')}`
    ) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  const value = thinkingLevel as ReasoningValue;

  // Azure has no catalogue entry, and a model id FEED has never seen gets the
  // inferred profile rather than a free pass.
  if (!isCatalogueProvider(serviceType) || typeof model !== 'string' || !model) {
    return value;
  }

  const capabilities = capabilitiesFor(serviceType, model);

  if (!hasReasoningControl(capabilities)) {
    return null;
  }

  if (!capabilityAccepts(capabilities, value)) {
    const accepted = acceptedReasoningValues(capabilities).join(', ');
    const error = new Error(
      `${model} does not accept the thinking level "${value}". It accepts: ${accepted}.`
    ) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  return value;
};

/**
 * Refuse a cost limit that cannot be enforced.
 *
 * A daily or monthly cost limit is compared against `UsageRecord.totalCost`,
 * which is tokens x price. With no price the product is zero, recorded spend
 * never moves, and the comparison in `LimitEnforcementService` is
 * `0 + 0 > limit` on every request — so a limit an administrator deliberately
 * set is silently inert. That is defect 6 of ISSUES.md #84.
 *
 * Only the provably inert case is refused: a positive limit with no usable
 * price at all. A configuration priced on input but not output still measures
 * something, and "Leave empty to skip cost tracking" is an offer the Cost step
 * makes on purpose — so an unpriced configuration with no limit stays entirely
 * legal. Zero already means unlimited (`> 0 ? … : null` below), so only a
 * positive limit is checked.
 */
const validateCostLimitCoherence = (
  dailyCostLimit: unknown,
  monthlyCostLimit: unknown,
  inputCost: unknown,
  outputCost: unknown
): void => {
  const positive = (value: unknown): boolean => typeof value === 'number' && value > 0;

  if (!positive(dailyCostLimit) && !positive(monthlyCostLimit)) return;
  if (positive(inputCost) || positive(outputCost)) return;

  const error = new Error(
    'A cost limit needs a price to measure against. Set an input or output rate on '
    + 'the Cost Tracking step, or clear the cost limit — with no rate, recorded spend '
    + 'stays at zero and the limit would never stop anything.'
  ) as Error & { statusCode?: number; code?: string };
  error.statusCode = 400;
  error.code = 'AI_CONFIGURATION_UNENFORCEABLE_COST_LIMIT';
  throw error;
};

/**
 * Adds the one fact about the key that a client legitimately needs: whether
 * there is one. The ciphertext itself is never something a browser should be
 * reasoning about.
 */
const withKeyPresence = <T extends { type: string; encryptedApiKey?: string | null }>(
  configuration: T
): Omit<T, 'encryptedApiKey' | 'salt'> & { hasApiKey: boolean } => {
  // The ciphertext and its salt leave the server no further. They were being
  // shipped to every browser that opened AI Configuration -- encrypted, so not
  // a disclosure of the key itself, but there is no client-side use for either
  // and an encrypted secret in a page's memory, cache or devtools is a secret
  // moved somewhere it does not need to be. Nothing on the frontend read them.
  const { encryptedApiKey, salt, ...safe } = configuration as T & { salt?: string | null };
  void salt;
  return {
    ...safe,
    hasApiKey: configuration.type !== 'apikey' || Boolean(encryptedApiKey),
  } as Omit<T, 'encryptedApiKey' | 'salt'> & { hasApiKey: boolean };
};

/**
 * GET the model catalogue — what an administrator may choose, with the
 * lifecycle and capability facts the interface needs to warn about.
 *
 * Declared **above** `/:id` deliberately. Express matches in declaration
 * order, so `/:id` would otherwise swallow `/models` and answer "Invalid
 * configuration ID" — a failure that looks like a bug in the client.
 *
 * Not admin-gated: this is public product knowledge (prices, limits, which
 * models exist), it contains no configuration and no secret, and every
 * authenticated user's dialog needs it to render.
 */
router.get('/models', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Two lists, because withdrawing a preset split one job into two.
    //
    // `models` is what an administrator may choose. `withdrawn` is everything
    // else the catalogue still knows — the 2025-era presets the refresh
    // dropped, including the one production runs until 2026-12-11 and the
    // Gemini model whose 404 started ISSUES.md #84.
    //
    // Serving only `models` would leave the dialog unable to explain the
    // configurations people already have: a saved row pointing at a withdrawn
    // id would render with no shutdown date and no replacement, which is
    // exactly the silence this issue is about. Those entries stay resolvable
    // in-process via `findCatalogueEntry`, but the interface reaches them
    // over HTTP or not at all.
    const offered = selectableEntries();
    const offeredIds = new Set(offered.map((entry) => entry.id));

    res.json({
      models: offered,
      withdrawn: CATALOGUE.filter((entry) => !offeredIds.has(entry.id)),
      endpoints: SERVICE_ENDPOINTS,
    });
  } catch (error) {
    next(error);
  }
});

// GET all configurations
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const configurations = await prisma.aIConfiguration.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' }
    });
    // `hasApiKey` is derived here rather than stored, and it is what the list
    // renders a "No Key" state from. A restored configuration arrives without
    // its secret by design, and that is a state the UI has to be able to show
    // — otherwise the only way to discover it is a failed translation.
    res.json({ configurations: configurations.map(withKeyPresence) });
  } catch (error) {
    next(error);
  }
});

// GET single configuration
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const configId = Number(id);
    
    if (isNaN(configId) || configId < 1) {
      const error = new Error('Invalid configuration ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const configuration = await prisma.aIConfiguration.findUnique({
      where: { 
        id: configId,
        deletedAt: null
      }
    });

    if (!configuration) {
      const error = new Error('Configuration not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    res.json({ configuration: withKeyPresence(configuration) });
  } catch (error) {
    next(error);
  }
});

// Create new configuration
router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { 
      name, 
      type, 
      value, 
      description,
      serviceType,
      model,
      modelName,
      endpointUrl,
      apiKey,
      inputCost,
      outputCost,
      unitPrice,
      temperature,
      topP,
      thinkingLevel,
      maxTokens,
      inputTokenLimit,
      outputTokenLimit,
      dailyCostLimit,
      monthlyCostLimit,
      tokensPerMinute,
      requestsPerMinute,
      requestsPerDay
    } = req.body;

    // Validate required fields
    validateType(type);
    const normalizedName = validateName(name);

    // Type-specific validation
    if (type === 'prompt') {
      validatePromptValue(value);
    } else if (type === 'apikey') {
      validateApiKeyFormat(apiKey);
      validateServiceType(serviceType);
    }

    const createData: any = {
      name: normalizedName,
      type,
      value: value || '',
      description: description || undefined,
      isActive: true
    };

    if (type === 'apikey') {
      createData.serviceType = serviceType;
      createData.model = model || undefined;
      createData.modelName = modelName || undefined;
      createData.endpointUrl = endpointUrl || undefined;

      const { encrypted, salt } = await encryptApiKey(apiKey);
      createData.encryptedApiKey = encrypted;
      createData.salt = salt;

      createData.inputCost = inputCost;
      createData.outputCost = outputCost;
      createData.unitPrice = unitPrice;
      createData.temperature = temperature ?? 0.7;
      createData.topP = topP ?? 1.0;
      if (thinkingLevel !== undefined) {
        createData.thinkingLevel = validateThinkingLevel(thinkingLevel, serviceType, model);
      }
      createData.inputTokenLimit = inputTokenLimit;
      createData.outputTokenLimit = outputTokenLimit;
      createData.maxTokens = outputTokenLimit ?? maxTokens;
      validateCostLimitCoherence(dailyCostLimit, monthlyCostLimit, inputCost, outputCost);
      if (dailyCostLimit !== undefined) {
        createData.dailyCostLimit = dailyCostLimit > 0 ? dailyCostLimit : null;
      }
      if (monthlyCostLimit !== undefined) {
        createData.monthlyCostLimit = monthlyCostLimit > 0 ? monthlyCostLimit : null;
      }
      createData.tokensPerMinute = tokensPerMinute;
      createData.requestsPerMinute = requestsPerMinute;
      createData.requestsPerDay = requestsPerDay;

      const now = new Date();
      await verifyProviderEntitlement({
        id: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        ...createData,
      } as AIConfiguration);
    }

    try {
      const configuration = await prisma.$transaction(async (tx) =>
        tx.aIConfiguration.create({ data: createData })
      );

      AIServiceFactory.clearCache();
      clearProviderAccessFailureCache();

      res.status(201).json({ configuration });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A configuration with this name already exists') as Error & { statusCode?: number };
          friendlyError.statusCode = 400;
          throw friendlyError;
        }
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Update configuration
router.put('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // Express reaches this parameter route before the bulk route below.
    if (id === 'bulk') return next();
    const updateFields = req.body;

    const configId = Number(id);
    if (isNaN(configId)) {
      const error = new Error('Invalid configuration ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    // Check if configuration exists and is not deleted
    const existing = await prisma.aIConfiguration.findUnique({
      where: { 
        id: configId,
        deletedAt: null
      }
    });

    if (!existing) {
      const error = new Error('Configuration not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    // Validate only the fields being updated
    const updateData: any = {};

    // Basic fields that can always be updated
    if (updateFields.name !== undefined) {
      updateData.name = validateName(updateFields.name);
    }

    if (updateFields.description !== undefined) {
      updateData.description = updateFields.description || undefined;
    }

    if (updateFields.isActive !== undefined) {
      // Checked against the row as it will be, not as it was: supplying a key
      // and activating in the same request is the ordinary way to finish a
      // restored configuration.
      if (Boolean(updateFields.isActive)) {
        assertActivatable({
          type: existing.type,
          name: existing.name,
          encryptedApiKey: updateFields.apiKey ? 'pending' : existing.encryptedApiKey,
        });
      }
      updateData.isActive = Boolean(updateFields.isActive);
    }

    // Type-specific validation and updates
    if (existing.type === 'prompt') {
      if (updateFields.value !== undefined) {
        validatePromptValue(updateFields.value);
        updateData.value = updateFields.value;
      }
    } else if (existing.type === 'apikey') {
      // Update model fields if provided
      if (updateFields.modelName !== undefined) {
        updateData.modelName = updateFields.modelName || undefined;
      }
      if (updateFields.model !== undefined) {
        updateData.model = updateFields.model || undefined;
      }
      if (updateFields.serviceType !== undefined) {
        validateServiceType(updateFields.serviceType);
        updateData.serviceType = updateFields.serviceType;
      }
      if (updateFields.endpointUrl !== undefined) {
        updateData.endpointUrl = updateFields.endpointUrl || undefined;
      }

      // Only update API key if a new one is provided
      if (updateFields.apiKey !== undefined) {
        validateApiKeyFormat(updateFields.apiKey);
        const { encrypted, salt } = await encryptApiKey(updateFields.apiKey);
        updateData.encryptedApiKey = encrypted;
        updateData.salt = salt;
      }

      // Update cost and limit fields if provided
      if (updateFields.inputCost !== undefined) {
        updateData.inputCost = updateFields.inputCost;
      }
      if (updateFields.outputCost !== undefined) {
        updateData.outputCost = updateFields.outputCost;
      }
      if (updateFields.unitPrice !== undefined) {
        updateData.unitPrice = updateFields.unitPrice;
      }
      if (updateFields.thinkingLevel !== undefined) {
        // Edit disables changing the service type and may not resend the
        // model, so the stored row supplies whatever the request omits.
        updateData.thinkingLevel = validateThinkingLevel(
          updateFields.thinkingLevel,
          updateFields.serviceType ?? existing.serviceType,
          updateFields.model ?? existing.model
        );
      }
      if (updateFields.inputTokenLimit !== undefined) {
        updateData.inputTokenLimit = updateFields.inputTokenLimit;
      }
      if (updateFields.outputTokenLimit !== undefined) {
        updateData.outputTokenLimit = updateFields.outputTokenLimit;
        updateData.maxTokens = updateFields.outputTokenLimit;
      }
      // An edit reaches the unenforceable pair from either side: adding a
      // limit to a configuration that has no prices, or clearing the prices
      // from one that already has a limit. Each field above is guarded by its
      // own `!== undefined`, so a request may carry only one of the four and
      // the stored row supplies the rest.
      //
      // `!== undefined` rather than `??`: an explicit null is how a price is
      // cleared, and `??` would read that as "unchanged" and wave through
      // precisely the case being guarded.
      const sentOrStored = (sent: unknown, stored: unknown): unknown =>
        sent !== undefined ? sent : stored;
      validateCostLimitCoherence(
        sentOrStored(updateFields.dailyCostLimit, existing.dailyCostLimit),
        sentOrStored(updateFields.monthlyCostLimit, existing.monthlyCostLimit),
        sentOrStored(updateFields.inputCost, existing.inputCost),
        sentOrStored(updateFields.outputCost, existing.outputCost)
      );
      if (updateFields.dailyCostLimit !== undefined) {
        updateData.dailyCostLimit = updateFields.dailyCostLimit > 0 ? updateFields.dailyCostLimit : null;
      }
      if (updateFields.monthlyCostLimit !== undefined) {
        updateData.monthlyCostLimit = updateFields.monthlyCostLimit > 0 ? updateFields.monthlyCostLimit : null;
      }
      if (updateFields.tokensPerMinute !== undefined) {
        updateData.tokensPerMinute = updateFields.tokensPerMinute;
      }
      if (updateFields.requestsPerMinute !== undefined) {
        updateData.requestsPerMinute = updateFields.requestsPerMinute;
      }
      if (updateFields.requestsPerDay !== undefined) {
        updateData.requestsPerDay = updateFields.requestsPerDay;
      }
    }

    // Update performance parameters if provided
    if (updateFields.temperature !== undefined) {
      updateData.temperature = updateFields.temperature;
    }
    if (updateFields.topP !== undefined) {
      updateData.topP = updateFields.topP;
    }
    if (updateFields.maxTokens !== undefined) {
      updateData.maxTokens = updateFields.maxTokens;
      if (updateFields.outputTokenLimit === undefined) {
        updateData.outputTokenLimit = updateFields.maxTokens;
      }
    }

    const updateKeys = Object.keys(updateFields).filter((key) => key !== 'id');
    const isDeactivationOnly = updateFields.isActive === false
      && updateKeys.every((key) => key === 'isActive');
    if (existing.type === 'apikey' && !isDeactivationOnly) {
      await verifyProviderEntitlement({
        ...existing,
        ...updateData,
        updatedAt: new Date(),
      } as AIConfiguration);
    }

    try {
      const configuration = await prisma.$transaction(async (tx) => {
        return await tx.aIConfiguration.update({
          where: { id: configId },
          data: updateData
        });
      });

      AIServiceFactory.clearCache();
      clearProviderAccessFailureCache();

      res.json({ configuration: withKeyPresence(configuration) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A configuration with this name already exists') as Error & { statusCode?: number };
          friendlyError.statusCode = 400;
          throw friendlyError;
        }
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Bulk update configurations
router.put('/bulk', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Bulk update AI config request body:', req.body);
    const { ids, updates } = req.body as BulkUpdateRequest;
    const validIds = validateIds(ids);

    // Validate updates
    if (!updates || typeof updates !== 'object') {
      const error = new Error('Invalid updates') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    if (Boolean(updates.isActive)) {
      const configurationsToActivate = await prisma.aIConfiguration.findMany({
        where: { id: { in: validIds }, deletedAt: null },
      });
      if (configurationsToActivate.length !== validIds.length) {
        const error = new Error('One or more configurations not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }
      for (const configuration of configurationsToActivate) {
        assertActivatable(configuration);
        if (configuration.type === 'apikey') {
          await verifyProviderEntitlement(configuration);
        }
      }
    }

    try {
      const updatedConfigurations = await prisma.$transaction(async (tx) => {
        // Verify all configurations exist and are not deleted
        const existingConfigurations = await tx.aIConfiguration.findMany({
          where: { 
            id: { in: validIds },
            deletedAt: null
          }
        });

        if (existingConfigurations.length !== validIds.length) {
          const error = new Error('One or more configurations not found') as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }

        // Prepare update data
        const updateData: any = {};

        if (updates.name) {
          updateData.name = validateName(updates.name);
        }

        if (updates.isActive !== undefined) {
          if (Boolean(updates.isActive)) {
            // Every row, not the first: a bulk activation that silently
            // skipped the keyless ones would be the same lie in aggregate.
            existingConfigurations.forEach(assertActivatable);
          }
          updateData.isActive = Boolean(updates.isActive);
        }

        // Update all configurations
        const updatePromises = validIds.map(id =>
          tx.aIConfiguration.update({
            where: { 
              id,
              deletedAt: null
            },
            data: updateData
          })
        );

        return await Promise.all(updatePromises);
      });

      AIServiceFactory.clearCache();
      clearProviderAccessFailureCache();

      res.json({ configurations: updatedConfigurations.map(withKeyPresence) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A configuration with this name already exists') as Error & { statusCode?: number };
          friendlyError.statusCode = 400;
          throw friendlyError;
        }
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Bulk delete configurations
router.delete('/bulk', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  console.log('Hit AI config bulk delete endpoint');
  try {
    console.log('Bulk delete AI config request:', {
      body: req.body,
      headers: req.headers
    });
    
    const { ids } = req.body;
    console.log('Raw AI config IDs from request:', ids);
    
    const validIds = validateIds(ids);
    console.log('Validated AI config IDs:', validIds);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Verify all configurations exist and are not already deleted
        const existingConfigurations = await tx.aIConfiguration.findMany({
          where: { 
            id: { in: validIds },
            deletedAt: null
          }
        });

        if (existingConfigurations.length !== validIds.length) {
          const error = new Error('One or more configurations not found') as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }

        // Soft delete configurations by setting deletedAt timestamp
        const configurationsToDelete = existingConfigurations;
        
        console.log('Soft deleting AI configurations:', configurationsToDelete.map(c => c.id));
        
        // Soft delete configurations
        if (configurationsToDelete.length > 0) {
          await tx.aIConfiguration.updateMany({
            where: { id: { in: configurationsToDelete.map(c => c.id) } },
            data: { deletedAt: new Date() }
          });
        }

        // Prepare result
        const result: BulkDeleteResult = {
          success: {
            count: configurationsToDelete.length,
            names: configurationsToDelete.map(c => c.name)
          },
          failure: {
            count: 0,
            configurations: []
          }
        };

        return result;
      });

      // All successful, send a 200 OK
      res.status(200).json({
        message: `Successfully deleted ${result.success.count} ${result.success.count === 1 ? 'configuration' : 'configurations'}: ${result.success.names.join(', ')}.`,
        result
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        console.error('Prisma error:', error);
        throw error;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

// Token estimation endpoint
router.post('/estimate-tokens', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, targetLanguage = 'Custom' } = req.body;

    if (!text || typeof text !== 'string') {
      const error = new Error('Text is required for token estimation') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    // Get active AI configuration
    const config = await prisma.aIConfiguration.findFirst({
      where: {
        type: 'apikey',
        isActive: true,
        deletedAt: null
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    if (!config) {
      const error = new Error('AI configuration required. Please configure AI settings in the Tools → AI Configuration section.') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const modelForEncoding = ENCODING_MODEL;
    
    try {
      const encoder = encoding_for_model(modelForEncoding);
      
      // System prompt token calculation
      const systemPrompt = `You are a translation service for a nonprofit food pantry. Translate to ${targetLanguage} using the closest natural equivalent. Your response must be a valid JSON string containing only a "translatedText" field.`;
      const systemTokenCount = encoder.encode(systemPrompt).length;
      
      // User text token calculation
      const userTokenCount = encoder.encode(text).length;
      
      // Input calculations (system prompt + user text)
      const totalInputTokens = systemTokenCount + userTokenCount;
      const inputCost = totalInputTokens * (config.inputCost || 0);
      
      // Output estimation (1.5x user text)
      const estimatedOutputTokens = Math.ceil(userTokenCount * 1.5);
      const outputCost = estimatedOutputTokens * (config.outputCost || 0);
      
      encoder.free();
      
      res.json({
        inputMetrics: {
          tokenCount: totalInputTokens,
          cost: inputCost
        },
        outputMetrics: {
          tokenCount: estimatedOutputTokens,
          cost: outputCost
        },
        totalCost: inputCost + outputCost,
        model: config.model || 'Unknown'
      });
    } catch (encodingError) {
      console.error('Token encoding error:', encodingError);
      
      // Fallback estimation without tiktoken
      const roughInputTokens = Math.ceil(text.length / 4) + 50; // ~4 chars per token + system prompt
      const roughOutputTokens = Math.ceil((text.length / 4) * 1.5);
      
      const inputCost = roughInputTokens * (config.inputCost || 0);
      const outputCost = roughOutputTokens * (config.outputCost || 0);
      
      res.json({
        inputMetrics: {
          tokenCount: roughInputTokens,
          cost: inputCost
        },
        outputMetrics: {
          tokenCount: roughOutputTokens,
          cost: outputCost
        },
        totalCost: inputCost + outputCost,
        model: config.model || 'Unknown',
        warning: 'Token estimation using fallback method'
      });
    }
  } catch (error) {
    next(error);
  }
});

// Delete single configuration
router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const configId = Number(id);
    
    if (isNaN(configId)) {
      const error = new Error('Invalid configuration ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    await prisma.$transaction(async (tx) => {
      const configuration = await tx.aIConfiguration.findUnique({
        where: { 
          id: configId,
          deletedAt: null
        }
      });

      if (!configuration) {
        const error = new Error('Configuration not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      await tx.aIConfiguration.update({
        where: { id: configId },
        data: { deletedAt: new Date() }
      });
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
