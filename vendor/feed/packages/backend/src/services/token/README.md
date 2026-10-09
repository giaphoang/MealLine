# Token Calculation Service

## Overview
This service handles token calculation and cost estimation for the translation service using the GPT-4o mini model.

## Token Distribution
The service uses a specific token distribution model optimized for translation:

1. **System Prompt**
   - Fixed cost (61 tokens)
   - Always counted as input tokens
   - Uses prompt token rate

2. **User Input (Source Text)**
   - Split 50/50 between input and completion
   - First half uses prompt token rate
   - Second half considered part of the conversation context

3. **Model Output (Translation)**
   - Split 50/50 between completion and next input
   - Uses completion token rate for the current output
   - Considers future context needs

## Rate Structure
- Input tokens: $0.150 per 1M tokens
- Completion tokens: $0.600 per 1M tokens

## Model Limits
- Context Window: 128,000 tokens
- Max Output: 16,384 tokens
- TPM (Tokens per Minute): 200,000
- RPM (Requests per Minute): 500

## Usage Example
```typescript
const metrics = await calculateInputMetrics(text, targetLanguage);
const cost = metrics.cost;
const tokenCount = metrics.tokenCount;
```

## Rate Limiting
The service integrates with OpenAI-style rate limiting headers:
- x-ratelimit-limit-requests
- x-ratelimit-limit-tokens
- x-ratelimit-remaining-requests
- x-ratelimit-remaining-tokens
- x-ratelimit-reset-requests
- x-ratelimit-reset-tokens

## Important Notes
1. Token counting uses tiktoken for accurate estimation
2. System prompt is included in all calculations
3. Token splits are optimized for translation workloads
4. All rates and limits align with OpenAI's Tier 1