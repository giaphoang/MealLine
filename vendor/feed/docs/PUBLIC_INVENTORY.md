# Public Inventory Feed

FEED exposes a public read-only JSON feed so external tools can show current
pantry inventory without signing in to the FEED app.

The first consumer is LOTTO: Line Order Transparency & Ticketing Organizer.
LOTTO can fetch this file to show clients which pantry items are currently
available, including translated category and item names for enabled languages.

## Endpoint

Production:

```text
https://feed.williamtemple.app/api/public/inventory.json
```

Local development:

```text
http://localhost:3001/api/public/inventory.json
```

The endpoint is implemented in:

```text
packages/backend/src/routes/public-inventory.ts
```

It is mounted in `packages/backend/src/server.ts` before the normal credentialed
CORS and authentication middleware:

```text
/api/public
```

This placement is intentional. The feed must remain public and unauthenticated
so browser-based clients outside FEED can fetch it.

## Access Model

- Public.
- Read-only.
- No FEED login required.
- No frontend UI is attached to this feed.
- `Access-Control-Allow-Origin` is `*`.
- `Cache-Control` is `no-store`.

The feed exposes inventory availability only. It does not expose users, sessions,
documents, AI configuration, usage records, internal notes, or any authenticated
workspace actions.

## Update Behavior

This is a live backend endpoint, not a generated static file.

Each request reads the current inventory database and returns a fresh JSON
response. When FEED users change categories, food items, limits, stock status,
clearance status, dietary flags, enabled languages, or translations, the next
request reflects those changes.

No scheduled job or file writer is required.

## Included Data

The feed includes:

- Enabled language names, sorted by `Language.sortOrder`.
- Categories that have at least one in-stock item.
- Category name, translated category names, icon, limit, and limit type.
- Food items marked in stock.
- Food item name and translated food item names.
- Food item limit and limit type.
- Status tags:
  - `inStock`
  - `limited`
  - `clearance`
- Dietary flags:
  - `vegan`
  - `vegetarian`
  - `glutenFree`
  - `organic`
  - `halal`
  - `kosher`
  - `readyToEat`
- `updatedAt` for each food item.
- Feed totals.

Out-of-stock food items are intentionally omitted. Categories with no in-stock
items are also omitted.

## Translation Behavior

English remains the baseline value in each `name` field.

Enabled-language translations are included in a `translations` object on each
category and food item. The keys are language names from the `Language` table.

Example:

```json
{
  "id": 10,
  "name": "Apples",
  "translations": {
    "Spanish": "Manzanas",
    "Arabic": "تفاح"
  }
}
```

Only enabled languages are listed at the top level and queried for category and
food item translations. If a translation is missing, that language key is absent
for that category or item. Consumers should fall back to `name`.

## Response Shape

Example response:

```json
{
  "generatedAt": "2026-05-24T19:00:00.000Z",
  "version": "1.2.1",
  "languages": ["Spanish", "Arabic"],
  "categories": [
    {
      "id": 1,
      "name": "Produce",
      "translations": {
        "Spanish": "Frutas y verduras",
        "Arabic": "منتجات زراعية"
      },
      "icon": "apple",
      "limit": 2,
      "limitType": "household",
      "itemCount": 1,
      "items": [
        {
          "id": 10,
          "name": "Apples",
          "translations": {
            "Spanish": "Manzanas",
            "Arabic": "تفاح"
          },
          "limit": 1,
          "limitType": "person",
          "statusTags": {
            "inStock": true,
            "limited": true,
            "clearance": false
          },
          "dietaryFlags": {
            "vegan": true,
            "vegetarian": true,
            "glutenFree": true,
            "organic": false,
            "halal": false,
            "kosher": true,
            "readyToEat": true
          },
          "updatedAt": "2026-05-24T12:00:00.000Z"
        }
      ]
    }
  ],
  "totals": {
    "categories": 1,
    "foodItems": 1
  }
}
```

## Consumer Guidance

Consumers should:

- Fetch the endpoint when a current inventory view is needed.
- Use `languages` to know which translated language options are currently
  active in FEED.
- Prefer `translations[selectedLanguage]` when present.
- Fall back to `name` when a translation is missing.
- Treat category and item `id` values as stable FEED database identifiers.
- Treat the endpoint as public information and avoid sending credentials.

Consumers should not:

- Assume every enabled language has a translation for every category or item.
- Display out-of-stock items from cached older responses.
- Write back to this endpoint. It is read-only.

## Validation

Route coverage lives in:

```text
packages/backend/__tests__/routes/public-inventory.test.ts
```

Run the focused test:

```bash
cd packages/backend
npm test -- --run __tests__/routes/public-inventory.test.ts
```

Run the backend build:

```bash
cd packages/backend
npm run build
```
