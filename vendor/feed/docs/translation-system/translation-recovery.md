# Translation Recovery System

## Overview

The Translation Recovery System is designed to improve the reliability of the automatic translation process, especially when dealing with a large volume of translation requests. The system automatically detects and attempts to recover translations that have become stuck in the "pending" state for too long, using a fully event-driven approach to avoid unnecessary background processes.

## Key Components

### 1. TranslationRecovery Service

The `TranslationRecovery` service checks for translations that have been stuck in the "pending" state for more than 60 seconds and have not yet been automatically retried. When such translations are found, the service:

1. Marks these translations as having been auto-retried using metadata (single-attempt safeguard)
2. Defers to the active processing flows to handle retries on their next cycle

This design avoids continuous polling and keeps recovery lightweight. Recovery does not itself process translations; it annotates them for safe retry and relies on the next processing call.

### 2. Event-Driven Recovery Hooks

Recovery is driven by real work rather than fixed schedules and can be invoked:

1. **During Provider Errors**: AI provider implementations call recovery on specific error classes (rate limiting, timeouts)
2. **On-Demand**: `/api/translations/recover-stuck` allows a manual recovery pass

With the current architecture, core processing is initiated by dedicated flows:
- Food Items/Categories: via `translationTriggerService` queueing
- Custom: inline processing during specific operations (e.g., Find Missing processing, bulk retry)

### 3. Enhanced OpenAI Service

The OpenAI translation service has been enhanced with:
- Built-in retry logic for transient errors (rate limits, server errors)
- Exponential backoff between retry attempts
- Intelligent error classification to only retry appropriate errors
- Maximum retry limits to prevent endless retry loops

## How It Works

1. **Event-Driven Detection**: The system checks for stuck translations after specific events, such as batch processing completion or API errors.

2. **Single Retry**: When stuck translations are found, the system marks them with metadata to indicate they've been auto-retried, and triggers a single retry attempt.

3. **API Resilience**: The OpenAI service implements its own retry logic with exponential backoff for specific errors like rate limits (429) or server errors (5xx).

4. **Final Status**: If the retry succeeds, the translation status changes to "completed." If the retry fails, the status changes to "failed" and requires manual intervention.

## Best Practices

1. **Batch Processing**: When adding new languages or content that would create many new translations, consider doing this in smaller batches to avoid overwhelming the system.

2. **Manual Retry**: For translations that fail even after the automatic retry, use the manual retry option in the Translation Management UI.

3. **Monitoring**: Keep an eye on the translation metrics in the dashboard to identify any patterns of failures.

## Benefits

- Improved reliability for the translation system
- Better handling of API rate limits and server errors
- Reduced need for manual intervention
- Clear distinction between temporary and persistent translation failures
- Improved user experience when adding new languages to existing content

## Technical Implementation

The event-driven recovery system is implemented through several components:

1. `TranslationRecovery` service for detecting and tagging stuck translations
2. Enhanced AI provider services with retry logic and exponential backoff
3. Prisma metadata used to track one-time auto-retry annotations
4. On-demand REST API endpoint for manual recovery passes

This design ensures the system is responsive to issues without unnecessary background processes running constantly.
