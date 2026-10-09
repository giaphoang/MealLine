# Token Usage Estimator Architecture Decision

## Technical Decision
Legacy token estimation removed from translation routes. Service abstraction layer now exclusive path for all AI operations.

## Current State
- Routes no longer call `estimateInputTokensAndCost()` before service instantiation
- Token metrics provided by AI service responses only
- No upfront cost estimation capability
- Google Gemini usage tracking now prefers `usageMetadata` (prompt/candidates/thoughts tokens) with estimate fallback
- OpenAI usage tracking now prefers API `usage` token counts for translation metrics and costs with estimate fallback
- Daily token enforcement now derives from `tokensPerMinute` (TPM × 1440) instead of `requestsPerDay`

## Impact on Multi-Service Architecture
Token usage tracking requires complete redesign for multi-provider support:

### Provider-Specific Challenges
- **OpenAI**: tiktoken library, GPT model token counting
- **Google**: Different tokenization, Gemini model variants
- **Anthropic**: Claude-specific token calculation methods
- **Azure**: OpenAI-compatible but different rate structures

### Current Limitations
- Dashboard token usage charts assume single OpenAI model
- Usage tracking hardcoded to OpenAI pricing structure
- Token calculation service tightly coupled to tiktoken library
- No abstraction for provider-specific token counting methods

## Required Changes
1. **Abstract Token Calculator Interface**
   - Provider-specific token estimation methods
   - Cost calculation per service type
   - Usage aggregation across multiple providers

2. **Dashboard Usage Charts Redesign**
   - Multi-provider token usage visualization
   - Provider-specific cost breakdowns
   - Service type filtering and aggregation

3. **Database Schema Extensions**
   - Provider identification in usage records
   - Service-specific cost tracking
   - Multi-provider usage aggregation queries

## Translation Performance Time Range Filtering - COMPLETED ✅

**Issue Resolution:**
Fixed Translation Performance card Period dropdown not functioning. Implemented backend time range query parameters for proper date filtering.

**Implementation:**
- Added `timeRange` parameter to `/api/projections/multi-service-metrics` endpoint
- Created `getTimeRangeParams()` utility for date conversion (1d, 7d, 30d, 365d → dates)
- Updated UsageRecordService calls with time-range-aware filtering
- Enhanced frontend service to pass timeRange parameters
- Modified hooks to support time range integration

**Result:**
Period dropdown now filters charts correctly - Today shows current day, This Week shows 7 days, etc.

## Current Implementation Status
**Service Layer Refactoring COMPLETED** - eliminated all mock data dependencies:
- Removed fallback calculations from ProjectionsService - requires real backend data exclusively
- Fixed Cost Forecast chart tooltip ordering for proper value display
- Moved utility functions to dedicated service-utils.ts file
- Removed multi-service-mock-data.ts mock generators
- All dashboard components consume authentic backend data without fallbacks

**Multi-provider token tracking COMPLETED** with service-specific performance metrics:
- Backend provides service-specific performance data via `performanceByService` field
- Dashboard displays authentic response times per service (Anthropic: 4.8s, Google: 1.0s, OpenAI: 2.8s)
- Fixed uniform response time issue across all AI services
- **Dashboard Performance Consistency Fix COMPLETED**: Cost Comparison now uses real backend data instead of mock calculations
- Eliminated inconsistency between Usage Summary (real data) and Cost Comparison (mock data)

## Token Usage Calculation Fix - COMPLETED ✅

**Issue Resolution:**
Fixed "Tokens per Request" showing "Infinite" in Usage Summary dashboard card. Root cause was temporal inconsistency in data aggregation.

**Problem:**
- `totalTokens` calculated from all-time usage data (August onward)
- `totalRequests` calculated from daily usage data (today only)
- Result: Division by zero when no requests made today, despite extensive historical usage

**Solution:**
Fixed data aggregation consistency in MultiServiceUsageService:
- Changed `config.dailyUsage.requestCount` → `config.allTimeUsage.requestCount`
- Updated UI label to "Average Tokens per Request (All-Time)" for clarity
- Now provides statistically meaningful cost estimation data

**Business Value:**
Metric now serves its intended purpose: helping users estimate token consumption for cost planning ("If I translate 100 documents, roughly how many tokens will that consume?").

## Dependencies
- ✅ Complete AI service abstraction
- ✅ Provider-specific performance tracking
- ✅ Dashboard visualization system updated
- ✅ Token usage calculation consistency
