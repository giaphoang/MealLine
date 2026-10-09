# Client phone interface

MealLine is the current project name. The staff backend still uses the existing
legacy `Nourish*` tables, `/api/nourish` staff routes, `NOURISH_*` settings and `.nourish`
storage for compatibility. The separate `mealline/` application owns calls and
the phone outbox, not delivery approval.

The implementation is installed with `NOURISH_CLIENT_PHONE_ENABLED=false`.
Preparing configuration does not activate it or start a notification worker.

## Where information goes

| Caller action | Staff destination | What it does not do |
| --- | --- | --- |
| Confirm a new food request | Clients household, Voice Intakes, draft Household Basket | Approve food, reserve a MealLine booking, or promise delivery |
| Read delivery status after OTP | Current MealLine basket/delivery state | Trust caller ID or an old local case status |
| Confirm a profile correction | Versioned client profile and revision history | Silently overwrite a newer staff edit |
| Change dietary/kitchen needs | Profile plus safety hold and staff follow-up for active requests | Modify an already packed basket or refund stock |
| Request a delivery change or cancellation | Clients → Changes & missed deliveries | Change an in-transit delivery automatically |
| Report a missed delivery or ask for a person | Staff follow-up; failed transfers remain visible | Treat a connection attempt as recipient acknowledgement |
| Disconnect before confirmation | Clients → Call drafts & history | Create a food request or count the household as served |
| Opt in to updates | Verified phone, explicit consent, dedicated notification queue | Send private information to voicemail |

The Clients analytics lens has a separate MealLine source section.
Registrations, requests and actual completed deliveries are different counts.
Imported Link2Feed/SIMC records remain separate. Missing fields stay unknown;
call language is not a household-demographics assessment. Dates use the pantry
timezone, including delivery readbacks.

## Caller flow

1. Choose English, Spanish or Vietnamese, then accept the automated-assistant
   privacy notice. Declining goes to a person without retaining the caller's
   unconsented answer text.
2. Choose 1 new food request, 2 status, 3 profile update, 4 delivery change,
   5 missed delivery, or 0 a person. Repeat requests are supported.
3. Returning households provide the registered number and complete OTP before
   any private record is opened. Shared numbers also require the household's
   ten-digit reference. Unknown references/lost-phone access go to staff.
4. A new household gives essential contact/address/household/food/kitchen/
   availability information. Each extraction is scoped to the question asked;
   authorization, identity, consent and confirmation are server decisions.
5. Choose SMS verification or a voice-code callback. For a callback, hang up;
   the signed parent-call end event allows the dedicated worker to call. Then
   call back, choose the original option and enter the registered number.
6. Choose automatic texts, generic callback reminders, or no updates. Listen
   to the readback and explicitly confirm. Corrections ask only for the selected
   field. The new-household receipt reads its ten-digit reference: keep it.
7. Verified existing households can explicitly resume an interrupted draft.
   Its original version is preserved: conflicting staff edits become follow-up
   tickets, not overwrites. Unverified anonymous drafts stay available to staff;
   they are not disclosed through a guessed number.

Changing a registered phone requires verification of the old number and the
replacement number. The landline callback path verifies the old number again
on the returning call before resuming the replacement-number challenge.

OTP codes are six digits. Resends wait at least 60 seconds, requests are capped
at five per hour per contact, and three incorrect entries lock the number for
15 minutes. Grants are call-bound and expire after ten minutes. Codes do not
enter the model, conversation text, URLs or diagnostic fields.

English/Spanish use Pipecat when streaming is available. Vietnamese retains the
existing TwiML fallback. Authored prompts are in `mealline/lib/phonePrompts.ts`;
existing individual intake questions are in `mealline/lib/i18n.ts`. The state
machine is `mealline/lib/phoneFlow.ts`; field extraction is in
`mealline/voice_agent/extraction.py`. Spanish/Vietnamese prompts still need
fluent-speaker acceptance testing before a public pilot.

## Staff workflow

Open `http://localhost:3003/feed/clients` after normal staff sign-in or the
explicit localhost developer sign-in.

- Households: view/edit essential fields, reference, verification state,
  requests, calls and revisions. Creating a profile is not a request. Staff
  phone edits clear verification. Explicit merges keep the selected target's
  profile/consent; shared numbers never cause an automatic merge.
- Call drafts & history: view partial, abandoned, confirmed and follow-up text.
- Changes & missed deliveries: review a request with an audit note. Conflicting
  edits require editing the latest client version, then resolving the ticket.
- Phone synchronization: see pending/failed/review jobs and retry eligible
  MealLine synchronization. Uncertain provider sends are not auto-retried.

Continue approval, packing, volunteer assignment, scheduling and completion in
the existing MealLine workspaces. Requests and approvals do not count as served.
Food/kitchen safety holds block dispatch. If a packed basket is unsuitable,
check/reconcile physical Inventory, create the explicit safety-review draft,
review/repack it, and resolve the hold. The original basket stays historical;
the system never automatically returns packed stock.

## Private configuration

From the workspace root:

```sh
npm run phone:prepare
npm run phone:check
```

`phone:prepare` copies the separate agent service key into `mealline/.env`,
preserving existing OpenAI/Twilio/provider keys and making a private environment
backup. Mismatched existing service keys are refused, not overwritten. Restart
the staff backend and phone application after preparation.

| Setting | Location/purpose |
| --- | --- |
| `NOURISH_CLIENT_PHONE_ENABLED` | Staff backend `.env.local` and phone `mealline/.env`; both must agree; default false |
| `NOURISH_AGENT_API_TOKEN` | Staff runtime/generated `agentToken` and phone `.env`; dedicated 32+ character client-service key |
| `NOURISH_API_URL` | Phone `.env`; staff API origin, normally `http://127.0.0.1:3003`, without `/feed` |
| `NOURISH_MEALLINE_URL` | Staff backend; private queue-diagnostics origin, default `http://127.0.0.1:3000` |
| `TWILIO_VERIFY_SERVICE_SID` | Phone `.env`; a Verify service configured for six digits and SMS/voice |
| `PUBLIC_BASE_URL` | Phone `.env`; stable public HTTPS voice origin, matching Twilio webhook signature checks |
| `MEALLINE_AGENT_KEY` | Existing shared phone/gateway key; unchanged, not the staff client-service key |
| `CLIENT_PHONE_VOICE_SPEED` | `mealline/voice_agent/.env`; default 0.8, bounded 0.6–1.0, client flow only |
| `CLIENT_PHONE_SENTENCE_PAUSE_SECONDS` | Gateway `.env`; default 0.6, bounded 0.3–1.5, client flow only |

The ingestion-only `NOURISH_VOICE_API_TOKEN` still serves the legacy voice
intake endpoint; it cannot replace the client-service key. Neither key is a
staff JWT. Provider credentials remain only in their existing private files.

Configure the six-digit service in the [Twilio Verify service settings](https://www.twilio.com/docs/verify/api/service).
Its [voice verification channel](https://www.twilio.com/docs/verify/authentication-channels)
uses `call`, not `voice`. No Verify service is provisioned by setup.

## Activation and operating safety

Before separately authorizing a live pilot, supply the Verify SID, replace the
seeded synthetic transfer number with a real staffed line, review the authored
languages, and establish stable HTTPS plus process supervision. The current
quick Cloudflare tunnel is temporary. Do not publish the development staff
server or its localhost developer-login shortcut.

Only after that approval, set both rollout flags true, restart the apps, then
run the **dedicated** worker from `mealline/`:

```sh
npm run worker:phone
```

This worker never claims `outbox_jobs`. Do not use the legacy `npm run worker`,
demo reset/seed scripts, or `run-phone-test.sh` for this pilot: they can process
existing demo jobs or reset data. The existing Twilio number/webhook is not
rewritten by configuration preparation.

The dedicated PostgreSQL outbox replays immutable MealLine command IDs with
bounded backoff. Conflicts/auth failures require review. MealLine's durable
event cursor deduplicates updates; sending checks current consent/verification
and coalesces a backlog to the latest status. Callback reminders have no name,
address, case number, dietary detail or other private content. Provider
acceptance is not recipient acknowledgement. Staff retry applies to sync only;
uncertain external sends need manual reconciliation.

Application call text expires after 30 days, including queue/intake copies.
Essential profiles and audit/delivery history remain. This application does not
record call audio; third-party provider retention is a separate deployment
privacy decision. Retention runs even with the rollout flag off.

## Verification and recovery

```sh
npm test
npm run test:browser
cd mealline
npm test
../agent/.venv/bin/python -m unittest voice_agent.test_agent
```

Tests use new temporary SQLite databases and isolated local PostgreSQL schemas.
Verification/notifications are simulated; no calls, texts or paid AI requests
are sent. The cross-database test exercises the real controller, durable
outbox, HTTP API, fulfilment, fresh verified status and consent-driven events.
The frontend production bundle builds, but the inherited 381-error TypeScript
backlog is not fixed or hidden by raising its ratchet baseline.

Before migration, private source/SQLite/PostgreSQL snapshots were stored in
`/private/tmp/nourish-client-phone-09Ly7Y`. Configuration preparation prints a
separate private environment-backup folder. Copy those to secure durable
storage before relying on them for production recovery; temporary directories
are not a long-term backup strategy. Never expose credential-bearing backups
as public downloads.

The sanitized in-app backup contract includes client profiles/revisions,
retained call text, follow-ups, delivery events and fulfilment links. It excludes
agent replay receipts and verified-phone authority. Restore clears old receipts
and requires fresh verification. Stop the phone worker and disable new phone
traffic before coordinated recovery; reconcile pending jobs before restarting
it. Inventory/basket identity and foreign-key checks still run. Raw database
rollback must account for writes in both systems; do not blindly unpack the
source snapshot over concurrent project edits.
