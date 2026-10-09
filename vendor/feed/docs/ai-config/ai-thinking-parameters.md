# AI Thinking Parameters

**Status**: Phase 3 complete (backend integration)  
**Last Updated**: December 29, 2025

> **2026-09-11 — the Gemini half of Phase 3 never took effect, and now does.**
> FEED sent `thinkingConfig: { thinking_level }` in snake_case, while the JS
> SDK field is `thinkingLevel`. Worse, `@google/genai` 1.11.0 forwarded only
> `includeThoughts` and `thinkingBudget` out of `thinkingConfig` and dropped
> everything else without complaint, so every Gemini 3 request ran at Google's
> default however the slider was set.
>
> Fixed by upgrading to `@google/genai` 2.22.0, where `ThinkingConfig`
> declares `thinkingLevel`, and by sending that spelling at all four call
> sites. The unit test asserted the wrong spelling and passed throughout,
> which is why a type-level assertion against the SDK's own `ThinkingConfig`
> now sits beside it.
>
> The OpenAI `reasoning_effort` mapping was always unaffected. Supported
> levels still differ across Gemini 3.5–3.8, and some of those models cannot
> disable thinking. See
> [`model-catalogue-refresh-2026-09.md`](model-catalogue-refresh-2026-09.md)
> and ISSUES.md #84.

## Problem Statement

Currently, AI model thinking levels (used by Gemini 3 preview models and similar reasoning-capable models) are hard-coded in the model specification files. Users cannot configure thinking levels per AI configuration, limiting flexibility for different use cases.

### Technical Debt

This mirrors the cost limits technical debt resolved in v0.14.7:
- **Hard-coded values**: Thinking levels stored in `model-specs.ts` with no user override
- **No per-configuration customization**: All Gemini 3-flash-preview instances use `thinkingLevel: 'low'`
- **Limited use case support**: Cannot optimize for speed (minimal) vs quality (high) based on task

Example hard-coded configuration:
```typescript
{
  name: 'gemini-3-flash-preview',
  apiParameters: {
    modelFamily: 'gemini-3',
    thinkingLevel: 'low',  // Hard-coded, no user control
    supportedThinkingLevels: ['minimal', 'low', 'medium', 'high']
  }
}
```

## General Implementation Overview

### Architecture Changes

Following the cost limits pattern established in December 2025:

**Phase 1 - UI Layer**:
- New `ThinkingLevelStep` component positioned after ParametersStep
- Slider control with 4 discrete values: minimal, low, medium, high
- Model-aware validation against `supportedThinkingLevels`

**Phase 2 - Database**:
- Add `thinkingLevel` column to `AIConfiguration` table (nullable String)
- Migration to support new field without breaking existing configurations
  - Migration applied: `20251229013207_add_thinking_level`

**Phase 3 - Backend Logic**:
- Persist `thinkingLevel` in AI configuration create/update routes
- Use configuration value when applying Gemini 3 overrides (fallback to model spec default)
- Validate against `supportedThinkingLevels` and warn on unsupported selections
- Reject invalid thinking levels at the API boundary

### UX Decisions

**Pending decisions from Geiger:**
- Should step be visible for all models or only thinking-capable models?
- How to handle models with restricted levels (Gemini 3 Pro: only 'low' and 'high')?
- Default behavior when field is null (use model spec default vs system default)?
- Edit mode behavior (preserve existing null values vs require selection)?

### Implementation Status

- [x] Phase 1: UI Mock (ThinkingLevelStep component)
  - Created ThinkingLevelStep.tsx with slider control (4 discrete values)
  - Added step to AI configuration flow (positioned after ParametersStep)
  - Updated ApiKeyConfigData type with optional thinkingLevel field
  - Set default value to 'high' in AddAIModelDialog
- [x] Phase 2: Database schema update
- [x] Phase 3: Backend integration
- [x] Testing and validation
- [x] Documentation completion

## Phase 1: UI Mock - Implementation Details

**Files Modified:**
- `/packages/frontend/src/components/ai-configuration/steps/ThinkingLevelStep.tsx` (new)
- `/packages/frontend/src/components/ai-configuration/shared/stepDefinitions.ts`
- `/packages/frontend/src/components/ai-configuration/shared/types.ts`
- `/packages/frontend/src/components/ai-configuration/AddAIModelDialog.tsx`

**Component Features:**
- Brain icon from lucide-react
- Slider with 4 discrete positions (0-3 mapping to minimal/low/medium/high)
- Visual labels at each position
- Current selection displayed prominently
- Helper text explaining speed vs quality tradeoff
- Follows StepWrapper pattern for consistency

**Step Position:**
- Sequence: Service → API Key → Cost → Token Limits → Cost Limits → Usage Limits → Parameters → **Thinking Level** → Name
- Step 8 of 9 in Add AI Model flow
- Marked as optional (isOptional: true)

## Notes

Implementation follows established patterns from:
- Cost limits feature (nullable database fields, 0/null semantics)
- Parameters step (slider controls, validation)
- GPT-5 override pattern (model-specific parameter handling)

## OpenAI Extension (Reasoning Effort)

The Thinking Level control was built for Gemini 3 thinking models, and OpenAI GPT-5 models also support a reasoning control (`reasoning_effort`). The existing `thinkingLevel` field now drives GPT-5 reasoning effort.

**Mapping**:
- `minimal` → `minimal`
- `low` → `low`
- `medium` → `medium`
- `high` → `high`

**Applies to**:
- gpt-5-nano
- gpt-5-mini
- gpt-5

**Does not apply to**:
- gpt-4o-mini (non-reasoning model)
- GPT-4.1 family (no `reasoning_effort` support)

**Fallback behavior**:
- If `thinkingLevel` is unset, use the model spec default `reasoningEffort` (or OpenAI default `low`).

---

*This document will be updated as UX decisions are finalized.*
