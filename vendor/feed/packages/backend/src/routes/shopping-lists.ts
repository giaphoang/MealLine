// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Router } from 'express';
import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import prisma from '../db';
import {
  validateShoppingListTemplate,
  validateShoppingListSection,
  validateShoppingListInstance,
  validateShoppingListGenerateOptions,
  validateIds,
  handlePrismaError,
  ShoppingListTemplateInput,
  ShoppingListTemplateUpdateInput,
  ShoppingListSectionInput,
  ShoppingListInstanceInput,
  ShoppingListGenerateOptionsInput
} from '../utils/shoppingListUtils';
import ShoppingListGenerationService, { GenerateOptionsRequest } from '../services/shopping-list-generation/ShoppingListGenerationService';

const router = Router();

// Centralized error handler for the shopping lists router
const handleRouteError = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Log the error for debugging purposes
  console.error(err);

  // Handle Prisma known request errors
  if (err instanceof PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        // Unique constraint violation
        return res.status(409).json({ error: { message: 'A resource with this name already exists.' } });
      case 'P2025':
        // Record to update or delete not found
        return res.status(404).json({ error: { message: 'The requested resource was not found.' } });
      default:
        // Other database errors
        return res.status(500).json({ error: { message: 'A database operation failed.' } });
    }
  }

  // Handle custom errors with a statusCode property
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message
      }
    });
  }
  
  // Fallback for any other errors
  return res.status(500).json({ error: { message: 'An internal server error occurred.' } });
};

interface BulkUpdateRequest {
  ids: number[];
  updates: ShoppingListTemplateUpdateInput;
}

// GET all shopping list templates
router.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = await prisma.shoppingListTemplate.findMany({
      include: {
        sections: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });
    
    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

// BULK update shopping list templates
router.put('/templates/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids, updates } = req.body as BulkUpdateRequest;

    if (!ids) {
      const error = new Error('IDs parameter is required') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const validIds = validateIds(ids);
    
    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      const error = new Error('Invalid updates object') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const updateData: any = {};
    
    if (updates.name !== undefined) {
      if (typeof updates.name !== 'string' || updates.name.length < 3 || updates.name.length > 50) {
        const error = new Error('Template name must be between 3 and 50 characters') as Error & { statusCode?: number };
        error.statusCode = 400;
        throw error;
      }
      updateData.name = updates.name;
    }
    
    if (updates.layoutType !== undefined) {
      if (!['full-page', 'split-page', 'grid-2x3', 'grid-2x4'].includes(updates.layoutType)) {
        const error = new Error('Invalid layout type') as Error & { statusCode?: number };
        error.statusCode = 400;
        throw error;
      }
      updateData.layoutType = updates.layoutType;
    }
    

    
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    
    if (updates.language !== undefined) {
      updateData.language = updates.language;
    }
    
    if (updates.paperSize !== undefined) {
      if (!['letter', 'legal', 'a4'].includes(updates.paperSize)) {
        const error = new Error('Invalid paper size') as Error & { statusCode?: number };
        error.statusCode = 400;
        throw error;
      }
      updateData.paperSize = updates.paperSize;
    }
    
    const transaction = validIds.map(id =>
      prisma.shoppingListTemplate.update({
        where: { id },
        data: updateData
      })
    );
    
    const updatedTemplates = await prisma.$transaction(transaction);
    res.json({ templates: updatedTemplates });
  } catch (error) {
    next(error);
  }
});

// BULK delete shopping list templates
router.delete('/templates/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    
    if (!ids) {
      const error = new Error('IDs parameter is required') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const validIds = validateIds(ids);
    
    // Verify all templates exist before attempting to delete
    const existingTemplates = await prisma.shoppingListTemplate.findMany({
      where: { id: { in: validIds } }
    });

    if (existingTemplates.length !== validIds.length) {
      const error = new Error('One or more templates not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    
    await prisma.shoppingListTemplate.deleteMany({
      where: { id: { in: validIds } }
    });
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// GET single shopping list template with sections
router.get('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const numId = Number(id);
    
    if (isNaN(numId) || numId < 1) {
      const error = new Error('Invalid template ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const template = await prisma.shoppingListTemplate.findUnique({
      where: { id: numId },
      include: {
        sections: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: true
          }
        },
        instances: {
          orderBy: { generatedAt: 'desc' },
          take: 10 // Get last 10 instances
        }
      }
    });
    
    if (!template) {
      const error = new Error('Template not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    
    res.json({ template });
  } catch (error) {
    next(error);
  }
});

// CREATE new shopping list template
router.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const templateData: ShoppingListTemplateInput = req.body;
    validateShoppingListTemplate(templateData);
    
    const newTemplate = await prisma.shoppingListTemplate.create({
      data: {
        name: templateData.name,
        description: templateData.description,
        language: templateData.language || 'en',
        layoutType: templateData.layoutType,
        paperSize: templateData.paperSize || 'letter'
      },
      include: {
        sections: true
      }
    });
    
    res.status(201).json({ template: newTemplate });
  } catch (error) {
    next(error);
  }
});

// UPDATE shopping list template
router.put('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const numId = Number(id);
    
    if (isNaN(numId) || numId < 1) {
      const error = new Error('Invalid template ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const updateData: ShoppingListTemplateUpdateInput = req.body;
    
    if (updateData.layoutType && !['full-page', 'split-page', 'grid-2x3', 'grid-2x4'].includes(updateData.layoutType)) {
      const error = new Error('Invalid layout type. Must be one of: full-page, split-page, grid-2x3, grid-2x4') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    if (updateData.paperSize && !['letter', 'legal', 'a4'].includes(updateData.paperSize)) {
      const error = new Error('Invalid paper size. Must be one of: letter, legal, a4') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    if (updateData.name && (updateData.name.length < 3 || updateData.name.length > 50)) {
      const error = new Error('Template name must be between 3 and 50 characters') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const updatedTemplate = await prisma.shoppingListTemplate.update({
      where: { id: numId },
      data: updateData,
      include: {
        sections: {
          orderBy: { displayOrder: 'asc' },
          include: {
            category: true
          }
        }
      }
    });
    
    res.json({ template: updatedTemplate });
  } catch (error) {
    next(error);
  }
});

// DELETE shopping list template
router.delete('/templates/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const numId = Number(id);
    
    if (isNaN(numId) || numId < 1) {
      const error = new Error('Invalid template ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    await prisma.shoppingListTemplate.delete({
      where: { id: numId }
    });
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// SECTION routes for templates

// CREATE section for template
router.post('/templates/:id/sections', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const templateId = Number(id);
    
    if (isNaN(templateId) || templateId < 1) {
      const error = new Error('Invalid template ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const sectionData: ShoppingListSectionInput = req.body;
    validateShoppingListSection(sectionData);
    
    const newSection = await prisma.shoppingListSection.create({
      data: {
        templateId,
        sectionType: sectionData.sectionType,
        categoryId: sectionData.categoryId,
        displayOrder: sectionData.displayOrder,
        isEnabled: sectionData.isEnabled ?? true,
        title: sectionData.title,
        subtitle: sectionData.subtitle,
        configuration: sectionData.configuration
      },
      include: {
        category: true
      }
    });
    
    res.status(201).json({ section: newSection });
  } catch (error) {
    next(error);
  }
});

// UPDATE section
router.put('/sections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sectionId = Number(id);
    
    if (isNaN(sectionId) || sectionId < 1) {
      const error = new Error('Invalid section ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const updateData: Partial<ShoppingListSectionInput> = req.body;
    
    const updatedSection = await prisma.shoppingListSection.update({
      where: { id: sectionId },
      data: updateData,
      include: {
        category: true
      }
    });
    
    res.json({ section: updatedSection });
  } catch (error) {
    next(error);
  }
});

// DELETE section
router.delete('/sections/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sectionId = Number(id);
    
    if (isNaN(sectionId) || sectionId < 1) {
      const error = new Error('Invalid section ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    await prisma.shoppingListSection.delete({
      where: { id: sectionId }
    });
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// INSTANCE routes

// GET all instances
router.get('/instances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const instances = await prisma.shoppingListInstance.findMany({
      include: {
        template: {
          select: {
            id: true,
            name: true,
            layoutType: true
          }
        }
      },
      orderBy: { generatedAt: 'desc' }
    });
    
    res.json({ instances });
  } catch (error) {
    next(error);
  }
});

// CREATE instance from template
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Branch behavior:
    // - If generatedData is provided: persist only (legacy path)
    // - Else: perform server-side generation using provided options
    const hasGeneratedData = Object.prototype.hasOwnProperty.call(req.body || {}, 'generatedData');

    if (hasGeneratedData) {
      const instanceData: ShoppingListInstanceInput = req.body;
      console.log('[DEBUG] POST /generate [persist-only] - Received data:', JSON.stringify(instanceData, null, 2));

      validateShoppingListInstance(instanceData);
      const normalizedGeneratedData = JSON.parse(JSON.stringify(instanceData.generatedData)) as Prisma.InputJsonValue;

      const newInstance = await prisma.shoppingListInstance.create({
        data: {
          templateId: instanceData.templateId,
          generatedData: normalizedGeneratedData,
          title: instanceData.title,
          generatedBy: instanceData.generatedBy
        },
        include: {
          template: {
            select: { id: true, name: true, layoutType: true }
          }
        }
      });

      console.log('[DEBUG] POST /generate [persist-only] - Created instance:', newInstance.id);
      return res.status(201).json({ instance: newInstance });
    }

    const optionsData: ShoppingListGenerateOptionsInput = req.body;
    console.log('[DEBUG] POST /generate [server-generate] - Received options:', JSON.stringify(optionsData, null, 2));

    validateShoppingListGenerateOptions(optionsData);

    // Generate server-side
    const generatedData = await ShoppingListGenerationService.generateFromTemplate(optionsData as GenerateOptionsRequest);
    const normalizedGeneratedData = JSON.parse(JSON.stringify(generatedData)) as Prisma.InputJsonValue;

    const newInstance = await prisma.shoppingListInstance.create({
      data: {
        templateId: optionsData.templateId,
        generatedData: normalizedGeneratedData,
        title: optionsData.title,
        generatedBy: optionsData.generatedBy
      },
      include: {
        template: {
          select: { id: true, name: true, layoutType: true }
        }
      }
    });

    console.log('[DEBUG] POST /generate [server-generate] - Created instance:', newInstance.id);
    res.status(201).json({ instance: newInstance });
  } catch (error) {
    console.error('[DEBUG] POST /generate - Error:', error);
    next(error);
  }
});

// GET single instance
router.get('/instances/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const instanceId = Number(id);
    
    console.log('[DEBUG] GET /instances/:id - Fetching instance:', instanceId);
    
    if (isNaN(instanceId) || instanceId < 1) {
      const error = new Error('Invalid instance ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    const instance = await prisma.shoppingListInstance.findUnique({
      where: { id: instanceId },
      include: {
        template: true
      }
    });
    
    console.log('[DEBUG] GET /instances/:id - Retrieved instance:', instance?.id);
    console.log('[DEBUG] GET /instances/:id - GeneratedData type:', typeof instance?.generatedData);
    console.log('[DEBUG] GET /instances/:id - GeneratedData:', JSON.stringify(instance?.generatedData, null, 2));
    
    if (!instance) {
      const error = new Error('Instance not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    
    res.json({ instance });
  } catch (error) {
    console.error('[DEBUG] GET /instances/:id - Error:', error);
    next(error);
  }
});

// GET PDF for instance
router.get('/instances/:id/pdf', (req: Request, res: Response, next: NextFunction) => {
  const instanceId = Number(req.params.id);

  if (isNaN(instanceId) || instanceId < 1) {
    const error = new Error('Invalid instance ID') as Error & { statusCode?: number };
    error.statusCode = 400;
    return next(error);
  }

  console.warn(`Shopping list PDF request blocked: generator deprecated (instance ${instanceId})`);
  const error = new Error(
    'Shopping list PDFs are temporarily unavailable while we migrate the generator. Please try again later.'
  ) as Error & { statusCode?: number };
  error.statusCode = 503;
  return next(error);
});

// NEW: GET React-PDF (server-rendered) for instance (split-page MVP)
router.get('/instances/:id/pdf-react', (req: Request, res: Response, next: NextFunction) => {
  const instanceId = Number(req.params.id);
  const layout = (req.query.layout as string) || 'split-page';

  if (isNaN(instanceId) || instanceId < 1) {
    const error = new Error('Invalid instance ID') as Error & { statusCode?: number };
    error.statusCode = 400;
    return next(error);
  }

  if (layout !== 'split-page') {
    const error = new Error('Only split-page layout is supported in MVP') as Error & { statusCode?: number };
    error.statusCode = 400;
    return next(error);
  }

  console.warn(`Shopping list React-PDF request blocked: service removed (instance ${instanceId})`);
  const error = new Error(
    'The legacy React-PDF exporter has been retired during the PDFMake migration. Please try again after the upgrade.'
  ) as Error & { statusCode?: number };
  error.statusCode = 503;
  return next(error);
});

// DELETE instance
router.delete('/instances/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const instanceId = Number(id);
    
    if (isNaN(instanceId) || instanceId < 1) {
      const error = new Error('Invalid instance ID') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    
    await prisma.shoppingListInstance.delete({
      where: { id: instanceId }
    });
    
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// Attach the error handler to the router
router.use(handleRouteError as any);

export default router;
