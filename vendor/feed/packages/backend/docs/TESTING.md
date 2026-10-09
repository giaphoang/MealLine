# Backend Testing Documentation

## Important Notice (January 27, 2025)
All tests have been archived to reduce technical debt. The complete test suite can be found in:
- `/archived_tests/packages/backend/` (preserved structure)
- `test-archive` branch (original locations)

Refer to `/archived_tests/README.md` for restoration instructions.

The following documentation is preserved for historical reference.


## Test Organization

### Directory Structure
```
__tests__/
  features/           # Feature-specific tests
    global-limit/     # Global limit setting tests
      shared/        # Shared test utilities
        mocks.ts    # Mock data factories
        setup.ts    # Test setup and utilities
      validation.test.ts  # Input validation
      rate-limit.test.ts  # Rate limiting
      transaction.test.ts # Data consistency
    categories/       # Category management tests
    food-items/       # Food item management tests
  shared/            # Shared test utilities and setup
    infrastructure/  # Server and middleware tests
    mocks/          # Shared mock objects and data

### Current Test Coverage

#### Categories
1. GET /api/categories
   - ✓ Returns populated categories list
   - ✓ Handles empty categories list
   - ✓ Verifies response format

2. GET /api/categories/:id
1. GET /api/categories/:id
   - ✓ Returns category details for valid ID
   - ✓ Returns 404 for non-existent ID
   - ✓ Validates ID format (non-numeric)
   - ✓ Validates ID range (negative)
   - ✓ Verifies case-insensitive name handling

2. POST /api/categories
   - ✓ Validates name length constraints
   - ✓ Validates limit range
   - ✓ Checks for duplicate names
   - ✓ Creates category with valid data

### Test Types

1. **Infrastructure Tests**
- Server configuration with proper error handling
- Rate limiting with request counting
- Response format standardization
- Error handler middleware
- CORS and content-type validation

2. **Feature Tests**
- Route handlers
- Data validation
- Error scenarios
- Integration with database
- Response format validation

3. **Database Tests**
- Schema validation
- Migration testing
- Transaction handling
- Data integrity

## Test Guidelines

### General Principles
- Each test file focuses on one feature or component
- Use descriptive test names that explain the behavior being tested
- Follow AAA pattern (Arrange, Act, Assert)
- Avoid test interdependencies
- Archive obsolete tests instead of deleting

### Mocking
- Use the extended Prisma mock system for reliable tests
- Ensure proper error class inheritance for accurate error handling
- Use proper prototype chain for error validation
- Create type-safe mock error instances
- Follow the single test pattern for maximum clarity
- Leverage shared mock data factories
- Test one endpoint functionality at a time
- Verify endpoint behavior in isolation

- Use mock data factories for consistent test data
- Mock external services and database in unit tests
- Use in-memory database for integration tests
- Keep mock data up to date with schema

### Error Handling
- Test standardized error response format:
  ```typescript
  {
    error: {
      message: string;
      timestamp: string;
      code?: string;
      details?: unknown;
    }
  }
  ```
- Verify appropriate HTTP status codes
- Test rate limiting with correct window size
- Validate localized error messages
- Test transaction rollbacks

### Async Testing
- Use proper async/await patterns
- Test timeouts and race conditions
- Verify transaction rollbacks
- Handle promise rejections

### Response Format
- Validate response structure
- Check content types
- Verify status codes
- Validate error formats
