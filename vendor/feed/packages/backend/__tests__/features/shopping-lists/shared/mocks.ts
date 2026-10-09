import { vi } from 'vitest';
import { ShoppingListTemplate, ShoppingListSection } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Mock data factories for shopping list tests
 */

export const createMockTemplate = (overrides: Partial<ShoppingListTemplate> = {}): ShoppingListTemplate => ({
  id: 1,
  name: 'Test Template',
  description: 'Test template description',
  language: 'en',
  layoutType: 'full-page',
  paperSize: 'letter',
  // No `isActive` here: `ShoppingListTemplate` has never had that column. It
  // is absent from the schema and from every migration, and neither
  // shopping-list route reads or writes it. Tests that set it on this mock and
  // asserted it back were asserting their own input.
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
});

export const createMockSection = (overrides: Partial<ShoppingListSection> = {}): ShoppingListSection => ({
  id: 1,
  templateId: 1,
  sectionType: 'custom-text',
  categoryId: null,
  displayOrder: 0,
  isEnabled: true,
  title: 'Test Section',
  subtitle: null,
  configuration: {},
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides
});

export const createMockTemplates = (count: number): ShoppingListTemplate[] => {
  return Array.from({ length: count }, (_, index) => 
    createMockTemplate({
      id: index + 1,
      name: `Template ${index + 1}`,
      description: `Description for template ${index + 1}`
    })
  );
};

export const createMockSections = (templateId: number, count: number): ShoppingListSection[] => {
  return Array.from({ length: count }, (_, index) =>
    createMockSection({
      id: index + 1,
      templateId,
      title: `Section ${index + 1}`,
      displayOrder: index,
      sectionType: index % 3 === 0 ? 'custom-text' : index % 3 === 1 ? 'form' : 'category'
    })
  );
};

/**
 * Mock Prisma client for testing
 */
export const createMockPrisma = () => ({
  shoppingListTemplate: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    updateMany: vi.fn()
  },
  shoppingListSection: {
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn()
  },
  shoppingListInstance: {
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn()
  },
  $transaction: vi.fn()
});

/**
 * Mock request and response objects
 */
export const createMockRequest = (body: any = {}, params: any = {}) => ({
  body,
  params,
  query: {},
  headers: {}
});

export const createMockResponse = () => {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis()
  };
  return res;
};

export const createMockNext = () => vi.fn();

/**
 * Error classes for testing
 */
export class MockPrismaError extends PrismaClientKnownRequestError {
  constructor(message: string, code: string = 'P2002') {
    super(message, {
      code,
      clientVersion: '5.0.0',
      meta: {},
      batchRequestIdx: undefined
    });
    this.name = 'PrismaClientKnownRequestError';
  }
}

/**
 * Bulk operation test data
 */
export const createBulkTestData = (count?: number) => {
  const templateCount = count || 4;
  const halfCount = Math.floor(templateCount / 2);
  
  // "Active" and "inactive" are vestigial names. Templates have no such state
  // -- the column never existed -- so these are simply two disjoint groups,
  // which is all their callers use them for: two sets of ids to update in
  // bulk. The names are kept because tests refer to them.
  const activeTemplates = Array.from({ length: halfCount }, (_, index) =>
    createMockTemplate({ id: index + 1, name: `Active Template ${index + 1}` })
  );

  const inactiveTemplates = Array.from({ length: templateCount - halfCount }, (_, index) =>
    createMockTemplate({
      id: halfCount + index + 1,
      name: `Inactive Template ${index + 1}`
    })
  );
  
  const templates = [...activeTemplates, ...inactiveTemplates];
  
  return {
    templates,
    activeTemplates,
    inactiveTemplates,
    mixedTemplates: templates, // Alias for backwards compatibility
    activeIds: activeTemplates.map(t => t.id),
    inactiveIds: inactiveTemplates.map(t => t.id),
    mixedIds: templates.map(t => t.id)
  };
};
