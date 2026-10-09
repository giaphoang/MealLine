# MealLine

One call. Food right next door.

MealLine connects phone and text food requests to a pantry dashboard for inventory, household baskets, deliveries, and analytics. It combines a Pipecat voice agent with FEED pantry management to reduce technology, language, and accessibility barriers to food support.

## Quick start

Install **Node.js 24 or newer**, then run these commands from the project folder:

```sh
bash setup.sh
npm run build
npm run dev:local
```

Open [localhost:3003/feed/login](http://localhost:3003/feed/login) and click **Sign in as developer**.

Setup installs dependencies, creates the SQLite database, and adds sample food items on a fresh install. No `.env` file, PostgreSQL, email service, or AI keys are needed for this local dashboard. PDF exports use Chrome/Chromium; setup reuses an installed browser or lets Puppeteer download one.

This starts the staff dashboard, not the phone agent. Developer sign-in can change saved data: keep this server local and do not expose or tunnel it.

Stop with `Ctrl+C`. To run it again, use `npm run dev:local`.

## Environment variables and API keys

Skip this section for the local developer dashboard. Configure only the features you need; create the files below locally and merge settings if a file already exists.

| Feature | Environment file | Credentials |
| --- | --- | --- |
| Staff email sign-in | `.env.local` in the project root | Resend API key and verified sending address |
| Phone calls and verification | `mealline/.env` | Twilio Account SID, Auth Token, phone number, and Verify Service SID |
| Pipecat speech and extraction | `mealline/voice_agent/.env` | OpenAI, Deepgram, and Cartesia API keys |

For staff email sign-in, create `.env.local` with your own values:

```dotenv
NOURISH_ADMIN_EMAIL=you@your-organization.org
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM="MealLine <signin@your-organization.org>"
NOURISH_APP_URL=http://localhost:3003/feed
```

Create the key in [Resend](https://resend.com/docs/dashboard/api-keys/introduction), [verify your sending domain](https://resend.com/docs/dashboard/domains/introduction), then run `npm run setup` and `npm run dev` to use normal email sign-in.

For calling, follow the [copyable phone and voice environment examples](docs/setup.md#phone-and-voice-environment), including where to get each key and how to connect the services. Dashboard translation keys are configured separately in **AI Configuration** inside the staff app.

Keep environment files private, never commit keys, and restart affected services after changes. Do not copy the root `.env.example` unchanged: its `DATABASE_URL` triggers a legacy PostgreSQL import. Existing `NOURISH_*` names are kept for compatibility.

## How it works

- People request food by phone or text; verified callers can check status and update household details.
- Matching considers household size, dietary needs, kitchen equipment, and available stock.
- Staff review and approve draft baskets. Packing checks and deducts stock once.
- Staff assign and complete deliveries; household records and analytics reflect the outcome.

## Optional phone and voice setup

Client phone self-service is disabled by default. Phone and voice use separate setup: the `mealline/` app, PostgreSQL, Twilio, a Python Pipecat gateway, speech/model provider credentials, and HTTPS.

Follow the [client phone guide](docs/client-phone-interface.md) for configuration and rollout safety, and the [Pipecat guide](mealline/docs/pipecat.md) for streaming voice. The dashboard quick start does not activate calling or notification workers.

## Useful commands

- `npm run build` — rebuild after source changes.
- `npm test` — run automated checks using isolated test data.
- `npm start` — run in production mode, with developer sign-in disabled. [Configure staff sign-in first](docs/setup.md#staff-sign-in).

## Built with

React, Vite, Express, Prisma, SQLite, Next.js, TypeScript, PostgreSQL, Python, Pipecat, Twilio, Deepgram, Cartesia, and OpenAI. FEED 1.8.1 is retained in `vendor/feed`; the phone app lives in `mealline/`.

## Documentation

- [Detailed setup, configuration, and recovery](docs/setup.md)
- [Successful calls and obstacle handling](docs/call-examples-and-obstacle-handling.md)
- [Architecture and verification limits](docs/feed-integration.md)
- [Note for hackathon judges and organizers](docs/hackathon-organizer-note.md)

This is a prototype, not a production-readiness guarantee. Live provider validation and existing frontend type-check issues remain; see the verification notes above.

## License and attribution

AGPL-3.0-or-later. FEED's license and author credits are retained. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). Each successful build includes a corresponding-source download at `/source`.
