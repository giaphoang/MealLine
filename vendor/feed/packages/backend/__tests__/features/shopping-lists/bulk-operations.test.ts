import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { 
  createMockTemplates, 
  createBulkTestData, 
  MockPrismaError,
  createMockPrisma 
} from './shared/mocks';
import {
  createTestContext,
  setupBulkDeleteTest,
  setupBulkUpdateTest,
  expectBulkDeleteSuccess,
  expectBulkUpdateSuccess,
  expectValidationError,
  expectNotFoundError,
  createValidBulkDeleteRequest,
  createValidBulkUpdateRequest,
  createInvalidIdsRequest,
  createEmptyIdsRequest,
  createInvalidUpdateRequest
} from './shared/setup';

// Create mock Prisma client
const mockPrisma = createMockPrisma();

// Mock the database module
vi.mock('../../../src/db', () => ({
  default: mockPrisma
}));

describe('Shopping Lists Bulk Operations', () => {
  let app: express.Application;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create Express app for testing
    app = express();
    app.use(express.json());
    
    // Dynamically import the router to ensure it uses the mocked prisma
    const shoppingListsRouter = (await import('../../../src/routes/shopping-lists')).default;
    
    app.use('/api/shopping-lists', shoppingListsRouter);
  });

  describe('Bulk Delete Templates', () => {
    test('should delete multiple templates successfully', async () => {
      const testData = createBulkTestData();
      const idsToDelete = [1, 2, 3];
      const templatesToDelete = testData.mixedTemplates.filter(t => idsToDelete.includes(t.id));
      
      setupBulkDeleteTest(mockPrisma, templatesToDelete);

      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      // Verify database interactions
      expect(mockPrisma.shoppingListTemplate.findMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
    });

    test('should validate required ids parameter', async () => {
      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('required')
        }
      });
    });

    test('should validate ids array is not empty', async () => {
      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: [] })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('At least one ID is required')
        }
      });
    });

    test('should validate id format', async () => {
      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: ['invalid', 'format'] })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid ID format')
        }
      });
    });

    test('should handle non-existent templates', async () => {
      const idsToDelete = [999, 1000];
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue([]);

      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('not found')
        }
      });
    });

    test('should handle partial template existence', async () => {
      const idsToDelete = [1, 999];
      const existingTemplates = [createMockTemplates(1)[0]]; // Only ID 1 exists
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(existingTemplates);

      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('not found')
        }
      });
    });

    test('should handle database errors during deletion', async () => {
      const testData = createBulkTestData();
      const idsToDelete = [1, 2];
      
      // Setup successful findMany but failed deleteMany
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(testData.mixedTemplates.slice(0, 2));
      mockPrisma.shoppingListTemplate.deleteMany.mockRejectedValue(
        new MockPrismaError('Database constraint violation', 'P2003')
      );

      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          message: 'A database operation failed.'
        }
      });
    });

    test('should handle cascade deletion of sections and instances', async () => {
      const testData = createBulkTestData();
      const idsToDelete = [1, 2];
      const templatesToDelete = testData.mixedTemplates.slice(0, 2);
      
      setupBulkDeleteTest(mockPrisma, templatesToDelete);

      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      // Verify deletion was called with correct IDs
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
    });
  });

  describe('Bulk Update Templates', () => {
    test('should update multiple templates successfully', async () => {
      const testData = createBulkTestData();
      const idsToUpdate = [1, 2];
      const existingTemplates = testData.mixedTemplates.slice(0, 2);
      const updates = { layoutType: 'split-page' as const };

      const updatedTemplates = existingTemplates.map(t => ({ ...t, ...updates }));
      setupBulkUpdateTest(mockPrisma, existingTemplates, updatedTemplates);

      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToUpdate, updates })
        .expect(200);

      expect(response.body).toMatchObject({
        templates: expect.arrayContaining(
          updatedTemplates.map(t => expect.objectContaining({
            id: t.id,
            layoutType: 'split-page'
          }))
        )
      });

      // Verify transaction was called (bulk update route doesn't call findMany)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    test('should validate required parameters', async () => {
      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('required')
        }
      });
    });

    test('should validate updates object', async () => {
      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ ids: [1, 2], updates: null })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid updates')
        }
      });
    });

    test('should validate name length in updates', async () => {
      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ 
          ids: [1, 2], 
          updates: { name: 'ab' } // Too short
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('between 3 and 50 characters')
        }
      });
    });

    test('should validate layoutType in updates', async () => {
      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ 
          ids: [1, 2], 
          updates: { layoutType: 'invalid-layout' }
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid layout type')
        }
      });
    });

    test('should validate paperSize in updates', async () => {
      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ 
          ids: [1, 2], 
          updates: { paperSize: 'invalid-size' }
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid paper size')
        }
      });
    });

    test('should handle non-existent templates in bulk update', async () => {
      const idsToUpdate = [999, 1000];
      // Mock transaction to fail for non-existent templates
      mockPrisma.$transaction.mockRejectedValue(
        new MockPrismaError('Record to update not found', 'P2025')
      );

      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ 
          ids: idsToUpdate, 
          updates: { layoutType: 'split-page' }
        })
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          message: 'The requested resource was not found.'
        }
      });
    });

    // Removed: 'should update only isActive status'. `ShoppingListTemplate`
    // has no `isActive` column -- it appears in no migration, and neither
    // shopping-list route reads or writes it. The test set the field on its
    // own mock, had the mock hand it back, and asserted it: it could not fail.
    // Single-field bulk update is still covered by the `layoutType` cases
    // above and below, against a column that exists.

    test('should update multiple fields simultaneously', async () => {
      const testData = createBulkTestData();
      const idsToUpdate = [1, 2];
      const existingTemplates = testData.mixedTemplates.slice(0, 2);
      const updates = {
        layoutType: 'grid-2x3' as const,
        paperSize: 'legal' as const,
        description: 'Bulk updated description'
      };
      
      const updatedTemplates = existingTemplates.map(t => ({ ...t, ...updates }));
      setupBulkUpdateTest(mockPrisma, existingTemplates, updatedTemplates);

      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToUpdate, updates })
        .expect(200);

      response.body.templates.forEach((template: any) => {
        expect(template.layoutType).toBe('grid-2x3');
        expect(template.paperSize).toBe('legal');
        expect(template.description).toBe('Bulk updated description');
      });
    });

    test('should handle database errors during bulk update', async () => {
      const testData = createBulkTestData();
      const idsToUpdate = [1, 2];
      
      // Setup transaction to fail with constraint error
      mockPrisma.$transaction.mockRejectedValue(
        new MockPrismaError('Database constraint violation', 'P2002')
      );

      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ 
          ids: idsToUpdate, 
          updates: { layoutType: 'split-page' }
        })
        .expect(409);

      expect(response.body).toMatchObject({
        error: {
          message: 'A resource with this name already exists.'
        }
      });
    });
  });

  describe('Bulk Operations Error Handling', () => {
    test('should handle network timeout errors', async () => {
      const idsToDelete = [1, 2];
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      
      mockPrisma.shoppingListTemplate.findMany.mockRejectedValue(timeoutError);

      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          message: 'An internal server error occurred.'
        }
      });
    });

    test('should handle concurrent modification conflicts', async () => {
      const idsToUpdate = [1, 2];
      const conflictError = new MockPrismaError('Record to update not found', 'P2025');
      
      mockPrisma.$transaction.mockRejectedValue(conflictError);

      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({
          ids: idsToUpdate,
          updates: { layoutType: 'split-page' }
        })
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          message: 'The requested resource was not found.'
        }
      });
    });

    test('should handle foreign key constraint violations', async () => {
      const idsToDelete = [1, 2];
      const constraintError = new MockPrismaError('Foreign key constraint failed', 'P2003');
      
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(createMockTemplates(2));
      mockPrisma.shoppingListTemplate.deleteMany.mockRejectedValue(constraintError);

      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          message: 'A database operation failed.'
        }
      });
    });
  });

  describe('Bulk Operations Performance', () => {
    test('should handle large batch deletions efficiently', async () => {
      const largeTemplateSet = createMockTemplates(100);
      const idsToDelete = largeTemplateSet.map(t => t.id);
      
      setupBulkDeleteTest(mockPrisma, largeTemplateSet);

      const startTime = Date.now();
      
      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      const endTime = Date.now();
      
      // Should complete within reasonable time (5 seconds for 100 items)
      expect(endTime - startTime).toBeLessThan(5000);
      
      // Should use bulk operations, not individual deletes
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.shoppingListTemplate.delete).not.toHaveBeenCalled();
    });

    test('should handle large batch updates efficiently', async () => {
      const largeTemplateSet = createMockTemplates(50);
      const idsToUpdate = largeTemplateSet.map(t => t.id);
      const updates = { layoutType: 'split-page' };
      
      const updatedTemplates = largeTemplateSet.map(t => ({ ...t, ...updates }));
      // Only setup transaction mock for bulk update
      mockPrisma.$transaction.mockResolvedValue(updatedTemplates);

      const startTime = Date.now();
      
      await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToUpdate, updates })
        .expect(200);

      const endTime = Date.now();
      
      // Should complete within reasonable time (3 seconds for 50 items)
      expect(endTime - startTime).toBeLessThan(3000);
      
      // Should use a transaction
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bulk Operations Data Integrity', () => {
    test('should maintain referential integrity during bulk delete', async () => {
      const templatesWithSections = createMockTemplates(3);
      const idsToDelete = templatesWithSections.map(t => t.id);
      
      setupBulkDeleteTest(mockPrisma, templatesWithSections);

      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      // Verify bulk delete was called (cascade delete handled by database)
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
    });

    test('should validate business rules during bulk update', async () => {
      const testData = createBulkTestData();
      const idsToUpdate = [1, 2];
      const existingTemplates = testData.mixedTemplates.slice(0, 2);
      
      // Test that valid layout types are accepted
      const validUpdates = { layoutType: 'split-page' as const };
      const updatedTemplates = existingTemplates.map(t => ({ ...t, ...validUpdates }));
      // Only setup transaction mock for bulk update
      mockPrisma.$transaction.mockResolvedValue(updatedTemplates);

      await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToUpdate, updates: validUpdates })
        .expect(200);

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
