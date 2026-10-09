// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../db';
import FormattingChoiceService from '../services/formatting-choice';
import { PromptBuilder } from '../services/ai/prompts/PromptBuilder';

// Define PromptType enum to match frontend types
enum PromptType {
  FOOD_TRANSLATION = 'FOOD_TRANSLATION',
  CUSTOM_TRANSLATION = 'CUSTOM_TRANSLATION',
  BATCH_TRANSLATION = 'BATCH_TRANSLATION',
  CLASSIFICATION = 'CLASSIFICATION'
}

const router = Router();
const formattingChoiceService = new FormattingChoiceService(prisma);

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
    prompts: Array<{
      name: string;
      reason: string;
    }>;
  };
}

interface CacheStats {
  promptId: number;
  promptName: string;
  cachedChoicesCount: number;
  uniqueTextsCount: number;
  cacheHitRate: number;
  estimatedApiCallsSaved: number;
}

// Validate prompt IDs
const validateIds = (ids: any): number[] => {
  console.log('Validating SystemPrompt IDs:', {
    type: typeof ids,
    isArray: Array.isArray(ids),
    value: ids
  });
  
  if (!Array.isArray(ids)) {
    console.log('Invalid input: not an array');
    const error = new Error('Invalid prompt IDs: expected an array') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  if (ids.length === 0) {
    console.log('Invalid input: empty array');
    const error = new Error('Invalid prompt IDs: no IDs provided') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  try {
    const validIds = ids.map((id, index) => {
      console.log(`Processing SystemPrompt ID[${index}]:`, {
        type: typeof id,
        raw: id,
        asNumber: Number(id)
      });
      
      const numId = Number(id);
      if (isNaN(numId) || numId < 1) {
        throw new Error(`Invalid prompt ID at position ${index}: ${id}`);
      }
      return numId;
    });

    console.log('Validated SystemPrompt IDs:', validIds);
    return validIds;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid prompt ID format';
    const formattedError = new Error(message) as Error & { statusCode?: number };
    formattedError.statusCode = 400;
    throw formattedError;
  }
};

// Validate prompt name
const validateName = (name: unknown): string => {
  if (typeof name !== 'string' || name.length < 3 || name.length > 100) {
    const error = new Error('Name must be between 3 and 100 characters') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return name.trim().replace(/\s+/g, ' ');
};

// Validate prompt type
const validatePromptType = (promptType: unknown): PromptType => {
  if (typeof promptType !== 'string' || !Object.values(PromptType).includes(promptType as PromptType)) {
    const error = new Error(`Invalid prompt type. Must be one of: ${Object.values(PromptType).join(', ')}`) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  return promptType as PromptType;
};

// Validate threshold values
const validateThreshold = (value: unknown, fieldName: string): number | undefined => {
  if (value === undefined || value === null) return undefined;
  
  if (typeof value !== 'number' || value < 0.1 || value > 1.0) {
    const error = new Error(`${fieldName} must be between 0.1 and 1.0`) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  return value;
};

// Validate temperature values
const validateTemperature = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  
  if (typeof value !== 'number' || value < 0 || value > 2) {
    const error = new Error('temperature must be between 0.0 and 2.0') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  return value;
};

// Validate topP values
const validateTopP = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  
  if (typeof value !== 'number' || value < 0 || value > 1) {
    const error = new Error('topP must be between 0.0 and 1.0') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  return value;
};

// Get relevant fields for prompt type
const getPromptTypeFields = (promptType: PromptType) => {
  switch (promptType) {
    case PromptType.CLASSIFICATION:
      return {
        requiresThresholds: true,
        requiresTemperature: false,
        supportsTranslationFields: true,
        defaultThresholds: { skip: 0.7, include: 0.7 }
      };
    case PromptType.FOOD_TRANSLATION:
    case PromptType.CUSTOM_TRANSLATION:
    case PromptType.BATCH_TRANSLATION:
      return {
        requiresThresholds: false,
        requiresTemperature: true,
        supportsTranslationFields: true,
        defaultTemperature: 0.7,
        defaultTopP: 1.0
      };
    default:
      return {
        requiresThresholds: false,
        requiresTemperature: false,
        supportsTranslationFields: false
      };
  }
};

// Filter request fields based on prompt type
const filterRequestFields = (promptType: PromptType, requestBody: any) => {
  const commonFields = [
    'name', 'promptType', 'isActive', 'isDefault', 'description',
    'serviceDescription', 'translationApproach', 'contextGuidance', 
    'additionalGuidance', 'skipTranslation', 'includeEnglish'
  ];
  
  const config = getPromptTypeFields(promptType);
  let allowedFields = [...commonFields];
  
  if (config.requiresThresholds) {
    allowedFields.push('skipTranslationThreshold', 'includeEnglishThreshold', 'rememberFormattingChoices');
  }
  
  if (config.requiresTemperature) {
    allowedFields.push('temperature', 'topP');
  }
  
  return Object.fromEntries(
    Object.entries(requestBody).filter(([key]) => allowedFields.includes(key))
  );
};

// GET all system prompts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prompts = await prisma.systemPrompt.findMany({
      orderBy: { name: 'asc' }
    });
    res.json({ prompts });
  } catch (error) {
    next(error);
  }
});

// GET single system prompt
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const promptId = Number(id);
    
    if (isNaN(promptId) || promptId < 1) {
      const error = new Error('Invalid prompt ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const prompt = await prisma.systemPrompt.findUnique({
      where: { id: promptId }
    });

    if (!prompt) {
      const error = new Error('System prompt not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    res.json({ prompt });
  } catch (error) {
    next(error);
  }
});

// Create new system prompt
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filteredBody = filterRequestFields(req.body.promptType, req.body);
    
    const { 
      name,
      promptType,
      isActive = true,
      isDefault = false,
      description,
      serviceDescription,
      translationApproach,
      contextGuidance,
      additionalGuidance,
      skipTranslation,
      includeEnglish,
      skipTranslationThreshold,
      includeEnglishThreshold,
      rememberFormattingChoices,
      temperature,
      topP
    } = filteredBody;

    // Validate required fields
    const normalizedName = validateName(name);
    const validPromptType = validatePromptType(promptType);

    // Get prompt type configuration to determine which fields to process
    const promptConfig = getPromptTypeFields(validPromptType);

    // Conditionally validate fields based on prompt type
    let validSkipThreshold: number | undefined;
    let validIncludeThreshold: number | undefined;
    let validTemperature: number | undefined;
    let validTopP: number | undefined;

    if (promptConfig.requiresThresholds) {
      // CLASSIFICATION prompts: validate thresholds, use defaults if not provided
      validSkipThreshold = validateThreshold(
        skipTranslationThreshold ?? promptConfig.defaultThresholds?.skip, 
        'skipTranslationThreshold'
      );
      validIncludeThreshold = validateThreshold(
        includeEnglishThreshold ?? promptConfig.defaultThresholds?.include, 
        'includeEnglishThreshold'
      );
    } else if (promptConfig.requiresTemperature) {
      // TRANSLATION prompts: validate temperature/topP, use defaults if not provided
      validTemperature = validateTemperature(temperature ?? promptConfig.defaultTemperature);
      validTopP = validateTopP(topP ?? promptConfig.defaultTopP);
    }

    try {
      const prompt = await prisma.$transaction(async (tx) => {
        // If setting as active, deactivate other prompts of same type
        if (isActive) {
          await tx.systemPrompt.updateMany({
            where: {
              promptType: validPromptType,
              isActive: true
            },
            data: { isActive: false }
          });
        }

        // If setting as default, remove default from other prompts of same type
        if (isDefault) {
          await tx.systemPrompt.updateMany({
            where: {
              promptType: validPromptType,
              isDefault: true
            },
            data: { isDefault: false }
          });
        }

        // Build create data object with only relevant fields for this prompt type
        const createData: any = {
          name: normalizedName,
          promptType: validPromptType,
          isActive,
          isDefault
        };

        // Add common optional fields
        if (description) createData.description = description;

        // Add translation-related fields if supported by this prompt type
        if (promptConfig.supportsTranslationFields) {
          if (serviceDescription) createData.serviceDescription = serviceDescription;
          if (translationApproach) createData.translationApproach = translationApproach;
          if (contextGuidance) createData.contextGuidance = contextGuidance;
          if (additionalGuidance) createData.additionalGuidance = additionalGuidance;
          if (skipTranslation) createData.skipTranslation = skipTranslation;
          if (includeEnglish) createData.includeEnglish = includeEnglish;
        }

        // Add threshold fields for CLASSIFICATION prompts
        if (promptConfig.requiresThresholds) {
          createData.skipTranslationThreshold = validSkipThreshold;
          createData.includeEnglishThreshold = validIncludeThreshold;
          // Default rememberFormattingChoices to true for CLASSIFICATION prompts
          createData.rememberFormattingChoices = rememberFormattingChoices ?? true;
        }

        // Add temperature/topP fields for TRANSLATION prompts
        if (promptConfig.requiresTemperature) {
          createData.temperature = validTemperature;
          createData.topP = validTopP;
        }

        console.log(`[SystemPrompt] Creating ${validPromptType} prompt with data:`, createData);
        return await tx.systemPrompt.create({
          data: createData
        });
      });

      // Clear PromptBuilder cache after creating new system prompt
      PromptBuilder.clearCache();
      
      res.status(201).json({ prompt });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A system prompt with this name already exists') as Error & { statusCode?: number };
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

// Update system prompt
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const promptId = Number(id);
    if (isNaN(promptId)) {
      const error = new Error('Invalid prompt ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const existing = await prisma.systemPrompt.findUnique({
      where: { id: promptId }
    });

    if (!existing) {
      const error = new Error('System prompt not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    const effectivePromptType = req.body.promptType || existing.promptType;
    const filteredBody = filterRequestFields(effectivePromptType, req.body);
    const updateFields = filteredBody;

    // Validate fields being updated
    const updateData: any = {};

    if (updateFields.name !== undefined) {
      updateData.name = validateName(updateFields.name);
    }

    if (updateFields.promptType !== undefined) {
      updateData.promptType = validatePromptType(updateFields.promptType);
    }

    if (updateFields.isActive !== undefined) {
      updateData.isActive = Boolean(updateFields.isActive);
    }

    if (updateFields.isDefault !== undefined) {
      updateData.isDefault = Boolean(updateFields.isDefault);
    }

    if (updateFields.description !== undefined) {
      updateData.description = updateFields.description || undefined;
    }

    if (updateFields.serviceDescription !== undefined) {
      updateData.serviceDescription = updateFields.serviceDescription || undefined;
    }

    if (updateFields.translationApproach !== undefined) {
      updateData.translationApproach = updateFields.translationApproach || undefined;
    }

    if (updateFields.contextGuidance !== undefined) {
      updateData.contextGuidance = updateFields.contextGuidance || undefined;
    }

    if (updateFields.additionalGuidance !== undefined) {
      updateData.additionalGuidance = updateFields.additionalGuidance || undefined;
    }

    if (updateFields.skipTranslation !== undefined) {
      updateData.skipTranslation = updateFields.skipTranslation || undefined;
    }

    if (updateFields.includeEnglish !== undefined) {
      updateData.includeEnglish = updateFields.includeEnglish || undefined;
    }

    if (updateFields.skipTranslationThreshold !== undefined) {
      updateData.skipTranslationThreshold = validateThreshold(updateFields.skipTranslationThreshold, 'skipTranslationThreshold');
    }

    if (updateFields.includeEnglishThreshold !== undefined) {
      updateData.includeEnglishThreshold = validateThreshold(updateFields.includeEnglishThreshold, 'includeEnglishThreshold');
    }

    if (updateFields.rememberFormattingChoices !== undefined) {
      updateData.rememberFormattingChoices = Boolean(updateFields.rememberFormattingChoices);
    }

    if (updateFields.temperature !== undefined) {
      if (updateFields.temperature !== null && (typeof updateFields.temperature !== 'number' || updateFields.temperature < 0 || updateFields.temperature > 2)) {
        const error = new Error('temperature must be between 0.0 and 2.0') as Error & { statusCode?: number };
        error.statusCode = 400;
        throw error;
      }
      updateData.temperature = updateFields.temperature;
    }

    if (updateFields.topP !== undefined) {
      if (updateFields.topP !== null && (typeof updateFields.topP !== 'number' || updateFields.topP < 0 || updateFields.topP > 1)) {
        const error = new Error('topP must be between 0.0 and 1.0') as Error & { statusCode?: number };
        error.statusCode = 400;
        throw error;
      }
      updateData.topP = updateFields.topP;
    }

    try {
      const prompt = await prisma.$transaction(async (tx) => {
        // Handle exclusive constraints
        const effectivePromptType = updateData.promptType || existing.promptType;
        
        // Check for name uniqueness if name is being updated
        if (updateData.name !== undefined) {
          const nameConflict = await tx.systemPrompt.findFirst({
            where: {
              name: updateData.name,
              id: { not: promptId }
            }
          });
          
          if (nameConflict) {
            const friendlyError = new Error('A system prompt with this name already exists') as Error & { statusCode?: number };
            friendlyError.statusCode = 400;
            throw friendlyError;
          }
        }
        
        if (updateData.isActive === true) {
          await tx.systemPrompt.updateMany({
            where: {
              promptType: effectivePromptType,
              isActive: true,
              id: { not: promptId }
            },
            data: { isActive: false }
          });
        }

        if (updateData.isDefault === true) {
          await tx.systemPrompt.updateMany({
            where: {
              promptType: effectivePromptType,
              isDefault: true,
              id: { not: promptId }
            },
            data: { isDefault: false }
          });
        }

        return await tx.systemPrompt.update({
          where: { id: promptId },
          data: updateData
        });
      });

      // Clear PromptBuilder cache after updating system prompt
      PromptBuilder.clearCache();
      
      res.json({ prompt });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A system prompt with this name already exists') as Error & { statusCode?: number };
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

// Bulk update system prompts
router.put('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Bulk update system prompt request body:', req.body);
    const { ids, updates } = req.body as BulkUpdateRequest;
    const validIds = validateIds(ids);

    // Validate updates
    if (!updates || typeof updates !== 'object') {
      const error = new Error('Invalid updates') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    try {
      const updatedPrompts = await prisma.$transaction(async (tx) => {
        // Verify all prompts exist
        const existingPrompts = await tx.systemPrompt.findMany({
          where: { id: { in: validIds } }
        });

        if (existingPrompts.length !== validIds.length) {
          const error = new Error('One or more system prompts not found') as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }

        // Prepare update data
        const updateData: any = {};

        if (updates.name) {
          updateData.name = validateName(updates.name);
        }

        if (updates.isActive !== undefined) {
          updateData.isActive = Boolean(updates.isActive);
        }

        // Update all prompts
        const updatePromises = validIds.map(id =>
          tx.systemPrompt.update({
            where: { id },
            data: updateData
          })
        );

        return await Promise.all(updatePromises);
      });

      // Clear PromptBuilder cache after bulk updating system prompts
      PromptBuilder.clearCache();
      
      res.json({ prompts: updatedPrompts });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A system prompt with this name already exists') as Error & { statusCode?: number };
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

// Bulk delete system prompts
router.delete('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  console.log('Hit system prompt bulk delete endpoint');
  try {
    console.log('Bulk delete system prompt request:', {
      body: req.body,
      headers: req.headers
    });
    
    const { ids } = req.body;
    console.log('Raw system prompt IDs from request:', ids);
    
    const validIds = validateIds(ids);
    console.log('Validated system prompt IDs:', validIds);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Verify all prompts exist
        const existingPrompts = await tx.systemPrompt.findMany({
          where: { id: { in: validIds } }
        });

        if (existingPrompts.length !== validIds.length) {
          const error = new Error('One or more system prompts not found') as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }

        // For system prompts, we can delete all without constraint checks
        const promptsToDelete = existingPrompts;
        
        console.log('Deleting system prompts:', promptsToDelete.map(p => p.id));
        
        // Delete prompts
        if (promptsToDelete.length > 0) {
          await tx.systemPrompt.deleteMany({
            where: { id: { in: promptsToDelete.map(p => p.id) } }
          });
        }

        // Prepare result
        const result: BulkDeleteResult = {
          success: {
            count: promptsToDelete.length,
            names: promptsToDelete.map(p => p.name)
          },
          failure: {
            count: 0,
            prompts: []
          }
        };

        return result;
      });

      // Clear PromptBuilder cache after bulk deleting system prompts
      PromptBuilder.clearCache();
      
      // All successful, send a 200 OK
      res.status(200).json({
        message: `Successfully deleted ${result.success.count} ${result.success.count === 1 ? 'prompt' : 'prompts'}: ${result.success.names.join(', ')}.`,
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

// Get formatting cache stats for a system prompt
router.get('/:id/cache-stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const promptId = Number(id);
    
    if (isNaN(promptId) || promptId < 1) {
      const error = new Error('Invalid prompt ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    // Use FormattingChoiceService to get cache stats
    const stats = await formattingChoiceService.getCacheStats(promptId);
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Clear formatting cache for a system prompt
router.delete('/:id/cache', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const promptId = Number(id);
    
    if (isNaN(promptId) || promptId < 1) {
      const error = new Error('Invalid prompt ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    // Use FormattingChoiceService to clear cache
    const result = await formattingChoiceService.clearCache(promptId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Delete single system prompt
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const promptId = Number(id);
    
    if (isNaN(promptId)) {
      const error = new Error('Invalid prompt ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    await prisma.$transaction(async (tx) => {
      const prompt = await tx.systemPrompt.findUnique({
        where: { id: promptId }
      });

      if (!prompt) {
        const error = new Error('System prompt not found') as Error & { statusCode?: number };
        error.statusCode = 404;
        throw error;
      }

      // Check for cached formatting choices that will be deleted
      const cachedCount = await tx.formattingChoice.count({
        where: {
          systemPromptId: promptId
        }
      });

      if (cachedCount > 0) {
        console.log(`Deleting SystemPrompt ${promptId} will cascade delete ${cachedCount} cached formatting choices`);
      }

      await tx.systemPrompt.delete({
        where: { id: promptId }
      });
    });

    // Clear PromptBuilder cache after deleting system prompt
    PromptBuilder.clearCache();
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
