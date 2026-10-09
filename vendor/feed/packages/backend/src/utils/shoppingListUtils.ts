// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { ShoppingListTemplate, ShoppingListSection, ShoppingListInstance } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Types for validation
export interface ShoppingListTemplateInput {
  name: string;
  description?: string;
  language?: string;
  layoutType: 'full-page' | 'split-page' | 'grid-2x3' | 'grid-2x4';
  paperSize?: 'letter' | 'legal' | 'a4';
}

export interface ShoppingListTemplateUpdateInput extends Partial<ShoppingListTemplateInput> {}

export interface ShoppingListSectionInput {
  sectionType: 'custom-text' | 'form' | 'category';
  categoryId?: number;
  displayOrder: number;
  isEnabled?: boolean;
  title?: string;
  subtitle?: string;
  configuration?: any;
}

export interface ShoppingListInstanceInput {
  templateId: number;
  generatedData: any;
  title: string;
  generatedBy?: string;
}
// New request type for server-side generation without precomputed data
export interface ShoppingListGenerateOptionsInput {
  templateId: number;
  title: string;
  generatedBy?: string;
  languages?: string[];
  translationOptions?: any;
  proceduralElements?: any;
  dietaryFilters?: any;
  header?: { includeDate?: boolean };
}

export interface ShoppingListTemplateWithSections extends ShoppingListTemplate {
  sections: ShoppingListSection[];
  instances?: ShoppingListInstance[];
}

// Validation functions
export function validateShoppingListTemplate(data: ShoppingListTemplateInput): void {
  // Validate name
  if (!data.name || typeof data.name !== 'string') {
    const error = new Error('Template name is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  if (data.name.length < 3 || data.name.length > 50) {
    const error = new Error('Template name must be between 3 and 50 characters') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  // Validate layoutType
  if (!data.layoutType || !['full-page', 'split-page', 'grid-2x3', 'grid-2x4'].includes(data.layoutType)) {
    const error = new Error('Invalid layout type. Must be one of: full-page, split-page, grid-2x3, grid-2x4') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  // Validate language if provided
  if (data.language && typeof data.language !== 'string') {
    const error = new Error('Language must be a string') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  // Validate paperSize if provided
  if (data.paperSize && !['letter', 'legal', 'a4'].includes(data.paperSize)) {
    const error = new Error('Invalid paper size. Must be one of: letter, legal, a4') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
}

export function validateShoppingListSection(data: ShoppingListSectionInput): void {
  // Validate sectionType
  if (!data.sectionType || !['custom-text', 'form', 'category'].includes(data.sectionType)) {
    const error = new Error('Invalid section type. Must be one of: custom-text, form, category') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  // Validate displayOrder
  if (typeof data.displayOrder !== 'number' || data.displayOrder < 0) {
    const error = new Error('Display order must be a non-negative number') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  // Validate categoryId for category sections
  if (data.sectionType === 'category' && !data.categoryId) {
    const error = new Error('Category ID is required for category sections') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
}

export function validateShoppingListInstance(data: ShoppingListInstanceInput): void {
  // Validate templateId
  if (!data.templateId || typeof data.templateId !== 'number' || data.templateId < 1) {
    const error = new Error('Valid template ID is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  // Validate title
  if (!data.title || typeof data.title !== 'string') {
    const error = new Error('Instance title is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  if (data.title.length < 3 || data.title.length > 100) {
    const error = new Error('Instance title must be between 3 and 100 characters') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  // Validate generatedData
  if (!data.generatedData) {
    const error = new Error('Generated data is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
}

// Validation for server-side generation request (no generatedData provided)
export function validateShoppingListGenerateOptions(data: ShoppingListGenerateOptionsInput): void {
  // Validate templateId
  if (!data.templateId || typeof data.templateId !== 'number' || data.templateId < 1) {
    const error = new Error('Valid template ID is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  // Validate title
  if (!data.title || typeof data.title !== 'string') {
    const error = new Error('Instance title is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }

  if (data.title.length < 3 || data.title.length > 100) {
    const error = new Error('Instance title must be between 3 and 100 characters') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
}

export function validateIds(ids: any): number[] {
  if (!Array.isArray(ids)) {
    const error = new Error('IDs must be an array') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  if (ids.length === 0) {
    const error = new Error('At least one ID is required') as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
  
  const validIds = ids.map((id) => {
    const numId = Number(id);
    if (isNaN(numId) || numId < 1 || !Number.isSafeInteger(numId)) {
      const error = new Error('Invalid ID format') as Error & { statusCode?: number };
      error.statusCode = 400;
      throw error;
    }
    return numId;
  });
  
  return validIds;
}

export function handlePrismaError(error: any): never {
  console.error('Prisma error:', error);
  
  if (error instanceof PrismaClientKnownRequestError) {
    // Handle known errors
    if (error.code === 'P2002') {
      const customError = new Error('A template with this name already exists') as Error & { statusCode?: number };
      customError.statusCode = 409;
      throw customError;
    }
    
    if (error.code === 'P2025') {
      const customError = new Error('Template not found') as Error & { statusCode?: number };
      customError.statusCode = 404;
      throw customError;
    }
  }
  
  // For unknown errors
  const unknownError = new Error('An error occurred with the database operation') as Error & { statusCode?: number };
  unknownError.statusCode = 500;
  throw unknownError;
}
