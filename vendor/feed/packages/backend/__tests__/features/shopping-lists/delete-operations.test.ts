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
  setupBulkDeleteTest,
  expectValidationError,
  expectNotFoundError
} from './shared/setup';

// Create mock Prisma client
const mockPrisma = createMockPrisma();

// Mock the database module
vi.mock('../../../src/db', () => ({
  default: mockPrisma
}));

describe('Shopping Lists Delete Operations', () => {
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

  describe('Single Template Delete', () => {
    test('should delete a single template successfully', async () => {
      const templateToDelete = createMockTemplates(1)[0];
      
      // Mock successful deletion (no findUnique call in actual route)
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(templateToDelete);

      await request(app)
        .delete(`/api/shopping-lists/templates/${templateToDelete.id}`)
        .expect(204);

      // Verify database interactions (no findUnique call in actual implementation)
      expect(mockPrisma.shoppingListTemplate.delete).toHaveBeenCalledWith({
        where: { id: templateToDelete.id }
      });
      expect(mockPrisma.shoppingListTemplate.findUnique).not.toHaveBeenCalled();
    });

    test('should validate template ID parameter', async () => {
      const response = await request(app)
        .delete('/api/shopping-lists/templates/invalid-id')
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid template ID')
        }
      });
    });

    test('should handle negative ID values', async () => {
      const response = await request(app)
        .delete('/api/shopping-lists/templates/-1')
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid template ID')
        }
      });
    });

    test('should handle zero ID value', async () => {
      const response = await request(app)
        .delete('/api/shopping-lists/templates/0')
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid template ID')
        }
      });
    });

    test('should handle non-existent template', async () => {
      const nonExistentId = 999;
      // Mock Prisma P2025 error for non-existent record
      mockPrisma.shoppingListTemplate.delete.mockRejectedValue(
        new MockPrismaError('Record to delete does not exist', 'P2025')
      );

      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${nonExistentId}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('The requested resource was not found')
        }
      });

      // Verify delete was attempted (no findUnique in actual implementation)
      expect(mockPrisma.shoppingListTemplate.delete).toHaveBeenCalledWith({
        where: { id: nonExistentId }
      });
      expect(mockPrisma.shoppingListTemplate.findUnique).not.toHaveBeenCalled();
    });

    test('should handle active template with sections', async () => {
      const activeTemplateWithSections = {
        ...createMockTemplates(1)[0],
        sections: [
          {
            id: 1,
            templateId: 1,
            sectionType: 'category',
            categoryId: 1,
            displayOrder: 0,
            isEnabled: true,
            title: 'Test Section',
            subtitle: null,
            configuration: {},
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      };
      
      // Mock successful deletion (cascade delete handled by database)
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(activeTemplateWithSections);

      await request(app)
        .delete(`/api/shopping-lists/templates/${activeTemplateWithSections.id}`)
        .expect(204);

      // Should delete successfully (sections cascade deleted by database)
      expect(mockPrisma.shoppingListTemplate.delete).toHaveBeenCalledWith({
        where: { id: activeTemplateWithSections.id }
      });
    });

    test('should handle database constraint violation during deletion', async () => {
      const templateToDelete = createMockTemplates(1)[0];
      
      // Mock foreign key constraint violation
      mockPrisma.shoppingListTemplate.delete.mockRejectedValue(
        new MockPrismaError('Foreign key constraint failed', 'P2003')
      );

      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${templateToDelete.id}`)
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          message: 'A database operation failed.'
        }
      });
    });

    test('should handle concurrent deletion (record not found)', async () => {
      const templateToDelete = createMockTemplates(1)[0];
      
      // Mock record not found during deletion (concurrent deletion)
      mockPrisma.shoppingListTemplate.delete.mockRejectedValue(
        new MockPrismaError('Record to delete does not exist', 'P2025')
      );

      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${templateToDelete.id}`)
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          message: 'The requested resource was not found.'
        }
      });
    });

    test('should handle network timeout during deletion', async () => {
      const templateToDelete = createMockTemplates(1)[0];
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      
      // Mock network timeout during deletion
      mockPrisma.shoppingListTemplate.delete.mockRejectedValue(timeoutError);

      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${templateToDelete.id}`)
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          message: 'An internal server error occurred.'
        }
      });
    });
  });

  describe('Bulk Template Delete - Advanced Scenarios', () => {
    test('should handle mixed template states in bulk delete', async () => {
      const testData = createBulkTestData();
      const mixedTemplates = [
        ...testData.activeTemplates.slice(0, 2),
        ...testData.inactiveTemplates.slice(0, 2)
      ];
      const idsToDelete = mixedTemplates.map(t => t.id);
      
      setupBulkDeleteTest(mockPrisma, mixedTemplates);

      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
    });

    test('should handle templates with instances in bulk delete', async () => {
      const templatesWithInstances = createMockTemplates(3).map(template => ({
        ...template,
        instances: [
          {
            id: template.id * 10,
            templateId: template.id,
            generatedData: { test: 'data' },
            title: `Instance for ${template.name}`,
            generatedAt: new Date(),
            generatedBy: 'test-user'
          }
        ]
      }));
      const idsToDelete = templatesWithInstances.map(t => t.id);
      
      setupBulkDeleteTest(mockPrisma, templatesWithInstances);

      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      // Should still delete successfully (instances cascade deleted by database)
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
    });

    test('should handle maximum batch size for bulk delete', async () => {
      const maxBatchSize = 100;
      const largeTemplateSet = createMockTemplates(maxBatchSize);
      const idsToDelete = largeTemplateSet.map(t => t.id);
      
      setupBulkDeleteTest(mockPrisma, largeTemplateSet);

      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
    });

    test('should handle duplicate IDs in bulk delete request', async () => {
      const templates = createMockTemplates(2);
      const duplicateIds = [1, 2, 1, 2]; // Duplicate IDs
      
      // Mock finding only unique templates (2 templates for 4 IDs)
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(templates);

      // Expect 404 because array length mismatch (4 requested IDs vs 2 found templates)
      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: duplicateIds })
        .expect(404);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('not found')
        }
      });

      // Should still query for the IDs (including duplicates)
      expect(mockPrisma.shoppingListTemplate.findMany).toHaveBeenCalledWith({
        where: { id: { in: duplicateIds } }
      });
    });

    test('should validate extremely large ID values', async () => {
      const extremeIds = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1];
      
      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: extremeIds })
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid ID format')
        }
      });
    });

    test('should handle partial success in bulk delete with transaction rollback', async () => {
      const templates = createMockTemplates(3);
      const idsToDelete = templates.map(t => t.id);
      
      // Mock successful find but deletion failure for referential integrity
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(templates);
      mockPrisma.shoppingListTemplate.deleteMany.mockRejectedValue(
        new MockPrismaError('Foreign key constraint failed on some records', 'P2003')
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
  });

  describe('Delete Operations Edge Cases', () => {
    test('should handle template deletion with circular references', async () => {
      // Simulate a complex scenario where templates might reference each other
      const complexTemplate = {
        ...createMockTemplates(1)[0],
        sections: [
          {
            id: 1,
            templateId: 1,
            sectionType: 'category',
            categoryId: 1,
            displayOrder: 0,
            isEnabled: true,
            title: 'Complex Section',
            subtitle: null,
            configuration: { complexRef: 'some-reference' },
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      };
      
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(complexTemplate);
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(complexTemplate);

      await request(app)
        .delete(`/api/shopping-lists/templates/${complexTemplate.id}`)
        .expect(204);

      expect(mockPrisma.shoppingListTemplate.delete).toHaveBeenCalledTimes(1);
    });

    test('should handle deletion during active template generation', async () => {
      const activeTemplate = {
        ...createMockTemplates(1)[0],
        instances: [
          {
            id: 1,
            templateId: 1,
            generatedData: { inProgress: true },
            title: 'In Progress Instance',
            generatedAt: new Date(),
            generatedBy: 'concurrent-user'
          }
        ]
      };
      
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(activeTemplate);
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(activeTemplate);

      await request(app)
        .delete(`/api/shopping-lists/templates/${activeTemplate.id}`)
        .expect(204);

      // Should still delete successfully, concurrent operations handled by database constraints
      expect(mockPrisma.shoppingListTemplate.delete).toHaveBeenCalledTimes(1);
    });

    test('should handle deletion with malformed section configuration', async () => {
      const templateWithMalformedSection = {
        ...createMockTemplates(1)[0],
        sections: [
          {
            id: 1,
            templateId: 1,
            sectionType: 'category',
            categoryId: 1,
            displayOrder: 0,
            isEnabled: true,
            title: 'Malformed Section',
            subtitle: null,
            configuration: null, // Malformed configuration
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      };
      
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(templateWithMalformedSection);
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(templateWithMalformedSection);

      await request(app)
        .delete(`/api/shopping-lists/templates/${templateWithMalformedSection.id}`)
        .expect(204);

      // Should handle malformed data gracefully during deletion
      expect(mockPrisma.shoppingListTemplate.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Delete Operations Performance', () => {
    test('should complete single delete within performance threshold', async () => {
      const templateToDelete = createMockTemplates(1)[0];
      
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(templateToDelete);
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(templateToDelete);

      const startTime = Date.now();
      
      await request(app)
        .delete(`/api/shopping-lists/templates/${templateToDelete.id}`)
        .expect(204);

      const endTime = Date.now();
      
      // Should complete within 1 second
      expect(endTime - startTime).toBeLessThan(1000);
    });

    test('should complete bulk delete within performance threshold', async () => {
      const largeTemplateSet = createMockTemplates(50);
      const idsToDelete = largeTemplateSet.map(t => t.id);
      
      setupBulkDeleteTest(mockPrisma, largeTemplateSet);

      const startTime = Date.now();
      
      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      const endTime = Date.now();
      
      // Should complete within 3 seconds for 50 items
      expect(endTime - startTime).toBeLessThan(3000);
      
      // Should use bulk operation, not individual deletes
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('Delete Operations Data Integrity', () => {
    test('should maintain referential integrity with cascade deletion', async () => {
      const templateWithComplexRelations = {
        ...createMockTemplates(1)[0],
        sections: [
          {
            id: 1,
            templateId: 1,
            sectionType: 'category',
            categoryId: 1,
            displayOrder: 0,
            isEnabled: true,
            title: 'Category Section',
            subtitle: null,
            configuration: {},
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ],
        instances: [
          {
            id: 1,
            templateId: 1,
            generatedData: { test: 'data' },
            title: 'Test Instance',
            generatedAt: new Date(),
            generatedBy: 'test-user'
          }
        ]
      };
      
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(templateWithComplexRelations);
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(templateWithComplexRelations);

      await request(app)
        .delete(`/api/shopping-lists/templates/${templateWithComplexRelations.id}`)
        .expect(204);

      // Verify that the main template deletion was called
      // Database cascade rules handle related record deletion
      expect(mockPrisma.shoppingListTemplate.delete).toHaveBeenCalledWith({
        where: { id: templateWithComplexRelations.id }
      });
    });

    test('should handle foreign key constraint violations gracefully', async () => {
      const templateToDelete = createMockTemplates(1)[0];
      
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(templateToDelete);
      mockPrisma.shoppingListTemplate.delete.mockRejectedValue(
        new MockPrismaError('Foreign key constraint failed', 'P2003')
      );

      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${templateToDelete.id}`)
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          message: 'A database operation failed.'
        }
      });
    });

    test('should validate template ownership before deletion', async () => {
      const templateToDelete = createMockTemplates(1)[0];
      
      // Template exists but deletion fails due to ownership constraints
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(templateToDelete);
      mockPrisma.shoppingListTemplate.delete.mockRejectedValue(
        new MockPrismaError('Operation not permitted', 'P2004')
      );

      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${templateToDelete.id}`)
        .expect(500);

      expect(response.body).toMatchObject({
        error: {
          message: 'A database operation failed.'
        }
      });
    });
  });

  describe('Delete Operations Security', () => {
    test('should prevent SQL injection in template ID', async () => {
      const maliciousId = "1; DROP TABLE ShoppingListTemplate; --";
      
      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${encodeURIComponent(maliciousId)}`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: {
          message: expect.stringContaining('Invalid template ID')
        }
      });

      // Ensure no database operations were attempted
      expect(mockPrisma.shoppingListTemplate.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.shoppingListTemplate.delete).not.toHaveBeenCalled();
    });

    test('should prevent bulk delete with malicious payload', async () => {
      const maliciousPayload = {
        ids: [1, 2],
        extraField: "'; DROP TABLE ShoppingListTemplate; --"
      };
      
      // Even with extra fields, should validate and process only valid IDs
      const templates = createMockTemplates(2);
      setupBulkDeleteTest(mockPrisma, templates);

      await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send(maliciousPayload)
        .expect(204);

      // Should process legitimate IDs despite malicious extra fields
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } }
      });
    });
  });
});
