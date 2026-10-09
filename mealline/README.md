# MealLine — Accessible Food Delivery Assistance

Request pantry delivery assistance through an ordinary phone call or an
accessible text form. One question at a time, English or Vietnamese. Staff
review every request; approval, notification, and fulfillment are tracked
separately. **A received request is not a confirmed delivery.**

> **Demonstration build** (Hack Away Hunger, Oct 2026). The pantry provider,
> people, phone numbers, and requests are synthetic. There is no real pantry
> integration and no pilot agreement.

## What was built (P0)

- **Accessible text intake** (`/intake`): conversational, one question at a time,
  keyboard + screen-reader friendly (`aria-live` replies, labeled controls,
  visible focus). Same conversation controller as the phone line.
- **Phone intake** (`/api/voice/*`): Twilio Programmable Voice, turn-based
  TwiML `Gather` (speech + keypad), signed webhooks, human transfer via `Dial`
  to an allow-listed staffed number, status callbacks. Two failed inputs →
  transfer/callback. `person` / `gặp nhân viên` / `0` → human.
- **Text simulator** (`/simulator` and `/api/sim/turn`): same controller,
  **labeled SIMULATED** everywhere — for reproducible tests and demos without
  a phone network.
- **Conversation controller** (`lib/controller.ts`): step enforced server-side,
  language carried through every turn, read-back before confirm, corrections
  update the draft (never a master record silently).
- **Model port** (`lib/model.ts`): the controller asks a model to interpret one
  turn into structured fields, then validates and dispatches only allow-listed
  tools. Default is a deterministic implementation (reproducible, offline);
  set `MEALLINE_MODEL_URL` (+`MEALLINE_MODEL_KEY`) to plug in an HTTP model —
  any failure falls back to fixed questions.
- **Staff dashboard** (`/staff`): queue (needs review / follow-up due /
  approved) with age, language, owner, next action; case detail (verified facts,
  unknowns, rule check, proposals, bookings, notification attempts, event
  timeline); approve panel with staff checks, expected-version, idempotency key;
  claim, no-capacity follow-up, and explicit outcome recording.
- **Approval transaction** (`lib/approval.ts`): authorize → `SELECT … FOR UPDATE`
  on case + slot → recheck capacity → reserve + booking + outbox job in **one
  transaction**. Concurrent approvals cannot overbook the last slot. Repeated
  approvals with the same idempotency key return the one booking.
- **Worker** (`npm run worker`): claims outbox jobs with leases
  (`FOR UPDATE SKIP LOCKED`), sends approved updates via templated messages,
  bounded retries with backoff, exhausted retries become visible follow-up work.
  Notification state is separate from fulfillment. Voicemail gets a redacted
  template (no address/phone/details).
- **Applicant status page** (`/status/[token]`): high-entropy link, hashed at
  rest, expiring, revocable. Minimal view — no address or phone numbers.
- **Versioned demo policy**: service area, required fields, dated rules. The
  demo policy sets **no** income/age/disability/ID requirements. Unknown or
  ambiguous details go to staff review, never auto-rejection.

## Quick start

For the streaming voice integration and existing Twilio/Cloudflare setup, see
[the Pipecat adapter guide](docs/pipecat.md). It keeps the MealLine controller
and staff-approval rules, and reuses the installed MealLine Python environment.

```bash
# 1. PostgreSQL 16 (this repo's scripts assume the shared local instance)
scripts/start-postgres.sh
createdb -h 127.0.0.1 -U foodfit mealline   # as a superuser, if needed

# 2. Configure
cp .env.example .env   # set MEALLINE_DATABASE_URL

# 3. Migrate + seed (synthetic provider, policy v1, 4 slots, staff accounts)
npm install
npm run migrate
npm run seed

# 4. Run
npm run dev        # web + API on http://localhost:3000
npm run worker     # background notification/follow-up worker (separate terminal)
```

Demo sign-in (synthetic accounts, documented here on purpose):

| Email | Password | Role |
|---|---|---|
| `coordinator@demo.local` | `coordinator-2026-demo` | coordinator — can approve |
| `staff@demo.local` | `staff-2026-demo` | staff — view, claim, record outcomes |
| `coord@riverside.local` | `riverside-2026-demo` | other org — for the authz demo |

## Verify

```bash
npm run typecheck   # tsc --noEmit
npm test            # isolated database schema; business + Pipecat adapter tests
npm run build       # production build
npm run eval        # scripted runs + docs/evaluation-report.md with real numbers
```

Optional telephony (not required for the demo):

```bash
TWILIO_ACCOUNT_SID=… TWILIO_AUTH_TOKEN=… TWILIO_FROM_NUMBER=+1…
PUBLIC_BASE_URL=https://your-public-https-host
```

Without these, voice webhooks return an honest error and the simulator is the
voice path. Inbound voice also needs a public HTTPS URL for Twilio webhooks.

## Repository map

```
app/                  Next.js pages + API routes
  intake/             accessible text intake (client, aria-live)
  status/[token]/     applicant status page (minimal view)
  staff/              queue, case detail + approve panel, login
  simulator/          SIMULATED conversation console
  api/sim|intake|voice|status|staff/
lib/
  controller.ts       conversation controller (shared by voice/text/sim)
  model.ts            model port: deterministic default, HTTP plug-in
  tools.ts            allow-listed tool dispatcher (rejects unknown tools)
  cases.ts            case lifecycle, rule checks, options, proposals, outcomes
  approval.ts         atomic approval transaction + idempotency
  notify.ts           outbox worker logic (leases, retries, redacted voicemail)
  voice.ts            voice port: SimVoice (scriptable) / TwilioVoice
  statusLinks.ts      high-entropy expiring status links
i18n.ts             English + Vietnamese strings (VI pending fluent review)
db/migrations/        PostgreSQL schema
scripts/              migrate, seed, reset-demo, worker, eval, start-postgres
tests/                24 tests mapping to the 12 proposal scenarios
docs/                 evaluation report, demo script, architecture notes
```

## Honest limitations (what is NOT done)

- **No real telephony exercised.** Twilio adapters are implemented (signed
  webhooks, TwiML, transfer, status callbacks) but never called against the
  real network here — no credentials, no public HTTPS webhook, no test-call
  capability in this environment. The demo voice path is the simulator.
- **Vietnamese voice unverified.** ASR/TTS support for Vietnamese in the
  deployed configuration was not tested; the Vietnamese path is demonstrated
  via text. The Vietnamese *wording* is written but **not yet reviewed by a
  fluent speaker** — do not claim validated Vietnamese support.
- **Model extraction is deterministic** in this build. The HTTP model port
  exists but is untested against a live model.
- **No SMS channel** (cut per the proposal's time-slip list). Status-link and
  voice-callback only.
- **UI keyboard/screen-reader walkthrough by code inspection only** — needs a
  real device/browser check.
- **No pilot metrics.** Handling time, fulfillment rate, and cost need a real
  pilot; this repo claims none.
- Secondary P1 workflows (missed delivery, address change, rescheduling) are
  modeled in the schema (`type` field) but not built out.

See `docs/demo-script.md` for the 3-minute demo and
`docs/evaluation-report.md` for measured results.
