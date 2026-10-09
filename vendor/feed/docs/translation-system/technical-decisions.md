### Environment and Model Management

1. **Centralized Configuration**
   - Dedicated environment bootstrap:
     ```typescript
     // src/bootstrap.ts
     import dotenv from 'dotenv';
     dotenv.config();
     ```
   - Single source of truth for model name:
     ```typescript
     // src/config/env.ts
     const MODEL_NAMES = ['gpt-4o-mini'] as const;
     type ModelName = typeof MODEL_NAMES[number];
     
     const validateModelName = (model: string | undefined): ModelName => {
       if (!model || !MODEL_NAMES.includes(model as ModelName)) {
         throw new Error(`Invalid model: ${model}`);
       }
       return model as ModelName;
     };
     ```
   - Type-safe token rates and limits:
     ```typescript
     // src/config/limits.ts
     export const TOKEN_RATES: TokenRates = {
       [MODEL_NAME]: {
         prompt: 0.00000015,
         completion: 0.0000006
       }
     };
     ```

2. **Retry Functionality**
   - Available for all translation states
   - Locks translation in pending state:
     ```typescript
     const translation = await prisma.translation.update({
       where: { id },
       data: { status: 'pending' }
     });
     ```
   - Handles concurrency with proper state management
   - Provides detailed error feedback

3. **Service Consolidation**
   - Single translation processing service
   - Prevents race conditions between services
   - Maintains consistent state across operations
   - Handles alerts and metrics in unified way

# Translation System Technical Documentation

## Overview
The translation system provides automatic translation capabilities for food pantry content using OpenAI's GPT-4o mini model. It supports translations for custom text, category names, and food item descriptions.

## Architecture

## Processing Architecture

### Translation Auditor
- Located in `/packages/backend/src/services/translation-auditor.ts`
- Manages translation integrity and efficiency:
  - Detects missing translations
  - Identifies and cleans up duplicates
  - Handles language enabling/disabling
  - Maintains data consistency

### Translation Trigger Service
- Located in `/packages/backend/src/services/translation-trigger.ts`
- Implements asynchronous processing for Food Items and Categories:
  - Queues content and processes across enabled languages
  - Groups queued items by content type + language and batches requests per chunk size
  - Prevents redundant translation by upserting and skipping completed entries
  - Applies alert checks and uses `AIServiceFactory` batch providers
  - Runs batches sequentially to respect RPM/TPM limits

### Language Integration
- Efficient handling of language changes:
  - Clean removal of disabled language translations
  - Selective creation of new language translations
  - Prevention of English-to-English translations
  - Maintenance of unique constraints
  - Case-insensitive language code matching
  - Normalized language code handling
  - Robust filtering with proper string normalization

### Data Integrity
- Unique constraint on (originalText, language, type)
- Transaction-based operations
- Cleanup of stale translations
- Prevention of duplicate entries

### Database Schema
```prisma
model Translation {
  id            Int      @id @default(autoincrement())
  originalText  String
  translatedText String?
  status        String   @default("pending") // pending, completed, failed
  language      String
  type          String   // Category, Food Item, Custom
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### Components
1. AI Provider Services:
   - Located under `/packages/backend/src/services/ai/providers/`
   - Handle communication with external providers
   - Manage retries and record metrics via `UsageRecord`
   - Unified access via `AIServiceFactory`

2. Translation Routes:
   - Located in `/packages/backend/src/routes/translations.ts`
   - Manages CRUD operations and bulk actions
   - Provides retry functionality for all states
   - Exposes `/find-missing` to scan and dispatch per-type processing
   - Exposes `/capabilities` to report allowed translation actions by type

3. Frontend Components:
   - Translation table with status badges
   - Edit dialog with translation history
   - Retry functionality for failed translations
   - Integration with Language Management

## Translation Workflow

1. **Entry Creation**
   - User creates/updates content in any supported section
   - System checks enabled languages in Language Management
   - Creates pending translation entries for each target language

2. **Translation Processing**
   - Backend sends text to OpenAI with JSON structure requirements
   - Updates translation status based on API response
   - Handles errors with appropriate status updates

3. **Status Tracking**
   - Pending: Initial state when translation is queued
   - Completed: Successfully translated
   - Failed: Translation attempt unsuccessful

## Token Estimation and Cost Tracking

1. **Token Service**
   - Located in `/packages/backend/src/services/token/`
   - Provides accurate token counting and cost estimation
   - Handles input and output token calculations separately
   - Uses tiktoken for precise token counting
   - Accurate GPT-4o mini pricing:
     - Input: $0.15 per 1M tokens
     - Output: $0.60 per 1M tokens

2. **Cost Management**
   - Tracks input and output tokens separately
   - Calculates costs with correct token rates
   - Maintains high precision for microcosts
   - Stores metrics for monitoring and analysis

## OpenAI Integration

## Translation Action Policy (2025-09-01)

Rationale: With the introduction of a distinct “Generated” type for document translations and upcoming Shopping List Generator work, translation actions must be type-aware and consistent.

- Backend source of truth: `packages/backend/src/services/translation-action-policy.ts` defines capabilities per `Translation.type`.
- Allowed actions by type:
  - Custom: Include/Remove English
  - Generated: Include/Remove English
  - FoodItem: none
  - Category: none
- Skip/Enable Translation actions are deprecated for all types. Endpoints are commented out for historical reference in `packages/backend/src/routes/translations.ts`.
- Enforcement: Bulk include/remove endpoints filter and process only allowed items and return clear errors for disallowed types.
- Frontend gating: `TranslationList` loads capabilities via `GET /api/translations/capabilities` and hides ineligible actions. Row actions and bulk actions respect these capabilities.

### Model Configuration
```typescript
{
  model: 'gpt-4o-mini',
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "translation_response",
      schema: {
        type: "object",
        properties: {
          translatedText: {
            type: "string",
            description: "The translated text in the target language"
          }
        },
        required: ["translatedText"],
        additionalProperties: false
      },
      strict: true
    }
  },
  messages: [
    {
      role: "system",
      content: [
        `You are a translation service for a nonprofit food pantry.`,
        `Translate the given text to ${targetLanguage}.`,
        `The translation must maintain the exact meaning and context of food items and categories.`,
        `Return only a JSON object with a single field "translatedText" containing the translation.`
      ].join(' ')
    },
    {
      role: "user",
      content: originalText
    }
  ]
}
```

### Optimization
- Early return for English translations:
  ```typescript
  if (targetLanguage.toLowerCase() === 'en' || 
      targetLanguage.toLowerCase() === 'eng' || 
      targetLanguage.toLowerCase() === 'english') {
    return {
      translatedText: originalText,
      metrics: { duration: 0, promptTokens: 0, completionTokens: 0, totalCost: 0 }
    };
  }
  ```


### Response Format
```json
{
  "translatedText": "Translated content in target language"
}
```

## Error Handling

1. **API Errors**
   - Rate limiting: Exponential backoff retry
   - Invalid responses: Mark translation as failed
   - Network issues: Retry with backoff

2. **Data Validation**
   - Input length constraints
   - Language code validation with normalization
   - Case-insensitive language code matching
   - Response format verification
   - Robust filtering with null/undefined handling

## State Management

1. **Frontend**
   - Real-time status updates
   - Optimistic UI updates
   - Error state handling
   - Retry mechanism

2. **Backend**
   - Transaction-based updates
   - Status tracking
   - Error logging
   - Rate limit management

## Performance Considerations

1. **API Usage**
   - Batch translations when possible
   - Rate limit monitoring
   - Response caching for common texts

2. **Database**
   - Indexed queries for status and type
   - Efficient bulk operations
   - Regular cleanup of failed entries

## Security

1. **API Key Management**
   - Environment-based configuration
   - Secure key storage
   - No client-side exposure

2. **Input Validation**
   - Length limits
   - Content sanitization
   - Language code verification

## Testing Strategy

1. **Unit Tests**
   - Translation service mocking
   - Status transitions
   - Error handling

2. **Integration Tests**
   - API communication
   - Database operations
   - Status updates

3. **End-to-End Tests**
   - Complete translation workflow
   - Error recovery
   - User interactions

## Monitoring and Logging

1. **API Usage**
   - Request tracking
   - Error rate monitoring
   - Response time tracking

2. **Translation Status**
   - Success/failure rates
   - Language-specific metrics
   - Response time tracking

## Future Improvements

1. **Performance**
   - Implement caching layer
   - Optimize batch processing
   - Add webhooks for status updates

2. **Features**
   - Translation memory/history
   - Alternative translation providers
   - Custom glossary support

3. **Monitoring**
   - Dashboard for translation metrics
   - Alert system for high failure rates
   - Performance tracking tools

   ### Content Type Integration

#### Food Items
- Full integration with all CRUD operations:
  ```typescript
  // Create
  - Creates translations for new food items
  - Handles multi-language support
  - Uses transaction-based creation

  // Update
  - Detects name changes
  - Cleans up old translations
  - Creates new translations
  - Maintains data consistency

  // Delete
  - Cleans up translations on deletion
  - Handles both single and bulk deletes
  - Uses transaction-based cleanup
  ```

#### Categories
- Similar integration pattern as Food Items
- Shared translation management strategy
- Consistent transaction handling

#### Custom Content
- Direct user input through Translation UI
- Immediate translation processing
- Full edit capabilities
