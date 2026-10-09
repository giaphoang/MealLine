import { expect } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { createMockPrisma, createMockRequest, createMockResponse, createMockNext } from './mocks';

/**
 * Test setup utilities for shopping list tests
 */

export interface TestContext {
  mockPrisma: ReturnType<typeof createMockPrisma>;
  mockRequest: Request;
  mockResponse: Response;
  mockNext: NextFunction;
}

/**
 * Creates a complete test context with mocked dependencies
 */
export const createTestContext = (requestBody: any = {}, requestParams: any = {}): TestContext => {
  return {
    mockPrisma: createMockPrisma(),
    mockRequest: createMockRequest(requestBody, requestParams) as Request,
    mockResponse: createMockResponse() as Response,
    mockNext: createMockNext() as NextFunction
  };
};

/**
 * Assertions for bulk operation responses
 */
export const expectBulkDeleteSuccess = (mockResponse: Response, deletedCount: number) => {
  expect(mockResponse.status).toHaveBeenCalledWith(204);
  expect(mockResponse.end).toHaveBeenCalled();
};

export const expectBulkUpdateSuccess = (mockResponse: Response, updatedTemplates: any[]) => {
  expect(mockResponse.status).not.toHaveBeenCalledWith(expect.any(Number));
  expect(mockResponse.json).toHaveBeenCalledWith({
    templates: updatedTemplates
  });
};

export const expectValidationError = (mockResponse: Response, errorMessage: string) => {
  expect(mockResponse.status).toHaveBeenCalledWith(400);
  expect(mockResponse.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({
        message: errorMessage
      })
    })
  );
};

export const expectNotFoundError = (mockResponse: Response) => {
  expect(mockResponse.status).toHaveBeenCalledWith(404);
  expect(mockResponse.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({
        message: expect.stringContaining('not found')
      })
    })
  );
};

export const expectConflictError = (mockResponse: Response) => {
  expect(mockResponse.status).toHaveBeenCalledWith(409);
  expect(mockResponse.json).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({
        message: expect.any(String)
      })
    })
  );
};

/**
 * Database operation expectations
 */
export const expectTemplateQuery = (mockPrisma: any, method: string, times: number = 1) => {
  expect(mockPrisma.shoppingListTemplate[method]).toHaveBeenCalledTimes(times);
};

export const expectSectionQuery = (mockPrisma: any, method: string, times: number = 1) => {
  expect(mockPrisma.shoppingListSection[method]).toHaveBeenCalledTimes(times);
};

/**
 * Bulk operation test helpers
 */
export const setupBulkDeleteTest = (mockPrisma: any, existingTemplates: any[]) => {
  // Mock finding existing templates
  mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(existingTemplates);
  // Mock successful deletion
  mockPrisma.shoppingListTemplate.deleteMany.mockResolvedValue({ count: existingTemplates.length });
};

export const setupBulkUpdateTest = (mockPrisma: any, existingTemplates: any[], updatedTemplates: any[]) => {
  // Mock finding existing templates
  mockPrisma.shoppingListTemplate.findMany.mockResolvedValue(existingTemplates);
  // Mock the transaction
  mockPrisma.$transaction.mockResolvedValue(updatedTemplates);
};

/**
 * Error simulation helpers
 */
export const simulatePrismaError = (mockPrisma: any, method: string, error: Error) => {
  mockPrisma.shoppingListTemplate[method].mockRejectedValue(error);
};

export const simulateNetworkError = (mockPrisma: any, method: string) => {
  const error = new Error('Network error');
  error.name = 'NetworkError';
  mockPrisma.shoppingListTemplate[method].mockRejectedValue(error);
};

/**
 * Validation test helpers
 */
export const createInvalidIdsRequest = () => createMockRequest({ ids: ['invalid', 'ids'] });
export const createEmptyIdsRequest = () => createMockRequest({ ids: [] });
export const createMissingIdsRequest = () => createMockRequest({});

export const createInvalidUpdateRequest = () => createMockRequest({
  ids: [1, 2],
  updates: { name: 'ab' } // Too short
});

export const createValidBulkDeleteRequest = (ids: number[]) => createMockRequest({ ids });
export const createValidBulkUpdateRequest = (ids: number[], updates: any) => createMockRequest({ ids, updates });

/**
 * Response verification helpers
 */
export const getLastJsonCall = (mockResponse: Response) => {
  const calls = (mockResponse.json as any).mock.calls;
  return calls[calls.length - 1][0];
};

export const getLastStatusCall = (mockResponse: Response) => {
  const calls = (mockResponse.status as any).mock.calls;
  return calls[calls.length - 1][0];
};
