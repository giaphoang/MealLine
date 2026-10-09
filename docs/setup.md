# MealLine setup and operations

For the shortest local setup, use the [README quick start](../README.md#quick-start). This guide covers optional configuration and operating safeguards.

## Local dashboard

Use Node.js 24 or newer and a Bash shell. From the repository root:

```sh
bash setup.sh
npm run build
npm run dev:local
```

Open <http://localhost:3003/feed/login> and choose **Sign in as developer**. Setup installs dependencies, generates runtime secrets, applies database migrations, seeds reference data, and adds six sample food items if the inventory is empty on a fresh installation. No email or paid AI provider is needed for this path.

Stop with `Ctrl+C`; restart with `npm run dev:local`. Rebuild after frontend or backend changes. `npm run dev:frontend` optionally starts Vite after the API is running; use its `/feed/` URL and normal staff authentication, not the separate-origin developer shortcut.

Do not copy `.env.example` unchanged for the local dashboard. Its `DATABASE_URL` is an optional legacy PostgreSQL import source, not the dashboard database. With that setting present, setup attempts an import unless `NOURISH_SKIP_LEGACY_IMPORT=true`.

### Developer sign-in safety

The local shortcut edits the current saved database; it is not a disposable sandbox. Do not expose or tunnel this development server.

The shortcut requires development mode, an explicit flag, loopback access, and a same-origin localhost request. Proxy/forwarded and cross-site requests are refused. Its one-hour HttpOnly session is development-only and is rejected when the mode is disabled. `npm start` always disables the shortcut, including when `NOURISH_DEV_LOGIN=true` is configured.

Clicking the button creates an audited `local-developer@nourish.localhost.invalid` identity. It is persisted as Staff; administrator authority exists only in the scoped developer session. Permanent promotion is refused, and a revoked developer identity is not silently reactivated. Configure a real administrator before deployment.

### PDF browser

Setup reuses an installed Puppeteer headless shell or Chrome/Chromium. If none is found, Puppeteer's dependency installer normally downloads a browser. The first install needs network access. A nonstandard browser can be selected with `PUPPETEER_EXECUTABLE_PATH`; it must point to an executable. An invalid explicit path fails rather than silently selecting a fallback.

## Staff sign-in

For normal email OTP/magic-link authentication:

1. Create a [Resend API key](https://resend.com/docs/dashboard/api-keys/introduction) with email-sending permission.
2. [Verify your sending domain](https://resend.com/docs/dashboard/domains/introduction) and choose a sender on that domain for `EMAIL_FROM`.
3. Create `.env.local` in the repository root with your own values. If it already exists, merge these settings rather than replacing the file.

```dotenv
NOURISH_ADMIN_EMAIL=you@your-organization.org
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM="MealLine <signin@your-organization.org>"
NOURISH_APP_URL=http://localhost:3003/feed
```

Use a verified sending address. Keep secret keys out of chat, source control, and exported application backups. `.env.local` takes precedence over `.env`.

Optionally set `STAFF_EMAIL_DOMAINS` to comma-separated organization domains without `@`. Otherwise new installations use roster allowlist mode. Choose the administrator and access policy before setup; existing installations retain their configured policy. The initial administrator setting creates an allowed account, not a verified mailbox, and setup does not send email. Existing-account recovery uses the upstream backend operator CLI with the MealLine runtime environment.

After adding configuration, run `npm run setup` to register a new administrator, then `npm run dev` for normal local authentication. `npm start` uses production mode but still listens only on loopback. Neither command deploys the application; publishing it needs a separate secure deployment and process-supervision plan. Set `NOURISH_APP_URL` to the eventual public URL, including `/feed`, for correct email links.

AI provider keys, models, limits, and prompts are configured in the staff workspace's AI Configuration screen. Provider-backed translation needs real credentials; local dashboard access does not.

For dashboard translation, open **AI Configuration**, select the provider you intend to use, and enter that provider's API key there. The voice gateway's keys below are separate; putting `OPENAI_API_KEY` in the root `.env.local` does not configure FEED's translation provider.

## Phone and voice

The separate `mealline/` application owns calls and the PostgreSQL phone outbox; the staff backend owns basket approval and fulfillment. See the [client phone guide](client-phone-interface.md) and [Pipecat adapter guide](../mealline/docs/pipecat.md) before configuring services.

### Phone and voice environment

The staff dashboard, phone app, and voice gateway do not share one environment file. Create the two files below locally, or merge values into existing files. All examples are placeholders: replace them with your own credentials. Do not put phone database settings in the root `.env.local`.

Get credentials from the provider accounts you intend to use:

| Provider | What to obtain | Where to configure it |
| --- | --- | --- |
| [Twilio](https://www.twilio.com/docs/usage/requests-to-twilio#use-your-account-sid-and-auth-token) | Account SID and Auth Token from your account; a voice/SMS-capable Twilio number for `TWILIO_FROM_NUMBER` | `mealline/.env`; the adapter preparation command copies SID/token to the gateway |
| [Twilio Verify](https://www.twilio.com/docs/verify/api/service) | A Verify Service SID, configured for six-digit SMS/voice codes | `TWILIO_VERIFY_SERVICE_SID` in `mealline/.env` |
| [OpenAI](https://developers.openai.com/api/docs/quickstart#create-and-export-an-api-key) | An API key created in the developer dashboard | `OPENAI_API_KEY` in `mealline/voice_agent/.env` |
| [Deepgram](https://developers.deepgram.com/docs/create-additional-api-keys) | A project API key created in the Deepgram Console | `DEEPGRAM_API_KEY` in `mealline/voice_agent/.env` |
| [Cartesia](https://docs.cartesia.ai/get-started/realtime-text-to-speech-quickstart) | An API key from the Cartesia dashboard | `CARTESIA_API_KEY` in `mealline/voice_agent/.env` |

Create `mealline/.env` using [the phone template](../mealline/.env.example) as a reference:

```dotenv
MEALLINE_DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@127.0.0.1:5432/mealline
PUBLIC_BASE_URL=https://your-public-voice-host.example
TWILIO_ACCOUNT_SID=AC_REPLACE_WITH_YOUR_ACCOUNT_SID
TWILIO_AUTH_TOKEN=replace-with-your-twilio-auth-token
TWILIO_FROM_NUMBER=+15555550123
TWILIO_VERIFY_SERVICE_SID=VA_REPLACE_WITH_YOUR_VERIFY_SERVICE_SID
NOURISH_CLIENT_PHONE_ENABLED=false
```

The PostgreSQL database must already exist; this connection string does not create it. Use your actual Twilio number in international format, including `+` and country code. `PUBLIC_BASE_URL` must be the stable HTTPS voice origin that routes to the gateway, not the staff dashboard or its developer-login server. Review webhook configuration in the Pipecat guide.

Create `mealline/voice_agent/.env` using [the gateway template](../mealline/voice_agent/.env.example) as a reference:

```dotenv
OPENAI_API_KEY=replace-with-your-openai-api-key
DEEPGRAM_API_KEY=replace-with-your-deepgram-api-key
CARTESIA_API_KEY=replace-with-your-cartesia-api-key
```

Optional model/voice settings are listed in the gateway template; the implementation also has defaults. Provider credentials and available account credit must support the configured models. Adding keys alone does not install the phone app or Python dependencies, migrate PostgreSQL, validate provider access, or activate a pilot.

### Prepare connections and check configuration

After the local dashboard setup and the two environment files above are ready, run from the repository root. The existing adapter helper requires the `apply_patch` command on your `PATH`:

```sh
cd mealline
node scripts/setup-agent.mjs voice_agent/.env
cd ..
```

This command reuses the supplied speech/model keys, copies Twilio SID/token from the phone app, and creates or reuses the same private `MEALLINE_AGENT_KEY` in both phone and gateway files. It also sets local service URLs and selects the Pipecat transport. It does not start services or enable client self-service.

Then, from the repository root:

```sh
npm run phone:prepare
npm run phone:check
```

`phone:prepare` connects the phone app to the staff backend using its generated, dedicated `NOURISH_AGENT_API_TOKEN` and `NOURISH_API_URL`. It preserves existing provider credentials, creates a private environment backup, and refuses mismatched existing service keys. This token is separate from `MEALLINE_AGENT_KEY` and the ingestion-only `NOURISH_VOICE_API_TOKEN`; do not substitute one for another.

`phone:check` reports missing phone configuration without making calls, sending messages, or enabling the rollout. It does not validate paid provider access. Once the gateway is installed and running, <http://127.0.0.1:7860/agent/health> checks that required settings are present, not that credentials work or a real call succeeds.

Keep all three environment files private. Never place secrets in `NEXT_PUBLIC_*` or `VITE_*` variables, screenshots, logs, or source control. Restart the affected applications after configuration changes. The staff loader prefers `.env.local` over `.env`; the gateway prefers `voice_agent/.env` over the phone app's `.env`, while already-exported process variables take precedence. Keep duplicate credentials consistent.

### Pilot activation

An authorized pilot needs stable HTTPS, a real staffed transfer number, language acceptance testing, and the dedicated `npm run worker:phone` worker from `mealline/`. Follow the activation checklist in the phone guide. Do not substitute the legacy worker, demo seed/reset scripts, or `run-phone-test.sh` for this pilot.

Client self-service remains off by default. Only after pilot approval, set `NOURISH_CLIENT_PHONE_ENABLED=true` in both the staff root `.env.local` and phone `mealline/.env`, restart services, and start the dedicated worker as described in the phone guide. Preparing keys does not provision Twilio Verify or change phone webhooks.

## Workflow and compatibility

The project is now MealLine; `NOURISH_*` settings, `/api/nourish` routes, `Nourish*` model names, and private `.nourish` storage are retained for compatibility. The original Next.js application is archived in `legacy/next`; it is not the active staff workspace.

| Original URL or workflow | Integrated destination |
| --- | --- |
| `/` | FEED dashboard with MealLine fulfillment metrics |
| `/inventory` | `/feed/food-items`, including exact quantity, unit, and equipment fields |
| `/intakes` | `/feed/intakes`, including household details and transcripts |
| `/shopping-lists` | `/feed/household-baskets` for household fulfillment |
| `/deliveries` | `/feed/deliveries` for assignment and scheduling |
| `GET/POST /api/food-items` | Legacy flat format over the shared inventory |
| `GET/POST /api/voice-intakes` | Original `{ intake, transcript }` intake format |
| FEED printable-list builder | `/feed/shopping-lists` and `/feed/shopping-lists/builder` |

Staff APIs require the workspace session. Legacy automated intake ingestion uses `x-nourish-voice-token`, scoped to `POST /api/voice-intakes`. Use `NOURISH_VOICE_API_TOKEN` or the generated `voiceToken` in `.nourish/runtime.json`, never the internal server credential. Client self-service uses a separate dedicated agent token, as described in the phone guide.

Matching is shared in `packages/core`: dietary-name/flag exclusions, kitchen-equipment checks, a 20-item default, and `ceil(householdSize / 2)` quantities capped by stock. Unknown equipment retains the original defaults. These are heuristic filters, not allergen certification; staff must review labels and household notes.

Repeated cases retain their canonical intake ID and reuse a draft basket. Retries never overwrite approved or packed fulfillment. Approval creates one delivery task; packing atomically checks suitability and stock, then deducts exact units once. Delivery completion updates the linked intake and basket; cancelled cases cannot be dispatched. Exact stock quantities are separate from FEED's optional estimated Supply annotations and printable-list limits.

## Data and recovery

The default canonical store is `.nourish/feed.db`. Runtime secrets and uploaded/generated storage also live under `.nourish`, which is excluded from source control. Preserve this directory and back it up securely for operator-level disaster recovery: it contains credentials and household contact information. Setup uses `.nourish/npm-cache` for dependency downloads; do not confuse this cache with business data.

When an original `DATABASE_URL` is configured, setup imports the five legacy PostgreSQL tables in a read-only, repeatable-read transaction. It preserves IDs, stock, dietary/equipment flags, contact and availability fields, transcripts, statuses, volunteer records, and delivery links. PostgreSQL remains unchanged as a rollback source, not an ongoing synchronized copy. An external import marker prevents a later setup from reviving deliberately reset data. A rollback must account for records created after migration.

In-app Data Management backups include MealLine client revisions, retained call text, follow-ups, delivery events, intakes, baskets, volunteers, and deliveries. Volunteer password hashes, verified-phone authority, and agent replay receipts are excluded. Pause the phone worker during recovery; restored contacts require fresh verification.

Restore validates pending basket food identities before swapping the database. For cross-installation recovery, select matching Inventory and MealLine fulfillment together; conflicting partial restores are refused without touching the live file. Historical packed/delivered baskets retain their snapshots even if a food was deleted. Treat downloaded backups as sensitive household data. See the [integration map](feed-integration.md) for schema and recovery boundaries.

## Verification

Run checks after setup and build:

| Command | Coverage |
| --- | --- |
| `npm test` | Shared matching, browser selection, configuration/branding, authentication, and isolated API/restore checks |
| `npm run test:smoke` | Isolated API and backup/restore checks |
| `npm run test:pdf` | API/restore checks plus real PDF generation |
| `npm run test:browser` | API/restore and built-frontend browser checks; artifacts in `.nourish/verification` |

These tests use temporary SQLite data, not the live store or retained PostgreSQL source. They do not certify paid providers or real phone calls. The backend is type-checked during setup and builds. At the documented integration checkpoint, both pinned upstream and this integration produced 381 frontend diagnostics against an unchanged baseline of 148: the strict frontend ratchet still fails even though Vite builds successfully.

See [completed checks and remaining limits](feed-integration.md#verification-checkpoint) and [call examples and obstacles](call-examples-and-obstacle-handling.md#current-verification-limits). Do not treat a successful build as production certification.
