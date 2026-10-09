# AI Configuration Overview

This document provides a high-level summary of the AI Configuration section. The module manages API credentials and custom prompt templates used throughout the system.

## Purpose

Administrators use this section to store API keys for supported AI services and to create system prompts that control translation behavior. It serves as the central place to configure models, cost tracking, usage limits, and formatting rules.

## Frontend Architecture

All React components live in `packages/frontend/src/components/ai-configuration/`.

- **`index.tsx`** – Entry component that loads configurations with `useAIConfigurations` and controls dialog state.
- **Dialog components** – `add-dialog.tsx`, `edit-dialog.tsx`, `delete-dialog.tsx`, and prompt dialogs share a `BaseAIConfigDialog` for consistent multi-step forms.
- **`data-table/`** – Defines columns and bulk action helpers for the configuration table.
- **Hooks** – `useAIConfigData` handles caching, optimistic updates, and encryption key checks.

The UI separates API key dialogs from prompt dialogs but presents them in a unified table for simplicity. The shared table preserves pagination when edit, delete, or active-status actions refresh configuration data.

## Backend API

Routes in `packages/backend/src/routes/ai-config.ts` implement CRUD endpoints:

- `GET /api/ai-config` – List configurations with type information.
- `POST /api/ai-config` – Create a new API key or prompt record.
- `PUT /api/ai-config/:id` – Update an existing configuration.
- `DELETE /api/ai-config/:id` – Remove a configuration.

Records are stored across two tables (`AIConfiguration` and `SystemPrompt`). The service layer merges them into a single response for the frontend.

Token limits are stored on `AIConfiguration` as `inputTokenLimit` and `outputTokenLimit` (with `outputTokenLimit` mirrored to `maxTokens` for provider compatibility).

## Translation Integration

System prompts created here drive translation behavior for food items, categories, and documents. When translations are triggered, the active prompt template and API configuration are resolved to build the final request sent to the AI provider.

## Known Issues

- The **Reset to Defaults** button has not been implemented. The exact parameters that should be restored are still under discussion.

## Future Improvements

- Add real-time metrics on token usage and cost per configuration.
- Provide preset templates for common translation tasks.
- Implement a restore feature to reset all settings to safe defaults.

## API Key Validation (Warning-first)

- The AI Configuration module performs provider-aware, soft validation for API keys.
- If the format appears unusual for the selected provider (OpenAI, Anthropic, Google), a non-blocking warning toast is shown.
- Users can proceed without being blocked; only empty API keys are treated as errors in the multi-step dialog.
- Reference implementation:
  - `packages/frontend/src/components/ai-configuration/shared/validation.ts` (format checks)
  - `packages/frontend/src/components/ai-configuration/steps/ApiKeyStep.tsx` (warning toast on blur)

## Defaults (Updated 2025-12-31)

- Default service in the Add AI Model dialog: Google
- Default Google model: Gemini 2.5 Flash Lite (`gemini-2.5-flash-lite`)
- OpenAI default model when selecting OpenAI: GPT-5 nano (`gpt-5-nano-2025-08-07`)
- Anthropic default model when selecting Anthropic: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)

> **2026-09-11:** two of these three defaults no longer work for new setups.
> Google refuses `gemini-2.5-flash-lite` to new projects (404, reported to
> staff as an invalid API key), and OpenAI shuts down `gpt-5-nano-2025-08-07`
> on 2026-12-11. Proposed replacements: `gemini-3.5-flash-lite` and
> `gpt-5.6-luna`. Claude Haiku 4.5 remains available, with retirement not
> sooner than 2026-10-15. See
> [`model-catalogue-refresh-2026-09.md`](model-catalogue-refresh-2026-09.md)
> and ISSUES.md #84.

**Pending**: The OpenAI default model is under review (GPT-5 mini vs GPT-5 nano vs GPT-4o mini). Any change will be documented here and in [`archive/ai-config/defaults-update-2025-12-26.md`](../archive/ai-config/defaults-update-2025-12-26.md).

Implementation details:
- UI initial state is set in `packages/frontend/src/components/ai-configuration/AddAIModelDialog.tsx`.
- Per-service defaults are the first entries in each provider’s `model-specs` lists in `packages/frontend/src/components/ai-configuration/model-specs.ts`.
