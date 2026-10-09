# Development Operational-History Fixture

This fixture exists only to evaluate FEED's Availability & Service Pressure
reports with credible trend data before the organization accumulates enough
production history naturally.

It is deterministic and must never run in production.

## Evidence and boundaries

The fixture combines:

- the Food Item and Category catalog from
  the privately held `backup_20260709_103507.db`;
- weekly staple presence and delivery dates derived from the internal local
  workbook `OFB_Orders.xlsx` (stored outside the repository and not distributed);
- the pantry's Tuesday–Thursday, 11am–2pm service schedule;
- routine inventory updates near 9am on service days;
- Tuesday Trader Joe's donations and smaller Thursday Fred Meyer donations.

The workbook is used only to establish delivery cadence and whether eggs,
milk, bread, rice, pasta, soup, and tuna appeared in a delivery week. FEED does
not convert workbook weight to Food Item counts, infer consumption, or claim
that an OFB row caused a particular availability transition.

The source workbook is not required to run the fixture. The narrow,
non-transactional presence matrix needed by the fixture is embedded in the
development script so private source rows are never published.

## Generated behavior

- The range contains 90 inclusive local dates ending on the requested fixture
  date.
- A migration baseline starts tracked history; dates before it remain
  untracked.
- Monday OFB receipts appear as Tuesday 9am availability updates.
- Staples commonly move from available, to Limited Supply, to unavailable over
  the service week. Workbook weeks missing a staple do not fabricate a
  restock.
- Rotating Trader Joe's items become available and limited Tuesday morning,
  with most unavailable by early afternoon. Some briefly enter Clearance.
- Rotating Fred Meyer frozen, meat, and dairy items follow the same smaller
  Thursday pattern.
- A modest rotating pantry mix creates additional Canned Goods, Beans, and Dry
  Goods history.
- Item and Category rationing changes remain separate observations.
- Estimated quantities remain Unknown. The fixture does not manufacture burn
  rate, consumption, or unit semantics.

## Safety and use

Create a backup of `packages/backend/dev.db`, restore the production-shaped
backup into the development database, apply migrations, and then run:

```bash
NODE_ENV=development npx ts-node scripts/seed-operational-history.ts \
  --confirm-development-fixture --end-date=2026-07-11
```

The script refuses to run when `NODE_ENV=production` or without the explicit
confirmation flag. It replaces only operational event history and current
Food Item/Category status, limit, quantity, and Supply annotation state. It
does not add, rename, or delete catalog records.

The pre-fixture local database backup created for the July 2026 evaluation is
stored in private operational storage outside the repository.
