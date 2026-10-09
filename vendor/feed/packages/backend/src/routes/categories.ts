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
import { AIServiceFactory } from '../services/ai/factory/AIServiceFactory';
import {
  categoryEventFlags,
  createCategoryWithEvent,
  deleteCategoryWithEvent,
  hasCategoryEventChange,
  updateCategoryWithEvent,
  writeCategoryInventoryEvent,
} from '../services/category';

const router = Router();

interface BulkUpdateRequest {
  ids: number[];
  updates: {
    name?: string;
    limit?: number;
    icon?: string;
  };
}

interface BulkDeleteResult {
  success: {
    count: number;
    names: string[];
  };
  failure: {
    count: number;
    categories: Array<{
      name: string;
      itemCount: number;
    }>;
  };
}

interface CategoryDistribution {
  category: string;
  items: number;
}

// Validate category IDs
const validateIds = (ids: any): number[] => {
  console.log('Validating IDs:', {
    type: typeof ids,
    isArray: Array.isArray(ids),
    value: ids
  });
  
  if (!Array.isArray(ids)) {
    console.log('Invalid input: not an array');
    const error = new Error('Invalid category IDs: expected an array') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  if (ids.length === 0) {
    console.log('Invalid input: empty array');
    const error = new Error('Invalid category IDs: no IDs provided') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  try {
    const validIds = ids.map((id, index) => {
      console.log(`Processing ID[${index}]:`, {
        type: typeof id,
        raw: id,
        asNumber: Number(id)
      });
      
      const numId = Number(id);
      if (isNaN(numId) || numId < 1) {
        throw new Error(`Invalid category ID at position ${index}: ${id}`);
      }
      return numId;
    });

    console.log('Validated IDs:', validIds);
    return validIds;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid category ID format';
    const formattedError = new Error(message) as Error & { statusCode?: number };
    formattedError.statusCode = 400;
    throw formattedError;
  }
};

// GET distribution of items by category
router.get('/distribution', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { foodItems: true }
        }
      },
      orderBy: {
        foodItems: { _count: 'desc' }
      },
    });

    const distribution: CategoryDistribution[] = categories.map(cat => ({
      category: cat.name,
      items: cat._count.foodItems
    }));

    res.json({ distribution });
  } catch (error) {
    next(error);
  }
});

// GET all categories
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' }
    });
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

// GET single category
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const categoryId = Number(id);
    
    if (isNaN(categoryId) || categoryId < 1) {
      const error = new Error('Invalid category ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      const error = new Error('Category not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    res.json({ category });
  } catch (error) {
    next(error);
  }
});

// Create new category
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, limit, limitType, icon } = req.body;

    if (typeof name !== 'string' || name.length < 3 || name.length > 36) {
      const error = new Error('Name must be between 3 and 36 characters') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      const error = new Error('Limit must be a number between 1 and 100') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    // Validate limitType
    if (limitType && !['person', 'household'].includes(limitType)) {
      const error = new Error('Limit type must be either "person" or "household"') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const normalizedName = name.trim().replace(/\\s+/g, ' ');
    const nameSearch = normalizedName.toLowerCase();

    try {
      const category = await createCategoryWithEvent({
        name: normalizedName,
        nameSearch,
        limit,
        icon: icon || undefined,
        ...(limitType && { limitType })
      });

      // Queue translations outside of the transaction
      try {
        // Get enabled languages
        const enabledLanguages = await prisma.language.findMany({
          where: { 
            isEnabled: true,
            name: { notIn: ['en', 'eng', 'english', 'English'] } // Skip all English variants
          }
        });

        // Create translations for all enabled languages
        for (const lang of enabledLanguages) {
          // Create pending entry
          await prisma.translation.create({
            data: {
              originalText: normalizedName,
              type: 'Category',
              language: lang.name,
              status: 'pending'
            }
          });
        }
        
        // Translations will be processed via AI service layer during upsert operations

        // We'll handle translation in background via the translation-trigger service
        // This prevents transaction timeouts
      } catch (translationError) {
        // Log translation initialization error but don't fail the request
        console.error('Error setting up translations:', translationError);
      }

      res.status(201).json({ category });
    } catch (error) {
      // Handle specific Prisma errors
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A category with this name already exists') as Error & { statusCode?: number };
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

// Update category
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name, limit, limitType, icon, keepTranslations } = req.body;

    // Validate id
    const categoryId = Number(id);
    if (isNaN(categoryId)) {
      const error = new Error('Invalid category ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    // Validate input
    if (typeof name !== 'string' || name.length < 3 || name.length > 36) {
      const error = new Error('Name must be between 3 and 36 characters') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    if (typeof limit !== 'number' || limit < 1 || limit > 100) {
      const error = new Error('Limit must be a number between 1 and 100') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    const normalizedName = name.trim().replace(/\\s+/g, ' ');
    const nameSearch = normalizedName.toLowerCase();

    // Check if category exists and get its old name
    const existing = await prisma.category.findUnique({
      where: { id: categoryId }
    });

    if (!existing) {
      const error = new Error('Category not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }

    const oldName = existing.name;
    const nameChanged = oldName !== normalizedName;

    // Use a shorter transaction just for the DB update
    try {
      const { category } = await updateCategoryWithEvent(categoryId, {
        name: normalizedName,
        nameSearch,
        limit,
        icon: icon || undefined,
        ...(limitType && { limitType })
      });

      // Handle translations outside the transaction
      if (nameChanged) {
        try {
          // Only delete translations if keepTranslations is false or not provided
          if (!keepTranslations) {
            // Delete old translations
            await prisma.translation.deleteMany({
              where: {
                originalText: oldName,
                type: 'Category'
              }
            });
          }

          // Get enabled languages
          const enabledLanguages = await prisma.language.findMany({
            where: { 
              isEnabled: true,
              name: { notIn: ['en', 'eng', 'english', 'English'] } // Skip all English variants
            }
          });

          // Create new translations as pending
          for (const lang of enabledLanguages) {
            await prisma.translation.create({
              data: {
                originalText: normalizedName,
                type: 'Category',
                language: lang.name,
                status: 'pending'
              }
            });
          }
          
          // Translations will be processed via AI service layer during upsert operations
        } catch (translationError) {
          console.error('Error updating translations:', translationError);
          // Don't fail the request because the category was already updated
        }
      }

      res.json({ category });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A category with this name already exists') as Error & { statusCode?: number };
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

// Bulk update categories
router.put('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('Bulk update request body:', req.body);
    const { ids, updates } = req.body as BulkUpdateRequest;
    const validIds = validateIds(ids);

    // Validate updates
    if (!updates || typeof updates !== 'object') {
      const error = new Error('Invalid updates') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    try {
      const updatedCategories = await prisma.$transaction(async (tx) => {
        // Verify all categories exist
        const existingCategories = await tx.category.findMany({
          where: { id: { in: validIds } }
        });

        if (existingCategories.length !== validIds.length) {
          const error = new Error('One or more categories not found') as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }

        // Prepare update data
        const updateData: any = {};

        if (updates.name) {
          if (typeof updates.name !== 'string' || updates.name.length < 3 || updates.name.length > 36) {
            const error = new Error('Name must be between 3 and 36 characters') as Error & { statusCode?: number };
            error.statusCode = 400;
            throw error;
          }
          updateData.name = updates.name.trim().replace(/\\s+/g, ' ');
          updateData.nameSearch = updateData.name.toLowerCase();
        }

        if (updates.limit) {
          if (typeof updates.limit !== 'number' || updates.limit < 1 || updates.limit > 100) {
            const error = new Error('Limit must be a number between 1 and 100') as Error & { statusCode?: number };
            error.statusCode = 400;
            throw error;
          }
          updateData.limit = updates.limit;
        }

        if (updates.icon !== undefined) {
          updateData.icon = updates.icon || undefined;
        }

        const updatedCategories = [];
        for (const before of existingCategories) {
          const category = await tx.category.update({
            where: { id: before.id },
            data: updateData
          });
          const flags = categoryEventFlags(before, category);
          if (hasCategoryEventChange(flags)) {
            await writeCategoryInventoryEvent(tx, category, 'updated', flags);
          }
          updatedCategories.push(category);
        }

        return updatedCategories;
      });

      res.json({ categories: updatedCategories });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {  // Unique constraint violation
          const friendlyError = new Error('A category with this name already exists') as Error & { statusCode?: number };
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

// Bulk delete categories
router.delete('/bulk', async (req: Request, res: Response, next: NextFunction) => {
  console.log('Hit bulk delete endpoint');
  try {
    console.log('Bulk delete request:', {
      body: req.body,
      headers: req.headers
    });
    
    const { ids } = req.body;
    console.log('Raw IDs from request:', ids);
    
    const validIds = validateIds(ids);
    console.log('Validated IDs:', validIds);

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Verify all categories exist and check for food items
        const existingCategories = await tx.category.findMany({
          where: { id: { in: validIds } },
          include: {
            foodItems: {
              select: {
                id: true
              }
            }
          }
        });

        if (existingCategories.length !== validIds.length) {
          const error = new Error('One or more categories not found') as Error & { statusCode?: number };
          error.statusCode = 404;
          throw error;
        }

        // Separate categories into those with and without items
        const categoriesWithItems = existingCategories.filter(cat => cat.foodItems.length > 0);
        const categoriesToDelete = existingCategories.filter(cat => cat.foodItems.length === 0);

        // If all categories have items, throw an error
        if (categoriesWithItems.length === existingCategories.length) {
          const totalItemCount = categoriesWithItems.reduce((sum, cat) => sum + cat.foodItems.length, 0);
          const categoryNames = categoriesWithItems.map(cat => `${cat.name} (${cat.foodItems.length} item${cat.foodItems.length === 1 ? '' : 's'})`).join(', ');
          const error = new Error(
            `${categoryNames} cannot be deleted because ${totalItemCount} food item${totalItemCount === 1 ? ' is' : 's are'} still assigned. Please delete or reassign the item${totalItemCount === 1 ? '' : 's'} and try again.`
          ) as Error & { statusCode?: number };
          error.statusCode = 409;
          throw error;
        }

        console.log('Deleting categories:', categoriesToDelete.map(c => c.id));
        
        // Delete eligible categories and their translations
        if (categoriesToDelete.length > 0) {
          // First delete associated translations
          await tx.translation.deleteMany({
            where: {
              originalText: { in: categoriesToDelete.map(c => c.name) },
              type: 'Category'
            }
          });

          for (const category of categoriesToDelete) {
            await writeCategoryInventoryEvent(
              tx,
              category,
              'deleted',
              { recordsLimit: false, recordsIdentity: false },
              true
            );
          }

          // Then delete the categories
          await tx.category.deleteMany({
            where: { id: { in: categoriesToDelete.map(c => c.id) } }
          });
        }

        // Prepare result
        const result: BulkDeleteResult = {
          success: {
            count: categoriesToDelete.length,
            names: categoriesToDelete.map(c => c.name)
          },
          failure: {
            count: categoriesWithItems.length,
            categories: categoriesWithItems.map(c => ({
              name: c.name,
              itemCount: c.foodItems.length
            }))
          }
        };

        return result;
      });

      // If there were any failures, send a 207 Multi-Status response
      if (result.failure.count > 0) {
        const failureDetails = result.failure.categories
          .map(c => `${c.name} (${c.itemCount} item${c.itemCount === 1 ? '' : 's'})`)
          .join(', ');
        
        const message = `Partially completed. Successfully deleted ${result.success.count} ${result.success.count === 1 ? 'category' : 'categories'}: ${result.success.names.join(', ')}. Failed to delete ${failureDetails} because they have assigned items.`;
        
        res.status(207).json({
          message,
          result
        });
      } else {
        // All successful, send a 200 OK
        res.status(200).json({
          message: `Successfully deleted ${result.success.count} ${result.success.count === 1 ? 'category' : 'categories'}: ${result.success.names.join(', ')}.`,
          result
        });
      }
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

// Delete single category
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const categoryId = Number(id);
    
    if (isNaN(categoryId)) {
      const error = new Error('Invalid category ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }

    await deleteCategoryWithEvent(categoryId);

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
