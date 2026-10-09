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

// Create mock Prisma client
const mockPrisma = createMockPrisma();

// Mock the database module
vi.mock('../../../src/db', () => ({
  default: mockPrisma
}));

describe('Shopping Lists Messaging Architecture Backend Validation', () => {
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

  describe('Bulk Delete Operations - Message Architecture', () => {
    test('successful bulk delete returns success count without premature messaging', async () => {
      const testData = createBulkTestData(3);
      const idsToDelete = testData.templates.map(t => t.id);

      // Mock successful bulk delete
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(testData.templates);
      mockPrisma.shoppingListTemplate.deleteMany.mockResolvedValue({ count: 3 });

      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToDelete })
        .expect(204);

      // Verify response doesn't contain premature success messages
      expect(response.body).toEqual({});
      expect(response.text).toBe('');
      
      // Verify backend handles deletion cleanly
      expect(mockPrisma.shoppingListTemplate.findMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
      expect(mockPrisma.shoppingListTemplate.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: idsToDelete } }
      });
    });

    test('bulk delete with missing templates returns 404 without success messaging', async () => {
      const nonExistentIds = [999, 1000];

      // Mock templates not found
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue([]);

      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: nonExistentIds })
        .expect(404);

      // Verify error response structure without success messaging
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('One or more templates not found');
      
      // Verify no premature success messaging in error responses
      expect(response.body).not.toHaveProperty('success');
      expect(response.body).not.toHaveProperty('message');
    });

    test('bulk delete validation errors return clean error responses', async () => {
      const response = await request(app)
        .delete('/api/shopping-lists/templates/bulk')
        .send({ ids: [] })
        .expect(400);

      // Verify clean error response without messaging artifacts
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('At least one ID is required');
      
      // Verify no success messaging in validation errors
      expect(response.body).not.toHaveProperty('success');
      expect(response.body).not.toHaveProperty('deleted');
    });
  });

  describe('Bulk Update Operations - Message Architecture', () => {
    test('successful bulk update returns updated templates without messaging', async () => {
      const testData = createBulkTestData(2);
      const idsToUpdate = testData.templates.map(t => t.id);
      // `layoutType` is a real column; this test previously updated `isActive`,
      // which is not one, so its assertion only read back its own mock.
      const updateData = { layoutType: 'split-page' };

      // Mock successful bulk update using transaction
      const updatedTemplates = testData.templates.map(t => ({ ...t, ...updateData }));
      mockPrisma.$transaction.mockResolvedValue(updatedTemplates);

      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ ids: idsToUpdate, updates: updateData })
        .expect(200);

      // Verify response contains data without premature messaging
      expect(response.body).toHaveProperty('templates');
      expect(response.body.templates).toHaveLength(2);
      expect(response.body.templates[0].layoutType).toBe('split-page');
      
      // Verify no premature success messaging in response
      expect(response.body).not.toHaveProperty('message');
      expect(response.body).not.toHaveProperty('success');

      // Verify transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    test('bulk update with invalid data returns validation errors cleanly', async () => {
      const response = await request(app)
        .put('/api/shopping-lists/templates/bulk')
        .send({ 
          ids: [1, 2], 
          updates: { layoutType: 'invalid-layout' } 
        })
        .expect(400);

      // Verify clean validation error response
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('Invalid layout type');
      
      // Verify no success messaging in validation errors
      expect(response.body).not.toHaveProperty('updated');
      expect(response.body).not.toHaveProperty('success');
    });
  });

  describe('Individual Template Operations - Message Architecture', () => {
    test('template creation returns template data without messaging', async () => {
      const newTemplate = createMockTemplates(1)[0];
      const templateInput = {
        name: newTemplate.name,
        description: newTemplate.description,
        layoutType: newTemplate.layoutType,
        paperSize: 'letter'
      };

      mockPrisma.shoppingListTemplate.create.mockResolvedValue(newTemplate);

      const response = await request(app)
        .post('/api/shopping-lists/templates')
        .send(templateInput)
        .expect(201);

      // Verify response contains template data without messaging
      expect(response.body).toHaveProperty('template');
      expect(response.body.template.name).toBe(newTemplate.name);
      
      // Verify no premature success messaging
      expect(response.body).not.toHaveProperty('message');
      expect(response.body).not.toHaveProperty('success');
    });

    test('template update returns updated data without messaging', async () => {
      const existingTemplate = createMockTemplates(1)[0];
      const updateData = { name: 'Updated Template Name' };
      const updatedTemplate = { ...existingTemplate, ...updateData };

      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(existingTemplate);
      mockPrisma.shoppingListTemplate.update.mockResolvedValue(updatedTemplate);

      const response = await request(app)
        .put(`/api/shopping-lists/templates/${existingTemplate.id}`)
        .send(updateData)
        .expect(200);

      // Verify response contains updated data without messaging
      expect(response.body).toHaveProperty('template');
      expect(response.body.template.name).toBe('Updated Template Name');
      
      // Verify no premature success messaging
      expect(response.body).not.toHaveProperty('message');
      expect(response.body).not.toHaveProperty('updated');
    });

    test('template deletion returns clean response without messaging', async () => {
      const existingTemplate = createMockTemplates(1)[0];

      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(existingTemplate);
      mockPrisma.shoppingListTemplate.delete.mockResolvedValue(existingTemplate);

      const response = await request(app)
        .delete(`/api/shopping-lists/templates/${existingTemplate.id}`)
        .expect(204);

      // Verify clean 204 response without messaging
      expect(response.body).toEqual({});
      expect(response.text).toBe('');
      
      // Verify no success messaging in deletion response
      expect(response.headers).not.toHaveProperty('x-success-message');
    });
  });

  describe('Error Handling Architecture', () => {
    test('database errors return clean error responses without messaging artifacts', async () => {
      const dbError = new PrismaClientKnownRequestError(
        'Database connection failed',
        {
          code: 'P1001', // Connection error maps to 500
          clientVersion: '4.0.0'
        }
      );

      mockPrisma.shoppingListTemplate.findMany.mockRejectedValue(dbError);

      const response = await request(app)
        .get('/api/shopping-lists/templates')
        .expect(500);

      // Verify clean error response without messaging artifacts
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('database operation');
      
      // Verify no success messaging in error responses
      expect(response.body).not.toHaveProperty('success');
      expect(response.body).not.toHaveProperty('templates');
    });

    test('validation errors return structured responses without messaging pollution', async () => {
      const response = await request(app)
        .post('/api/shopping-lists/templates')
        .send({ name: 'AB' }) // Too short name
        .expect(400);

      // Verify structured validation error without messaging artifacts
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('between 3 and 50 characters');
      
      // Verify no success or completion messaging in validation errors
      expect(response.body).not.toHaveProperty('created');
      expect(response.body).not.toHaveProperty('success');
    });
  });

  describe('Response Structure Consistency', () => {
    test('all endpoints follow consistent response structure without messaging pollution', async () => {
      const template = createMockTemplates(1)[0];
      
      // Mock successful operations
      mockPrisma.shoppingListTemplate.findMany.mockResolvedValue([template]);
      mockPrisma.shoppingListTemplate.findUnique.mockResolvedValue(template);
      mockPrisma.shoppingListTemplate.create.mockResolvedValue(template);

      // Test GET endpoint response structure
      const getResponse = await request(app)
        .get('/api/shopping-lists/templates')
        .expect(200);
      
      expect(getResponse.body).toHaveProperty('templates');
      expect(getResponse.body).not.toHaveProperty('message');
      expect(getResponse.body).not.toHaveProperty('success');

      // Test GET single endpoint response structure
      const getSingleResponse = await request(app)
        .get(`/api/shopping-lists/templates/${template.id}`)
        .expect(200);
      
      expect(getSingleResponse.body).toHaveProperty('template');
      expect(getSingleResponse.body).not.toHaveProperty('message');
      expect(getSingleResponse.body).not.toHaveProperty('retrieved');

      // Test POST endpoint response structure
      const postResponse = await request(app)
        .post('/api/shopping-lists/templates')
        .send({
          name: 'New Template',
          layoutType: 'full-page'
        })
        .expect(201);
      
      expect(postResponse.body).toHaveProperty('template');
      expect(postResponse.body).not.toHaveProperty('message');
      expect(postResponse.body).not.toHaveProperty('created');
    });
  });
});
