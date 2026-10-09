# Document Translator Testing Suite

## Overview

Comprehensive testing suite for Document Translator functionality, created as part of Phase 1 of the Incremental Modernization approach. These tests target critical bugs and validate architectural improvements.

## Test Files

### 1. `useDocuments.test.ts`
**Focus**: Date formatting and data processing logic
- **Critical Bug Coverage**: Date timezone handling fix validation
- **Test Categories**:
  - Original document date formatting using `toLocaleDateString()`
  - Translation document date formatting
  - Edge case timezone dates (midnight boundary tests)
  - Date consistency between document types
  - Error handling and API integration
  - Translation count calculations

### 2. `DocumentList.test.tsx`
**Focus**: Component behavior and bulk operations
- **Critical Bug Coverage**: Bulk download parameter passing fix validation
- **Test Categories**:
  - Single row translation download bug fix verification
  - Bulk download operations with progress tracking
  - Large selection warnings (>10 files)
  - Error handling during cached translation count fetching
  - Document status indicators (integrity issues)
  - Date display validation in table

### 3. `integration.test.tsx`
**Focus**: Full workflow and component coordination
- **Test Categories**:
  - Complete upload-translate-download workflows
  - Error boundary functionality
  - Date consistency across component tree
  - Bulk operations coordination
  - Translation progress integration
  - Component error handling

## Running Tests

### Individual Test Files
```bash
# Frontend directory
cd packages/frontend

# Run specific test file
npm run test src/test/document-translator/useDocuments.test.ts
npm run test src/test/document-translator/DocumentList.test.tsx
npm run test src/test/document-translator/integration.test.tsx

# Run all document translator tests
npm run test src/test/document-translator/
```

### All Tests
```bash
# Run entire frontend test suite
npm run test

# Run with coverage
npm run test -- --coverage
```

## Phase 1 Bug Coverage

### ✅ Bulk Download Bug
- **Issue**: `onDownloadAllTranslations` received document ID instead of full Document object
- **Tests**: DocumentList.test.tsx validates proper object passing
- **Verification**: Confirms fix prevents "Invalid document ID" errors

### ✅ Date Timezone Bug  
- **Issue**: `split('T')[0]` caused date lag in different timezones
- **Tests**: useDocuments.test.ts validates `toLocaleDateString()` usage
- **Verification**: Confirms dates display correctly in user's timezone

## Test Architecture

### Mocking Strategy
- **Service Layer**: DocumentService and ErrorHandlerService mocked
- **Hooks**: Custom hooks mocked to isolate component behavior
- **Dependencies**: UI libraries and utilities mocked for performance

### Validation Approach
- **Behavioral Testing**: Focus on user-visible outcomes
- **Integration Points**: Test component coordination and data flow
- **Error Scenarios**: Validate graceful failure handling
- **Edge Cases**: Timezone boundaries, large datasets, network failures

## Expected Test Results

### Phase 1 Fixes Validation
```bash
✓ Date formatting uses toLocaleDateString for both original and translated documents
✓ Bulk download passes full Document objects, not IDs
✓ Error handling integrates with ErrorHandlerService
✓ Component integration maintains data consistency
```

### Performance Metrics
- **Test Execution**: ~2-3 seconds for full suite
- **Coverage Targets**: >90% for critical paths
- **Mock Isolation**: No external API calls during testing

## Future Test Enhancements (Phase 2)

### Error Message Testing
- ASK compliance validation (Actionable, Specific, Kind)
- Error message consistency across components
- User-friendly error recovery flows

### Advanced Integration Testing
- Multi-language translation workflows
- Document integrity checking
- Storage reconciliation processes

## Troubleshooting

### Common Issues
- **Import Errors**: Ensure all dependencies are mocked
- **Async Timeouts**: Use `waitFor` for async operations
- **Mock Cleanup**: Clear mocks between tests to prevent state leakage

### Debug Commands
```bash
# Run tests with verbose output
npm run test -- --verbose

# Run tests in watch mode during development
npm run test -- --watch

# Run tests with debug information
npm run test -- --debug
```

## Integration with CI/CD

These tests are designed to:
- Run in automated testing pipelines
- Catch regressions in critical functionality
- Validate Phase 1 fixes remain functional
- Support continuous integration workflows

## Documentation Updates

All test implementations are documented in:
- Individual test file comments
- JSDoc annotations for complex test logic
- Integration with existing project documentation standards
