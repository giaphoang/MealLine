# MealLine Pipecat adapter

Pipecat handles streaming speech; MealLine remains the authority for intake,
validation, case creation, human handoff, staff approval, and notifications.
The existing Twilio number and `/api/voice/inbound` webhook path are retained.

```text
Twilio +1 331 309 5376 → existing Cloudflare host → gateway :7860
  HTTP webhooks/pages → MealLine Next.js :3000
  signed WebSocket   → Pipecat speech → MealLine controller/allowed tools
```

Language selection starts in the existing signed Twilio Gather. English and
Spanish then enter Pipecat. Vietnamese stays on the existing TwiML voice path:
the selected Nova-3 streaming configuration is not suitable for Vietnamese.
Stream failure, completion, or a human request returns to MealLine-authored
TwiML. No Pipecat REST dialing or call hangup is used.

## Local setup and start

From `~/Documents/mealline`, with the existing database and `.env` preserved:

```bash
# Copy only existing speech/model provider settings; keep MealLine's Twilio keys.
node scripts/setup-agent.mjs ../nourish/agent/.env

# Add the replay-receipt table. Do not seed or reset an existing database.
node --env-file=.env --import tsx scripts/migrate.ts

# Terminal 1: web/controller, loopback only (build once before production start).
npm run build
npm start -- --hostname 127.0.0.1 --port 3000

# Terminal 2: voice gateway, loopback only.
npm run agent
```

`voice_agent/run.sh` reuses the installed MealLine Python environment when
available; there is no second large virtual environment. Set
`MEALLINE_AGENT_PYTHON` explicitly for another installation. Requirements are
pinned to the installed Pipecat version in `voice_agent/requirements.txt`.

The setup script creates a private shared `MEALLINE_AGENT_KEY` and enables
`MEALLINE_VOICE_TRANSPORT=pipecat`. Both `.env` files are owner-readable only.
No browser/developer JWT or FEED API token is needed. Do not commit either file.
Restore the legacy voice path with `MEALLINE_VOICE_TRANSPORT=twiml` and restart
MealLine; other business logic and data stay unchanged.

`http://127.0.0.1:7860/agent/health` reports configuration readiness only, not
proof that the paid speech providers or a real phone call work.

## MealLine staff-workspace intake sync

The bridge requires `NOURISH_API_URL` and `NOURISH_VOICE_API_TOKEN` in MealLine's
private `.env`. It sends the service token as `x-nourish-voice-token`, not a browser
JWT, Twilio Auth Token, or the Pipecat `MEALLINE_AGENT_KEY`. To connect the local
staff-workspace installation, run from the `mealline/` phone app (pass the actual workspace directory):

```bash
node scripts/setup-nourish.mjs /Users/zap/Documents/nourish
# Restart the MealLine web/controller to load the updated .env.
```

This reuses the effective token from MealLine's environment or private runtime
state, verifies authentication with an invalid empty payload (no intake created),
and sets owner-only permissions on MealLine's `.env`. It never rotates or prints
credentials. Only caller-confirmed intakes are submitted, creating/updating a
MealLine intake and draft shopping list; approval, stock deduction, and delivery
remain staff-controlled. Partial or abandoned calls are not synced.

Requests have a five-second timeout, do not follow redirects with the token, and
record only sanitized failure codes. Sync is still best-effort: MealLine downtime
is visible as `nourish_bridge_failed` in the case timeline, but there is no durable
retry queue or historical-intake backfill. Transcripts are still not forwarded.

## Connecting the existing phone line

The Cloudflare tunnel origin must be **127.0.0.1:7860**, not port 3000, so HTTP
webhooks and secure WebSockets share the same public hostname. Keep the number's
inbound path `/api/voice/inbound` and POST method, and the original status path.
With an existing named tunnel, keep its hostname and change only its local
origin after approval. A stopped quick tunnel cannot generally reclaim its
random hostname; a new hostname requires updating Twilio and `PUBLIC_BASE_URL`.
Do not assume an old `trycloudflare.com` URL remains usable.

The notification worker is a separate opt-in process:

```bash
node --env-file=.env --import tsx scripts/worker.ts
```

Starting it can send queued real calls/SMS. Review the queue and recipients
before starting it. The existing demo transfer destination is synthetic; a
real staffed destination must be configured separately, never model-selected.

## Security and verification

Every stream requires the Twilio handshake signature and a one-hour,
session/CallSid-bound HMAC capability issued by MealLine. The start event must
match the configured account, call, and 8-kHz mono μ-law format. Agent APIs do
not accept developer-mode authentication. Gateway access logs are disabled so
capability URLs are not logged.

Each turn carries a request UUID and expected intake step. Persisted receipts
deduplicate retries; per-session locks reject overlapping mutations. Extraction
uses [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat),
then MealLine validates the proposal and limits fields to the current step.
Model refusal/failure falls back to MealLine's deterministic interpreter.
Review confirmation additionally requires an explicit caller affirmative.
The agent cannot approve a delivery or choose an arbitrary transfer number.

```bash
npm test                  # all tests use a temporary schema, never real records
npm run typecheck
PYTHONDONTWRITEBYTECODE=1 ../nourish/agent/.venv/bin/python -m unittest voice_agent.test_agent
```

Verified locally: 43 MealLine/adapter/MealLine tests, 14 offline Python tests,
TypeScript check, and production build. MealLine's isolated SQLite integration
tests also pass, and the live bridge authenticates with an intentionally invalid
fixture that creates no intake. Paid-provider audio, real Twilio call quality,
Vietnamese speech quality, and actual staffed transfer remain unverified.
Caller transcripts still follow MealLine's existing persistence behavior;
define a retention/consent policy before a real deployment.

The public gateway blocks `/api/admin/*`, including the legacy demo endpoint
that reads transcripts, dispatches notifications, and applies migrations
without authentication. The staff UI remains available with its existing
authentication. Do not expose Next.js port 3000 directly: the demo endpoint
still exists there for local use.

The configured OpenAI key's live synthetic test returned HTTP 429 with
`credit_balance_exhausted`. Until that account has usable API credit or a
working provider is configured, extraction uses the deterministic fallback.
On October 8, 2026 a replacement quick tunnel was started to port 7860; public
health and staff login respond, demo administration is blocked, and unsigned
voice webhooks are rejected. Its temporary hostname is in the session output
and is valid only while the tunnel process runs. With approval, Twilio's inbound
voice and existing call-status webhooks were updated to that hostname, preserving
their paths and POST methods. The settings were read back from Twilio and signed
requests without a CallSid verified both routes without creating a call or intake.
An actual end-to-end call and paid-provider audio remain unverified. The MealLine
bridge now sends its separate service token; setting `NOURISH_API_URL` alone still
does not authorize an intake POST. See the local setup above.

The temporary tunnel later lost connectivity: its metrics showed zero active
connections and the public hostname returned NXDOMAIN even though the local
gateway stayed healthy. It was replaced with a new quick tunnel to port 7860,
using HTTP/2 and loopback-only metrics on port 20242. DNS, public health, signed
voice/status routes, and rejection of unauthorized WebSocket requests were
verified before changing Twilio's two callbacks and `PUBLIC_BASE_URL`. The failed
old process was retired individually; no global process kill, provider-key
rotation, database reset, or notification dispatch was used. The current public
hostname is in MealLine's private `.env`.

Keep the Mac and tunnel running for testing. This is still a temporary URL,
not a permanent deployment or proof of live AI/audio readiness. For ongoing
phone routing, use an authenticated named Cloudflare tunnel with a stable host.
