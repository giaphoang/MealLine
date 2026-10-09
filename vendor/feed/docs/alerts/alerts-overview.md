# Alerts System Overview

This document explains the Alerts feature architecture and the recent fix for the Alerts modal remaining stuck on "Loading alerts...".

## Architecture

- Backend SSE endpoint: `GET /api/alerts/stream`
  - Sends an initial snapshot `{ type: 'initial', alerts, unreadCount }` when the connection opens.
  - Streams realtime events for new alerts `{ type: 'new', alert }` and updates `{ type: 'update', alert }`.
  - On initialization errors, emits `{ type: 'error', message }`.
  - Implementation: `packages/backend/src/routes/alerts/index.ts`.

- Backend alert service
  - Creates and updates alerts in the database and emits events via `alertEventEmitter`.
  - Key files:
    - `packages/backend/src/services/alerts/index.ts`
    - `packages/backend/src/services/events/alert-events.ts`
    - Prisma model: `packages/backend/prisma/schema.prisma` (`model Alert`)

- Frontend AlertService (singleton)
  - Centralized API/service for alerts in the browser.
  - Manages a single `EventSource` connection and multiplexes messages to subscribers.
  - Now caches the latest snapshot and replays it to late subscribers so they always receive an "initial" state.
  - File: `packages/frontend/src/services/alert/index.ts`

- Frontend hook `useAlerts`
  - Subscribes to AlertService and manages local state: `alerts`, `unreadCount`, `isLoading`.
  - Sets `isLoading=false` upon receiving `type: 'initial'` or `type: 'error'`.
  - File: `packages/frontend/src/hooks/alerts/useAlerts.ts`

- UI components (Shadcn)
  - Alerts Button: `packages/frontend/src/components/dashboard/alerts/alert-button.tsx`
  - Alerts Dialog: `packages/frontend/src/components/dashboard/alerts/alert-dialog.tsx`
  - Alerts Card/List: `packages/frontend/src/components/dashboard/alerts/alert-list.tsx`

## Recent Fix (Snapshot Cache + Replay)

Problem: The Alerts modal could remain stuck on "Loading alerts..." when it subscribed to the shared EventSource after the initial snapshot had already been sent to existing subscribers.

Changes implemented (Approach #1):
- Frontend AlertService now caches the last snapshot `{ alerts, unreadCount }` and immediately replays it to any new subscriber as an `initial` event. This guarantees every consumer receives an initial state regardless of when it subscribes.
- The service also updates the cache on `new` and `update` events to keep it consistent for future subscribers.
- The hook `useAlerts` now handles `{ type: 'error' }` from SSE, clears the loading state, and surfaces a user-friendly toast (via centralized message service).

Impacted files:
- `packages/frontend/src/services/alert/index.ts` (added `lastSnapshot` caching and replay)
- `packages/frontend/src/hooks/alerts/useAlerts.ts` (handle `type: 'error'`)

## Additional Hardening (Auth + Error Propagation)

- SSE auth handling
  - With `FORCE_AUTH=true`, the backend requires credentials for SSE. The frontend passes a base64 token via the `auth` query param. This token is now URL‑encoded to avoid edge cases with special characters in query strings.
  - File: `packages/frontend/src/services/alert/index.ts` (encode `auth` via `encodeURIComponent`).

- Propagate SSE connection errors to subscribers
  - Previously, network/auth failures triggered `eventSource.onerror`, but subscribers were not notified, leaving `useAlerts` stuck in a loading state.
  - The service now forwards a synthetic `{ type: 'error', message }` event to all subscribers when `onerror` fires, allowing `useAlerts` to clear loading and show a centralized toast.
  - Additionally, the last error message is cached and replayed to any new subscriber that joins before a valid snapshot is available, ensuring late subscribers don’t remain in a loading state after a prior connection failure.
  - File: `packages/frontend/src/services/alert/index.ts` (emit `type: 'error'` on `onerror`).

## REST Fallback for Initial State

- To ensure the Alerts UI initializes even if SSE is delayed or blocked (e.g., by proxies or network quirks), the frontend AlertService now performs a one-time REST request to `/api/alerts` to obtain the initial snapshot when neither a snapshot nor an error exists at subscription time.
- The fetched snapshot is cached and broadcast to all current subscribers as an `initial` event.
- This preserves the single-connection pattern for realtime updates while providing a robust first render path.
- File: `packages/frontend/src/services/alert/index.ts` (one-time `ensureInitialSnapshot()` on subscribe when needed).

## Behavioral Notes

- Late subscribers (e.g., the Alerts dialog opened after the Alerts button mounts) are hydrated instantly from the cached snapshot and will not get stuck in a loading state.
- The cache holds up to the first page of alerts (server streams 20 by default). New alerts are prepended and the list is bounded to 20 entries for consistency with the initial snapshot.
- Unread count is maintained in the cache on `new` and decremented on `update` when a previously unread alert becomes read.

## Error Handling

- Backend may emit `{ type: 'error', message }` if the initial snapshot fails. The hook now sets `isLoading=false` and shows a centralized, ASK-compliant toast advising the user to retry or contact the administrator if the issue persists.

## Established Patterns

- This change stays within the existing pattern of a centralized, singleton service managing one EventSource connection and fanning out events to subscribers.
- UI remains in Shadcn components; no styling or layout changes.
- Error messaging continues to use the centralized message/toast service.
