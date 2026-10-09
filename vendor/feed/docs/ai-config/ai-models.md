# AI Model Configuration Presets

> **Out of date as of 2026-09-11 — read
> [`model-catalogue-refresh-2026-09.md`](model-catalogue-refresh-2026-09.md)
> first.** This page still describes what `model-specs.ts` contains, but most
> of those presets are no longer usable:
>
> | Preset | Status | Replace with |
> |---|---|---|
> | `gemini-2.5-flash-lite` (default), `gemini-2.5-flash`, `gemini-2.5-pro` | Refused to new Google projects (404) | `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.1-pro-preview` |
> | `gemini-3-pro-preview` | Shut down 2026-03-09 | `gemini-3.1-pro-preview` |
> | `gemini-3-flash-preview` | Deprecated | `gemini-3.6-flash` |
> | `gpt-4.1-nano-2025-04-14`, `gpt-4o-2024-05-13` | Shutdown 2026-10-23 | `gpt-5.6-luna`, `gpt-5.6-sol` |
> | `gpt-5-nano`, `gpt-5-mini`, `gpt-5` (2025-08-07) | Shutdown 2026-12-11 | `gpt-5.6-luna`, `gpt-5.6-terra`, `gpt-5.6-sol` |
> | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4o-mini` | Not in OpenAI's current list | Retire from presets |
> | `claude-sonnet-4-5-20250929` | Retirement not sooner than 2026-09-29 | `claude-sonnet-5` |
> | `claude-opus-4-5-20251101` | Retirement not sooner than 2026-11-24 | `claude-opus-5` |
> | `claude-haiku-4-5-20251001` | Retirement not sooner than 2026-10-15 | Keep until a successor exists |
>
> Two claims below are also wrong. The Gemini `thinking_level` parameter was
> never "VERIFIED": the installed `@google/genai` 1.11.0 drops it, so no thinking
> level has ever reached Google. And the Claude "4.5" parameter handling does
> not cover Claude 5, which rejects `temperature` and `top_p` outright.
> ISSUES.md #84 tracks the fix.

This document catalogs all pre-configured AI model specifications in the FEED application, mapped to the AIConfiguration database schema.

## Schema Template Reference

```
  name              String        @unique
  type              String
  value             String
  description       String?
  serviceType       String?
  model             String?
  modelName         String?
  endpointUrl       String?
  encryptedApiKey   String?
  inputCost         Float?
  outputCost        Float?
  unitPrice         String?       @default("per_1m")
  temperature       Float?        @default(0.7)
  topP              Float?        @default(1.0)
  maxTokens         Int?
  inputTokenLimit   Int?
  outputTokenLimit  Int?
  tokensPerMinute   Int?
  requestsPerMinute Int?
  requestsPerDay    Int?
```

## Service Endpoints

```typescript
OpenAI:    https://api.openai.com/v1
Anthropic: https://api.anthropic.com/v1
Google:    https://generativelanguage.googleapis.com
Azure:     (Custom endpoint required)
```

---

## OpenAI Models

### GPT-5 Family (Reasoning Models)

#### gpt-5-nano
```
modelName:         gpt-5-nano
model:             gpt-5-nano-2025-08-07
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         0.05
outputCost:        0.40
unitPrice:         per_1m
temperature:       1.0          # OVERRIDE: GPT-5 requires 1.0
topP:              (excluded)   # OVERRIDE: GPT-5 does not support top_p
maxTokens:         128000
inputTokenLimit:   128000
outputTokenLimit:  128000
tokensPerMinute:   200000
requestsPerMinute: 500
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  maxTokensField:   max_completion_tokens
  reasoningEffort:  minimal
  modelFamily:      gpt-5
```

#### gpt-5-mini
```
modelName:         gpt-5-mini
model:             gpt-5-mini-2025-08-07
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         0.25
outputCost:        2.00
unitPrice:         per_1m
temperature:       1.0          # OVERRIDE: GPT-5 requires 1.0
topP:              (excluded)   # OVERRIDE: GPT-5 does not support top_p
maxTokens:         128000
inputTokenLimit:   128000
outputTokenLimit:  128000
tokensPerMinute:   200000
requestsPerMinute: 500
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  maxTokensField:   max_completion_tokens
  reasoningEffort:  low
  modelFamily:      gpt-5
```

#### gpt-5
```
modelName:         gpt-5
model:             gpt-5-2025-08-07
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         1.25
outputCost:        10.00
unitPrice:         per_1m
temperature:       1.0          # OVERRIDE: GPT-5 requires 1.0
topP:              (excluded)   # OVERRIDE: GPT-5 does not support top_p
maxTokens:         128000
inputTokenLimit:   128000
outputTokenLimit:  128000
tokensPerMinute:   200000
requestsPerMinute: 500
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  maxTokensField:   max_completion_tokens
  reasoningEffort:  low
  modelFamily:      gpt-5
```

### GPT-4.1 Family

#### gpt-4.1-nano
```
modelName:         gpt-4.1-nano
model:             gpt-4.1-nano-2025-04-14
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         0.10
outputCost:        0.40
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         32768
inputTokenLimit:   1047576
outputTokenLimit:  32768
tokensPerMinute:   30000
requestsPerMinute: 500
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  maxTokensField:   max_tokens
  modelFamily:      gpt-4
```

#### gpt-4.1-mini
```
modelName:         gpt-4.1-mini
model:             gpt-4.1-mini-2025-04-14
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         0.40
outputCost:        1.60
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         32768
inputTokenLimit:   1047576
outputTokenLimit:  32768
tokensPerMinute:   30000
requestsPerMinute: 500
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  maxTokensField:   max_tokens
  modelFamily:      gpt-4
```

#### gpt-4.1
```
modelName:         gpt-4.1
model:             gpt-4.1-2025-04-14
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         2.00
outputCost:        8.00
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         32768
inputTokenLimit:   1047576
outputTokenLimit:  32768
tokensPerMinute:   30000
requestsPerMinute: 500
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  maxTokensField:   max_tokens
  modelFamily:      gpt-4
```

### GPT-4o Family

#### gpt-4o-mini
```
modelName:         gpt-4o-mini
model:             gpt-4o-mini-2024-07-18
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         0.15
outputCost:        0.60
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         16384
inputTokenLimit:   131072
outputTokenLimit:  16384
tokensPerMinute:   200000
requestsPerMinute: 500
requestsPerDay:    10000

# API Parameters
apiParameters:
  maxTokensField:   max_tokens
  modelFamily:      gpt-4
```

#### gpt-4o
```
modelName:         gpt-4o
model:             gpt-4o-2024-05-13
serviceType:       OpenAI
endpointUrl:       https://api.openai.com/v1
inputCost:         5.00
outputCost:        20.00
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         16384
inputTokenLimit:   131072
outputTokenLimit:  16384
tokensPerMinute:   30000
requestsPerMinute: 500
requestsPerDay:    720000

# API Parameters
apiParameters:
  maxTokensField:   max_tokens
  modelFamily:      gpt-4
```

### LEGACY: o-series Models (DEPRECATED)

**Note**: The following models are scheduled for retirement and have been commented out in the codebase to prevent selection:

- **o3-mini** (GA 2025-01-31) — no earlier than 2026-02-01
- **o3** (GA 2025-04-16) — no earlier than 2026-04-11
- **o4-mini** (GA 2025-04-16) — no earlier than 2026-04-11

Source: [Azure AI Foundry Model Retirements](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/model-retirements)

Context: OpenAI is consolidating toward the GPT-5 family; prefer gpt-5 models going forward.

---

## Anthropic Models

Note: `tokensPerMinute` reflects the most conservative Anthropic rate limit (min of input/output tokens per minute).

### Claude Haiku 4.5
```
modelName:         claude-haiku-4.5
model:             claude-haiku-4-5-20251001
serviceType:       Anthropic
endpointUrl:       https://api.anthropic.com/v1
inputCost:         1.00
outputCost:        5.00
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         64000
inputTokenLimit:   200000
outputTokenLimit:  64000
tokensPerMinute:   10000
requestsPerMinute: 50
requestsPerDay:    (unlimited)
```

### Claude Sonnet 4.5
```
modelName:         claude-sonnet-4.5
model:             claude-sonnet-4-5-20250929
serviceType:       Anthropic
endpointUrl:       https://api.anthropic.com/v1
inputCost:         3.00
outputCost:        15.00
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         64000
inputTokenLimit:   200000
outputTokenLimit:  64000
tokensPerMinute:   8000
requestsPerMinute: 50
requestsPerDay:    (unlimited)
```

### Claude Opus 4.5
```
modelName:         claude-opus-4.5
model:             claude-opus-4-5-20251101
serviceType:       Anthropic
endpointUrl:       https://api.anthropic.com/v1
inputCost:         5.00
outputCost:        25.00
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         64000
inputTokenLimit:   200000
outputTokenLimit:  64000
tokensPerMinute:   8000
requestsPerMinute: 50
requestsPerDay:    (unlimited)
```

#### Classification Token Optimization (Anthropic)

Classification operations use operation-specific token ceilings to avoid long-request timeouts and improve efficiency:

- Ceiling: 16384 tokens (classification and batch classification only)
- Rationale: Classification outputs are small, structured JSON (roughly 80 tokens per segment)
- SDK threshold: (3600 * 16384) / 128000 = 461 seconds (under 10 minutes)
- Batch size: 40 segments per batch for Anthropic classification

#### Translation Token Ceiling (Claude 4.5)

Claude 4.5 translation operations cap max tokens to prevent long-request SDK timeouts while preserving translation headroom:

- Ceiling: 20480 tokens (translation and batch translation only)
- Applies to: Claude 4.5 models
- Rationale: Translation output length varies; 20480 stays under the 10-minute SDK threshold while allowing larger paragraphs

#### Claude 4.5 Parameter Restrictions

Claude 4.5 models reject requests that include both temperature and top_p:

- Rule: only one of temperature or top_p can be specified
- Resolution: when both are configured, temperature is kept and top_p is excluded
- Affected models: claude-haiku-4.5, claude-sonnet-4.5, claude-opus-4.5

---

## Google Models

### Gemini 2.5 Family

#### gemini-2.5-flash-lite
```
modelName:         gemini-2.5-flash-lite
model:             gemini-2.5-flash-lite
serviceType:       Google
endpointUrl:       https://generativelanguage.googleapis.com
inputCost:         0.10
outputCost:        0.40
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         65536
inputTokenLimit:   1048576
outputTokenLimit:  65536
tokensPerMinute:   4000000
requestsPerMinute: 2000
requestsPerDay:    (unlimited)
```

#### gemini-2.5-flash
```
modelName:         gemini-2.5-flash
model:             gemini-2.5-flash
serviceType:       Google
endpointUrl:       https://generativelanguage.googleapis.com
inputCost:         0.30
outputCost:        2.50
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         65536
inputTokenLimit:   1048576
outputTokenLimit:  65536
tokensPerMinute:   4000000
requestsPerMinute: 2000
requestsPerDay:    (unlimited)
```

#### gemini-2.5-pro
```
modelName:         gemini-2.5-pro
model:             gemini-2.5-pro
serviceType:       Google
endpointUrl:       https://generativelanguage.googleapis.com
inputCost:         1.25
outputCost:        10.00
unitPrice:         per_1m
temperature:       0.7          # Default
topP:              1.0          # Default
maxTokens:         65536
inputTokenLimit:   1048576
outputTokenLimit:  65536
tokensPerMinute:   8000000
requestsPerMinute: 2000
requestsPerDay:    (unlimited)
```

### Gemini 3 Family (PREVIEW)

**Status**: Preview models subject to change

#### gemini-3-flash-preview
```
modelName:         gemini-3-flash-preview
model:             gemini-3-flash-preview
serviceType:       Google
endpointUrl:       https://generativelanguage.googleapis.com
inputCost:         0.50
outputCost:        3.00
unitPrice:         per_1m
temperature:       1.0          # OVERRIDE: Gemini 3 recommends 1.0
topP:              1.0          # Default
maxTokens:         65536
inputTokenLimit:   1048576
outputTokenLimit:  65536
tokensPerMinute:   4000000
requestsPerMinute: 2000
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  modelFamily:      gemini-3
  thinkingLevel:    low                                     # Default for Flash
  supportedThinkingLevels: [minimal, low, medium, high]    # Flash supports all levels
```

#### gemini-3-pro-preview
```
modelName:         gemini-3-pro-preview
model:             gemini-3-pro-preview
serviceType:       Google
endpointUrl:       https://generativelanguage.googleapis.com
inputCost:         2.00
outputCost:        12.00
unitPrice:         per_1m
temperature:       1.0          # OVERRIDE: Gemini 3 recommends 1.0
topP:              1.0          # Default
maxTokens:         65536
inputTokenLimit:   1048576
outputTokenLimit:  65536
tokensPerMinute:   8000000
requestsPerMinute: 2000
requestsPerDay:    (unlimited)

# API Parameters
apiParameters:
  modelFamily:      gemini-3
  thinkingLevel:    low               # Default for Pro
  supportedThinkingLevels: [low, high]  # Pro ONLY supports low/high (per Google docs)
```

**IMPORTANT**: Gemini 3 Pro has restricted thinking levels compared to Flash:
- **gemini-3-flash-preview**: Supports all levels (minimal, low, medium, high)
- **gemini-3-pro-preview**: Only supports (low, high)

---

## Model-Specific Override Patterns

### GPT-5 Override Pattern (IMPLEMENTED)

GPT-5 models have specific requirements enforced at runtime via `checkAndOverrideParameters()` in `OpenAITranslationService.ts`:

```typescript
if (modelSpec?.apiParameters?.modelFamily === 'gpt-5') {
  // Force temperature to 1.0
  if (requestedTemperature !== 1.0) {
    temperature = 1.0;
    warnings.push(`GPT-5 models only support temperature=1.0...`);
  }
  
  // Remove top_p parameter
  if (requestedTopP !== undefined) {
    topP = undefined;
    warnings.push(`GPT-5 models don't support the top_p parameter...`);
  }
}
```

**Applied to**:
- gpt-5-nano
- gpt-5-mini
- gpt-5

**Thinking Level Override (Implemented)**:
- The `AIConfiguration.thinkingLevel` field now drives OpenAI GPT-5 `reasoning_effort`.
- Mapping:
  - `minimal` → `minimal`
  - `low` → `low`
  - `medium` → `medium`
  - `high` → `high`
- Scope: GPT-5 family only (gpt-5, gpt-5-mini, gpt-5-nano). GPT-4o-mini is unaffected.
- Fallback: if `thinkingLevel` is unset, use the model spec default `reasoningEffort` (or OpenAI default `low`).

### Gemini 3 Override Pattern (IMPLEMENTED)

Gemini 3 preview models follow the same pattern via `checkAndOverrideParameters()` in `GoogleTranslationService.ts`. The thinking level is now configurable per AI configuration and falls back to the model spec default when unset:

```typescript
private checkAndOverrideParameters(
  model: string,
  requestedTemperature?: number,
  requestedTopP?: number,
  requestedThinkingLevel?: 'minimal' | 'low' | 'medium' | 'high' | null
): {
  temperature: number;
  topP?: number;
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  warnings: string[];
} {
  const modelSpec = getModelSpecByModel(model);
  const warnings: string[] = [];
  let temperature = requestedTemperature ?? 0.7;  // Gemini 2.5 default
  let topP: number | undefined = requestedTopP;
  let thinkingLevel: 'minimal' | 'low' | 'medium' | 'high' | undefined;
  
  if (modelSpec?.apiParameters?.modelFamily === 'gemini-3') {
    // Force temperature to 1.0 per Google recommendation
    if (requestedTemperature !== 1.0 && requestedTemperature !== undefined) {
      temperature = 1.0;
      warnings.push(
        `Gemini 3 models default to temperature=1.0. Your configured temperature of ${requestedTemperature} has been overridden to 1.0 per Google's recommendation.`
      );
    } else {
      temperature = 1.0;
    }
    
    // Use configuration override if provided, otherwise model default
    thinkingLevel = requestedThinkingLevel ?? modelSpec.apiParameters?.thinkingLevel ?? 'low';
  }
  
  return { temperature, topP, thinkingLevel, warnings };
}
```

**Applied in API calls**:
```typescript
const paramCheck = this.checkAndOverrideParameters(
  model,
  promptConfig.temperature,
  promptConfig.topP,
  this.config.thinkingLevel
);

if (paramCheck.warnings.length > 0) {
  warnings.push(...paramCheck.warnings);
}

const response = await client.models.generateContent({
  model,
  contents: request.text,
  config: {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: { ... },
    temperature: paramCheck.temperature,
    ...(paramCheck.topP !== undefined && { topP: paramCheck.topP }),
    ...(paramCheck.thinkingLevel && {
      thinkingConfig: { thinking_level: paramCheck.thinkingLevel }
    }),
    maxOutputTokens: promptConfig.maxTokens
  }
});
```

**SDK Parameter Name**: ~~`thinking_level` (snake_case) - **VERIFIED** from official @google/genai SDK documentation~~ **Corrected (2026-09-11):** the JS SDK field is `thinkingLevel`. The old spelling reached nothing — `@google/genai` 1.11.0 forwarded only `includeThoughts` and `thinkingBudget`. FEED now runs SDK 2.22.0 and sends `thinkingLevel`. See ISSUES.md #84.
**Parameter Structure**: Nested in `thinkingConfig` object (not top-level like temperature/topP)

**Applied to**:
- gemini-3-flash-preview
- gemini-3-pro-preview

---

## Notes

### Cost Units
All models use `per_1m` pricing by default (per 1 million tokens). The `inputPrice` and `outputPrice` values in model specs represent cost per 1 million tokens. This is the standard unit across all AI providers in the system.

### Undefined Values
- `(unlimited)` indicates `requestsPerDay` has no limit
- `(undefined)` indicates `outputTokenLimit` or `maxTokens` is not specified in the model spec

### API Parameter Extensions
The `apiParameters` field in ModelSpec is used for model-specific configuration that doesn't map directly to schema fields:
- `maxTokensField`: Which API parameter to use for max tokens (`max_tokens` vs `max_completion_tokens`)
- `reasoningEffort`: GPT-5 reasoning effort level (`minimal|low|medium|high`)
- `modelFamily`: Model family identifier for override patterns (`gpt-4|gpt-5|o-series|gemini-3`)
- `thinkingLevel`: Gemini 3 thinking level default (`minimal|low|medium|high`)
- `supportedThinkingLevels`: Array of valid thinking levels for the specific model (validation)

### TypeScript Interface Extension

The `ModelSpec` interface has been extended to support Gemini 3 parameters:

```typescript
export interface ModelSpec {
  name: string
  model: string
  inputPrice: number
  outputPrice: number
  tokensPerMinute: number
  requestsPerMinute: number
  requestsPerDay?: number
  inputTokenLimit: number
  outputTokenLimit?: number
  apiParameters?: {
    maxTokensField?: 'max_tokens' | 'max_completion_tokens'
    reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
    modelFamily?: 'gpt-4' | 'gpt-5' | 'o-series' | 'legacy' | 'gemini-3'  // Added: gemini-3
    thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high'      // Added: for Gemini 3
    supportedThinkingLevels?: Array<'minimal' | 'low' | 'medium' | 'high'>  // Added: validation
  }
}
```

**Files Updated**:
- `packages/frontend/src/components/ai-configuration/model-specs.ts`
- `packages/backend/src/services/ai/model-specs.ts`

### Implementation Status
- ✅ **OpenAI GPT-5 overrides**: Fully implemented
- ✅ **Anthropic models**: Standard implementation
- ✅ **Google Gemini 2.5**: Standard implementation
- ✅ **Google Gemini 3**: Override pattern implemented (Issue #8 follow-up)
  - TypeScript interface extensions: **Done**
  - Model spec updates: **Done**
  - GoogleTranslationService override method: **Done**
  - API call integration: **Done**
  - SDK parameter name verification: **Done** (`thinkingConfig.thinking_level`)

---

## Related Documentation
- [AI Configuration Overview](./ai-configuration-overview.md)
- [Defaults Update (2025-12-26)](../archive/ai-config/defaults-update-2025-12-26.md)
- Database Schema: `packages/backend/prisma/schema.prisma`
- Model Specs: `packages/frontend/src/components/ai-configuration/model-specs.ts`
- Model Specs (Backend): `packages/backend/src/services/ai/model-specs.ts`
