# MealLine Pipecat voice agent

This service answers an inbound Twilio Media Stream, collects a food-assistance
intake, and persists a shopping list through MealLine's existing API. It is
isolated in `agent/`; it does not add MealLine routes, migrations, UI, or
authentication behavior.

## What it may call

The service account JWT in `FEED_API_TOKEN` is sent to these existing endpoints
only:

- `GET /api/food-items`
- `GET /api/shopping-lists/templates`
- `POST /api/shopping-lists/generate` with persist-only `generatedData`
- `GET /api/shopping-lists/instances/:id`

The local mounted FEED server uses `NOURISH_BASE_URL=http://localhost:3003/feed/api`.
MealLine's current JWT middleware reads the token from the `auth_token` cookie;
the client also sends a Bearer header for compatible deployments. `FEED_API_TOKEN`
must be a service-account JWT issued by MealLine. Do not put it in a prompt or
generated metadata.

## Install and run

```sh
cd /Users/zap/Documents/nourish
cp agent/.env.example agent/.env
python -m venv .venv
. .venv/bin/activate
python -m pip install -e 'agent[test]'
python -m agent.pipeline -t twilio
```

Configure the Twilio number's incoming TwiML to connect a Media Stream to the
Pipecat runner:

```xml
<Response><Connect><Stream url="wss://YOUR_PUBLIC_HOST/ws" /></Connect></Response>
```

For local testing, expose the runner with a tunnel such as `ngrok http 7860`;
the service itself does not provision a phone number or modify Twilio.

## Provider choices

- **Deepgram Nova 3 STT** uses streaming recognition and `language="multi"`,
  which keeps latency low while supporting English, Vietnamese, and Spanish.
- **OpenAI `gpt-4o-mini`** is a low-cost, low-latency tool-calling model. The
  system prompt makes it a conversation coordinator, never the source of
  inventory facts or item matching.
- **Cartesia Sonic** streams phone-suitable speech quickly and supports the
  multilingual voice configuration used by this service. `CARTESIA_VOICE_ID`
  can be replaced with an approved multilingual voice.

Pipecat's `SileroVADAnalyzer` ends user turns and enables barge-in. The Twilio
serializer handles 8 kHz μ-law media. Function calls are cancellable on
interruption, so a caller can correct the agent without waiting for a stale
response.

## Safety and matching

`matcher.py` is pure Python. It filters stock, dietary avoidances (including
peanut, dairy, pork, shellfish, gluten, soy, egg, nut substrings and dietary
flags), no-stove frozen/uncooked food, and no-fridge dairy/fresh food. It scales
requested quantities to `max(1, ceil(householdSize / 2))` while never exceeding
the reported stock quantity and caps lists at 20 items.

At create time, the pipeline discards model-proposed item rows and rebuilds the
rows from the fetched inventory and validated metadata. The caller must hear a
complete read-back and explicitly confirm it before the model is instructed to
call `create_shopping_list`. The agent never promises stock, delivery timing, or
staff approval; it reports only API results.

## Tests and MealLine loop

From the repository root (after activating the virtual environment):

```sh
pytest agent/tests
ruff check agent
mypy --strict agent/tools.py agent/matcher.py
```

The deterministic acceptance loop against a running MealLine instance is:

```sh
FEED_API_TOKEN='...' python -m agent.e2e
```

It simulates Vietnamese, household size 5, peanut avoidance, and no stove;
creates one list from an existing template; reads the instance back; and
asserts no peanut/frozen/uncooked item and no more than 20 items.
