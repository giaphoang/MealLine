# AI Cost Control System

## Problem Statement

### Current Technical Debt

The FEED application's cost limit enforcement system suffers from three critical architectural issues that prevent effective cost management:

#### 1. Hardcoded Cost Limits
**Location**: `/packages/backend/src/config/limits.ts`

```typescript
COST_LIMITS: {
  DAILY: 100.00,   // Hardcoded - no configuration interface
  MONTHLY: 100.00
}
```

**Issues**:
- Not stored in database
- Not configurable through UI
- Applies globally across all AI services
- Same limit for $0.50/1M Gemini Flash and $15/1M Claude Opus
- Changes require code modification and deployment

#### 2. Dual Cost Tracking Systems
The application maintains two separate cost tracking mechanisms that have diverged:

**Legacy System** (being queried):
```typescript
// LimitEnforcementService.getCurrentUsage()
prisma.translation.aggregate({
  _sum: { totalCost: true }  // Old approach
})
```

**Modern System** (being written to):
```typescript
// UsageRecord table stores actual costs
// translation-trigger.ts no longer updates Translation.totalCost
```

**Impact**: Cost limit checks query stale data while actual costs accumulate in `UsageRecord` table.

#### 3. Unit Price Conversion Bug (FIXED)
Cost calculations treated per-1M rates as per-token rates, causing ~1,000,000× cost overestimation.

**Example**:
- Gemini 3 Flash: $0.50 per 1M tokens
- Bug treated it as: $0.50 per token
- Result: 1,000 token request → estimated $500 cost → immediate limit violation

**Resolution**: `LimitEnforcementService` now uses `convertToPerTokenRate()` for accurate calculations. This fix addresses the immediate blocker but doesn't resolve the underlying architectural debt.

## Option C: Per-Configuration Cost Limits

### Overview

Replace hardcoded global cost limits with configurable per-AI-service limits stored in the database. This enables:

- Different cost limits for different AI services
- Different limits for development vs production configurations
- User control over cost protection
- Accurate cost tracking via `UsageRecord` table

### Architectural Goals

1. **Database-driven configuration**: Store daily/monthly cost limits in `AIConfiguration` table
2. **Modern cost tracking**: Migrate from `Translation.totalCost` to `UsageRecord` aggregation
3. **Per-configuration isolation**: Each AI configuration has independent cost tracking
4. **UI control**: Users configure limits through Tools → AI Configuration interface
5. **Backward compatibility**: Existing configurations receive sensible defaults

### Implementation Phases

#### Phase 1: UI Mocks
**Owner**: Geiger  
**Status**: ✅ Complete

**Decisions Made**:
- Step placement: Between Token Limits and Usage Limits (step 5 of 8)
- Icon: CircleDollarSign
- Input validation: 2 decimal places max, $10,000 cap, 0 treated as unlimited
- Fields: Daily Maximum, Monthly Maximum (both optional)

**Implementation**:
- Created `CostLimitsStep.tsx` component
- Added `formatCostLimitInput()` and `createCostLimitChangeHandler()` with 2-decimal enforcement
- Updated `ApiKeyConfigData` type with `dailyCostLimit` and `monthlyCostLimit` fields
- Integrated into Add/Edit modal workflows
- Frontend collects data (not persisted until Phase 2 complete)

**Files Modified**:
- `packages/frontend/src/components/ai-configuration/steps/CostLimitsStep.tsx` (new)
- `packages/frontend/src/components/ai-configuration/shared/types.ts`
- `packages/frontend/src/components/ai-configuration/shared/formatting.ts`
- `packages/frontend/src/components/ai-configuration/shared/stepDefinitions.ts`
- `packages/frontend/src/components/ai-configuration/AddAIModelDialog.tsx`
- `packages/frontend/src/components/ai-configuration/EditAIModelDialog.tsx`
- `packages/frontend/src/components/ai-configuration/types.ts`

#### Phase 2: Database Schema Update
**Status**: ✅ Complete (schema + migration applied)

Add cost limit fields to `AIConfiguration` model:
```prisma
model AIConfiguration {
  // Existing fields...
  dailyCostLimit   Float?  // Per-configuration daily cost limit
  monthlyCostLimit Float?  // Per-configuration monthly cost limit
}
```

**Migration Requirements**:
- Add new nullable fields (unlimited by default)
- Generate and test migration

#### Phase 3: Backend Logic
**Status**: ✅ Complete (limit enforcement, API routes, and providers wired)

**Updates Required**:

1. **LimitEnforcementService Refactor**:
   - Replace `getCurrentUsage()` to query `UsageRecord` instead of `Translation` (✅ done)
   - Add `configurationId` parameter for per-config tracking (✅ done)
   - Use `AIConfiguration.dailyCostLimit`/`monthlyCostLimit` instead of hardcoded value (✅ done)
   - Aggregate costs by `aiConfigurationId` (✅ done)

2. **API Route Updates**:
   - Accept cost limits in AI configuration endpoints (✅ done)
   - Validate limit ranges (⏳ pending - relies on UI validation)
   - Handle NULL (unlimited) vs specific limits (✅ done)

3. **Service Integration**:
   - Ensure all AI services pass configuration context to limit checks (✅ done)
   - Update factory pattern to include config metadata (no changes required)

### Success Criteria

- [x] Users can set different cost limits for each AI configuration
- [x] Cost tracking accurately reflects `UsageRecord` data
- [ ] Legacy `Translation.totalCost` can be deprecated
- [x] Existing configurations continue working with default limits (unlimited)
- [x] Cost limit violations produce actionable error messages

### Follow-ups

- Add backend-side range validation for cost limits to complement UI validation.
- Plan deprecation path for `Translation.totalCost` once analytics have fully migrated.

## Related Documentation

- [AI Configuration Overview](./ai-configuration-overview.md)
- [AI Models Reference](./ai-models.md)
- [Database Schema](../backend/docs/database/schema.md)

## Related Notes

- The `thinkingLevel` field is used for Gemini 3 thinking levels.
- GPT-5 reasoning models now map `thinkingLevel` to `reasoning_effort` (gpt-5, gpt-5-mini, gpt-5-nano). This does not change cost tracking, since totals still come from API-reported usage.

## Change Log

- **2025-12-28**: Document created - problem statement and Option C overview defined
- **2025-12-28**: Phase 1 complete - UI step implemented with 2-decimal validation
- **2025-12-28**: Phase 2 complete - schema/migration for per-config cost limits
- **2025-12-28**: Phase 3 complete - UsageRecord aggregation, provider enforcement, and API updates
