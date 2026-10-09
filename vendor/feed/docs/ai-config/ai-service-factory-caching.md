# AI Configuration Caching

## Overview

The AI configuration system implements two caching layers to improve performance while ensuring configuration changes take effect immediately:

1. **AIServiceFactory Cache**: Caches AI service instances with their AIConfiguration settings
2. **PromptBuilder Cache**: Caches SystemPrompt records and prompt configurations

## AIServiceFactory Caching

### Cache Key Structure
Each service instance is cached using a composite key: `{serviceType}_{configId}`
- Example: `OpenAI_42` for an OpenAI service with configuration ID 42

### Cache Invalidation

The factory implements timestamp-based cache invalidation:

1. **Cache Hit with Valid Config**: If a cached instance exists and its configuration's `updatedAt` timestamp matches the database configuration, the cached instance is returned.

2. **Cache Hit with Stale Config**: If a cached instance exists but its configuration's `updatedAt` timestamp differs from the database configuration, the stale instance is removed from cache and a new instance is created.

3. **Cache Miss**: If no cached instance exists, a new instance is created and cached.

## Implementation Details

### Configuration Change Detection

The factory compares the `updatedAt` timestamp of the cached configuration with the fresh configuration from the database:

```typescript
if (cachedService['config']?.updatedAt?.getTime() === config.updatedAt.getTime()) {
  return cachedService; // Configuration unchanged, use cached instance
} else {
  // Configuration updated, invalidate cache
  this.serviceInstances.delete(cacheKey);
  // Continue to create new instance
}
```

### Benefits

1. **Performance**: Avoids database queries and service initialization for unchanged configurations
2. **Immediate Updates**: Configuration changes (temperature, model, etc.) take effect immediately without server restart
3. **Memory Efficiency**: Only active service configurations are cached
4. **Multi-Service Support**: Each service type and configuration ID has its own cache entry

## Configuration Update Flow

1. User updates AI configuration (e.g., changes temperature from 0.3 to 1.0)
2. Database record is updated with new `updatedAt` timestamp
3. Next translation request fetches fresh configuration from database
4. Factory detects timestamp mismatch with cached instance
5. Cached instance is removed and new instance created with updated configuration
6. All subsequent operations use the new configuration

## Troubleshooting

### Configuration Not Taking Effect

If configuration changes aren't being applied:
1. Check that the database update succeeded
2. Verify the `updatedAt` timestamp changed
3. Look for console log: "Configuration updated for [serviceType], invalidating cached service instance"
4. Use `AIServiceFactory.clearCache()` to manually clear all cached instances

### Manual Cache Management

```typescript
// Clear all cached service instances
AIServiceFactory.clearCache();

// This forces recreation of all service instances on next use
```

## PromptBuilder Caching

### Cache Strategy

The PromptBuilder implements a 5-minute TTL cache for:
- SystemPrompt records fetched from the database
- Compiled prompt configurations with resolved parameters

### Cache Key Structure
- SystemPrompt cache: `{promptType}:active`
- Configuration cache: `{configId}:{promptType}:{context}`

### Cache Invalidation

The PromptBuilder cache is cleared when:
- SystemPrompt records are created, updated, or deleted
- Manual cache clear is triggered via `PromptBuilder.clearCache()`

This ensures that:
- Temperature, topP, and other parameters from SystemPrompt take effect immediately
- Custom prompt templates are applied without delay
- No server restart is required for configuration changes

### Parameter Resolution

When building prompts, parameters are resolved hierarchically:
1. **SystemPrompt parameters** (highest priority) - temperature, topP from SystemPrompt
2. **AIConfiguration defaults** (fallback) - used when SystemPrompt doesn't specify
3. **System defaults** (last resort) - temperature: 0.7, topP: 1.0

## Implementation Flow

### Configuration Update Process

1. User updates configuration (AIConfiguration or SystemPrompt)
2. Database record is updated with new timestamp
3. Relevant cache is cleared:
   - AIConfiguration changes → AIServiceFactory cache invalidated
   - SystemPrompt changes → PromptBuilder cache cleared
4. Next API call fetches fresh configuration
5. New service instance or prompt configuration is created
6. All subsequent operations use updated settings

## Troubleshooting

### Configuration Changes Not Taking Effect

If configuration changes aren't being applied:

1. **Check both caching layers**:
   - AIServiceFactory cache for API key and model changes
   - PromptBuilder cache for prompt template and parameter changes

2. **Verify database updates**:
   - Check `updatedAt` timestamp changed for AIConfiguration
   - Verify SystemPrompt record was updated

3. **Look for cache invalidation logs**:
   - "Configuration updated for [serviceType], invalidating cached service instance"
   - Log entries after SystemPrompt CRUD operations

4. **Manual cache clearing**:
   ```typescript
   // Clear all AI service instances
   AIServiceFactory.clearCache();
   
   // Clear all prompt configurations
   PromptBuilder.clearCache();
   ```

## Related Files

- `/packages/backend/src/services/ai/factory/AIServiceFactory.ts` - Service factory with caching
- `/packages/backend/src/services/ai/prompts/PromptBuilder.ts` - Prompt builder with caching
- `/packages/backend/src/routes/ai-config.ts` - AIConfiguration API endpoints
- `/packages/backend/src/routes/system-prompts.ts` - SystemPrompt API endpoints with cache clearing
