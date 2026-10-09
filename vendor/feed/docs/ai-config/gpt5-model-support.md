# GPT-5 Model Support

> **Historical, 2026-09-11.** OpenAI deprecated the `gpt-5-2025-08-07`,
> `gpt-5-mini-2025-08-07`, and `gpt-5-nano-2025-08-07` snapshots on 2026-06-11
> and shuts them down on **2026-12-11**. Replacements are `gpt-5.6-sol`,
> `gpt-5.6-terra`, and `gpt-5.6-luna`. GPT-5.6 reasoning effort accepts `none`,
> `low`, `medium`, `high`, `xhigh`, `max` — not `minimal`, FEED's default for
> `gpt-5-nano`. See
> [`model-catalogue-refresh-2026-09.md`](model-catalogue-refresh-2026-09.md).

## Overview
Added support for OpenAI's GPT-5 reasoning models, which require different API parameters than GPT-4 models.

## Model Specifications

### GPT-5 Models Available
- **gpt-5-nano**: Lightweight reasoning model ($0.05/$0.40 per 1M tokens)
- **gpt-5-mini**: Mid-tier reasoning model ($0.25/$2.00 per 1M tokens)  
- **gpt-5**: Full reasoning model ($1.25/$10.00 per 1M tokens)

### Key Differences from GPT-4
1. **API Parameter**: Uses `max_completion_tokens` instead of `max_tokens`
2. **Reasoning Effort**: Supports `reasoning_effort` parameter (minimal/low/medium/high)
3. **Temperature Constraint**: GPT-5 models only support temperature=1.0 (default)
   - Any other temperature value will cause API error
   - **Automatic Override**: System automatically overrides temperature to 1.0 for GPT-5 models
   - Users are notified via warnings when temperature is overridden
4. **Top-p Constraint**: GPT-5 models don't support the `top_p` parameter
   - **Automatic Exclusion**: System automatically excludes top_p from API calls for GPT-5 models
   - Users are notified via warnings when top_p is excluded
5. **Model Family**: Designated as `gpt-5` for special handling

## Implementation

### Model Specification Structure
```typescript
interface ModelSpec {
  // ... existing fields ...
  apiParameters?: {
    maxTokensField?: 'max_tokens' | 'max_completion_tokens'
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
    modelFamily?: 'gpt-4' | 'gpt-5' | 'o-series' | 'legacy'
  }
}
```

### Parameter Mapping
The system uses the `apiParameters` field to determine correct API parameters:
- GPT-4 models: `maxTokensField: 'max_tokens'`
- GPT-5 models: `maxTokensField: 'max_completion_tokens'`
- O-series models: `maxTokensField: 'max_tokens'`

### Default Output Token Limits
- GPT-5 models: 128,000 tokens
- GPT-4.1 models: 32,768 tokens
- GPT-4o models: 16,384 tokens
- O-series models: 65,536 tokens

## Parameter Override Features

### Automatic Temperature Handling
The system now automatically detects GPT-5 models and overrides temperature to 1.0 when needed:

1. **Detection**: System checks if selected model is in the GPT-5 family
2. **Override**: If temperature ≠ 1.0, system automatically uses 1.0
3. **Notification**: Warning message added to API response
4. **User Feedback**: Frontend can display warnings to inform users

### Automatic Top-p Exclusion
The system automatically excludes the top_p parameter for GPT-5 models:

1. **Detection**: System checks if selected model is in the GPT-5 family
2. **Exclusion**: top_p parameter is completely excluded from API calls
3. **Notification**: Warning message added to API response
4. **User Feedback**: Frontend can display warnings to inform users

### Warning Message Formats
```
GPT-5 models only support temperature=1.0. Your configured temperature of [X] has been overridden to 1.0.
```
```
GPT-5 models don't support the top_p parameter. It has been excluded from the API call.
```

### Implementation Details
- Parameter adjustments occur in `OpenAITranslationService.checkAndOverrideParameters()` method
- Warnings are included in translation/classification results
- Applies to all operations: single translation, batch translation, classification
- No user action required - system handles automatically

## Usage
When users select a GPT-5 model in the AI Configuration interface:
1. Model specifications auto-populate with correct pricing and limits
2. API parameter mapping ensures proper OpenAI API calls
3. Reasoning effort defaults are applied automatically

### Thinking Level Integration (Implemented)

The existing `thinkingLevel` field (introduced for Gemini 3) now drives GPT-5 `reasoning_effort` values:

- `minimal` → `minimal`
- `low` → `low`
- `medium` → `medium`
- `high` → `high`

Scope: GPT-5 family only. GPT-4o-mini and GPT-4.1 do not use `reasoning_effort`.
Fallback: if `thinkingLevel` is unset, use the model spec default `reasoningEffort` (or OpenAI default `low`).

### Important Configuration Notes
- **Temperature**: Can be set to any value in configuration
  - GPT-5 models will automatically use 1.0 regardless of configuration
  - Other models will use configured temperature normally
  - Users are notified when override occurs
- **Top-p**: Can be set to any value in configuration
  - GPT-5 models will automatically exclude this parameter
  - Other models will use configured top_p normally
  - Users are notified when parameter is excluded
- **Max Tokens**: Will use max_completion_tokens automatically

## Migration
Existing configurations continue to work. New GPT-5 configurations automatically use correct parameters.

## Related Files
- `/packages/frontend/src/components/ai-configuration/model-specs.ts` - Model specifications
- `/packages/backend/src/services/ai/model-specs.ts` - Backend model specifications
- `/packages/backend/src/services/ai/providers/OpenAITranslationService.ts` - API implementation with dynamic parameters

## Error Resolution
This implementation resolves the following errors:

### max_tokens Parameter Error
```
Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```
The system now automatically uses the correct parameter based on the model selected.

### reasoning Parameter Error
```
Unknown parameter: 'reasoning'.
```
Fixed by using the correct flat parameter format `reasoning_effort` instead of nested `reasoning.effort`.

### minimal Reasoning Level Issue
```
The provided reasoning effort 'minimal' is not supported.
```
Resolved: GPT-5 supports `minimal`; the system now passes the configured value directly.

### Temperature Parameter Error
```
Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported.
```
**Automatic Resolution**: System now automatically overrides temperature to 1.0 for GPT-5 models
- No manual configuration changes needed
- Warning message informs users when override occurs
- Prevents API errors while maintaining configuration flexibility

### Top-p Parameter Error
```
Unsupported parameter: 'top_p' is not supported with this model.
```
**Automatic Resolution**: System now automatically excludes top_p parameter for GPT-5 models
- No manual configuration changes needed
- Warning message informs users when parameter is excluded
- Prevents API errors while maintaining configuration flexibility

## User Notification System

### Implementation Details
The system provides real-time user notifications when GPT-5 parameters are automatically adjusted:

#### Backend Integration
1. **Warning Collection**: Translation service captures warnings from AI service responses
2. **Progress Tracking**: Warnings stored in `TranslationProgress` object with deduplication
3. **API Response**: `/api/documents/:id/translate/progress` endpoint includes warnings array

#### Frontend Display
1. **Polling Detection**: Translation progress polling checks for warnings in each response
2. **Toast Notifications**: Warnings displayed using the centralized toast system with 'warning' variant
3. **Deduplication**: Each warning shown only once per translation session
4. **ASK Compliance**: Messages follow Actionable, Specific, Kind principles

#### Warning Message Format
Users see contextualized warnings with actionable guidance:
```
[Parameter override message]. To use custom parameter values, select a different AI model in Tools → AI Configuration.
```

Example messages:
- "GPT-5 models only support temperature=1.0. Your configured temperature of 0.3 has been overridden to 1.0. To use custom parameter values, select a different AI model in Tools → AI Configuration."
- "GPT-5 models don't support the top_p parameter. It has been excluded from the API call. To use custom parameter values, select a different AI model in Tools → AI Configuration."

#### User Experience Benefits
- **Non-intrusive**: Warnings appear as toast notifications during translation
- **Contextual**: Only shown when relevant (during active GPT-5 translations)
- **Actionable**: Clear path to resolution provided
- **Transparent**: Users understand why their settings were adjusted
- **One-time Display**: Prevents notification fatigue with deduplication
