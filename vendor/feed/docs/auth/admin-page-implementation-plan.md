# Admin Page Implementation Plan (1.5.0-beta.4)

## Status

Approved in design discussion and **implemented**, 2026-07-31. This document is
the agreed contract for the beta.4 work and supersedes the bootstrap section of
[administrator-authorization.md](administrator-authorization.md) where the two
differ (see [Deviation from the approved bootstrap rule](#deviation-from-the-approved-bootstrap-rule)).

Branch: `feat/admin-page`, cut from `main` at `e272bba` (v1.5.0-beta.3).

Three things changed during implementation; see
[Implementation notes](#implementation-notes) at the end.

## Scope

beta.4 delivers **authorization machinery and the surfaces that configure it**.
It deliberately does not tighten any route that staff use today.

In scope:

- Staff / Administrator roles, with a per-request database read.
- A unified user roster: invite, promote, demote, revoke, delete, last login.
- An access policy: Domain mode vs Allowlist mode, with a configurable denial
  message and contact address.
- A privileged-action audit log.
- An operator CLI for bootstrap and lockout recovery.
- The Admin page, visible only to Administrators.

Out of scope, with rationale:

- **Tightening existing privileged routes** (procurement rollback/restore, AI
  configuration, data-shaping rules). Deferred to beta.5 — see
  [Why beta.4 does not gate existing routes](#why-beta4-does-not-gate-existing-routes).
- **Sanitized backup and restore** (ISSUES.md #50b). Deferred here, now
  scheduled as the beta.6 feature.
- **White-labelling** — the hardcoded `@williamtemple.org` domain stays
  hardcoded. Making allowed domains configurable is v2.0 work; noted in
  [v2.0 notes](#v20-notes) so the model leaves room for it.
- **Magic-link POST interstitial** — scheduled for beta.5, see
  [Deferred to beta.5](#deferred-to-beta5).

## Deviation from the approved bootstrap rule

`administrator-authorization.md` specifies that the first verified user on a
genuinely fresh deployment becomes the initial Administrator. Production is not
fresh: `VerificationService.findOrCreateUser` has created a `User` row on every
successful verification since the auth rollout, so "first verified user" has no
live referent there.

**Decision: at migration time, every user that already exists is promoted to
Administrator; the roster is then pruned manually by the deploying
administrator.**

Rationale — the existing cohort is roughly five known staff who *already* have
unrestricted access to every route in the application, because no `requireAdmin`
exists anywhere today. Promoting them grants almost nothing they don't have.
The one genuinely new capability is role management itself, and that exposure is
bounded by pruning inside the same deploy session.

Rejected alternatives: promoting the oldest `User` row (confers authority on an
accident of history, unreviewable); arming the bootstrap for the first login
after deploy (a privilege-escalation race on a live system during pantry hours);
a hardcoded email in the migration (puts a staff address permanently into a
public AGPL repo and is wrong for every other deployment).

The fresh-instance rule survives for genuinely empty installs. Startup resolves
three states:

| `User` table | Administrators | Encryption key | Behaviour |
| --- | --- | --- | --- |
| empty | — | absent | Atomic fresh-instance bootstrap: first verified user becomes Administrator |
| empty | — | present | Never auto-assign; require the operator CLI (2026-09-04) |
| populated | zero | Never auto-assign. Log loudly. Require the operator CLI |
| populated | ≥ 1 | Normal operation |

The middle row can now only arise from a pruning mistake, which is exactly the
"explicit operator recovery path" the original design demands.

## Why beta.4 does not gate existing routes

Between `prisma migrate deploy` (which runs automatically on container start)
and a verified roster, the instance is in an unproven authorization state. If
`requireAdmin` were applied to procurement import, rollback, restore, AI
configuration, or data-shaping rules in the same release, any failure in that
window removes capability the pantry depends on, with no in-app way to restore
it.

Splitting them makes beta.4 additive: one column set, two tables, one page, one
CLI, and no change to any existing route's behaviour.

**Accept knowingly:** beta.4 does *not* close the hole where any authenticated
user can roll back procurement data. It builds the machinery that closes it in
beta.5.

## Data model

No Prisma enums exist in this schema; string columns with comments match the
established convention.

### `User` (extended)

```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime?
  lastLoginAt   DateTime?
  role          String    @default("STAFF")   // STAFF | ADMINISTRATOR
  accessState   String    @default("ALLOWED") // ALLOWED | REVOKED
  invitedAt     DateTime?
  invitedBy     String?   // actor email at invite time, retained if actor is deleted
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([email])
  @@index([role])
}
```

`role` defaults to `STAFF` and is **not** configurable — new joiners always
require an explicit promotion.

`accessState` is deliberately independent of the access mode: `REVOKED` blocks
sign-in in **both** Domain and Allowlist mode. This is what makes revocation
durable — deleting a departed staffer does not stick today, because
`findOrCreateUser` recreates the row on their next verification.

`lastLoginAt` is the evidence input to pruning. Without it the roster shows
email addresses and creation dates, which cannot answer "who has left?".
`emailVerified` records account creation, not recent activity.

An invited user has `emailVerified: null`, which the roster renders as
"Invited — not yet signed in". No extra column needed.

### `AccessPolicy`

Single upserted row (`id = 1`), following the `ExportSettings` precedent.

```prisma
model AccessPolicy {
  id            Int      @id @default(autoincrement())
  mode          String   @default("DOMAIN") // DOMAIN | ALLOWLIST
  deniedMessage String   @default("FEED access is limited to authorised staff.")
  contactEmail  String   @default("technology@williamtemple.org")
  updatedAt     DateTime @updatedAt
}
```

`deniedMessage` is plain text with a length cap (240 chars), rendered as text —
never `dangerouslySetInnerHTML`. `contactEmail` is rendered beneath it.

### `AdminAuditLog`

```prisma
model AdminAuditLog {
  id          String   @id @default(cuid())
  actorUserId String?  // null for system / CLI actors
  actorLabel  String   // email, "system:beta.4-migration", or "operator:cli"
  action      String   // ROLE_GRANTED | ROLE_REVOKED | ACCESS_REVOKED | ...
  targetType  String   // USER | ACCESS_POLICY
  targetId    String?
  targetLabel String?  // email or policy label
  detail      Json?
  createdAt   DateTime @default(now())

  @@index([createdAt])
  @@index([actorUserId])
  @@index([action])
}
```

Actor is stored as both id and label so audit rows stay legible after the actor
is deleted.

## Migration

`packages/backend/prisma/migrations/20260731000000_add_admin_roles_and_access_policy/migration.sql`

Statement order matters — the audit table must exist before the promotion is
recorded:

1. `ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'STAFF'`
2. `ALTER TABLE "User" ADD COLUMN "accessState" TEXT NOT NULL DEFAULT 'ALLOWED'`
3. `ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME`
4. `ALTER TABLE "User" ADD COLUMN "invitedAt" DATETIME`
5. `ALTER TABLE "User" ADD COLUMN "invitedBy" TEXT`
6. `CREATE INDEX "User_role_idx"`
7. `CREATE TABLE "AdminAuditLog"` + its three indexes
8. `CREATE TABLE "AccessPolicy"`; `INSERT` the single row with defaults
9. `UPDATE "User" SET "role" = 'ADMINISTRATOR'` — promotes rows existing **at
   migration time** only; the column default keeps new users as Staff
10. `INSERT INTO "AdminAuditLog"` one row per promoted user, with
    `actorLabel = 'system:beta.4-migration'`

Step 10 cannot use Prisma's client-side `cuid()`, so ids come from
`lower(hex(randomblob(16)))`.

The mass grant is recorded rather than silent — without step 10 the roster's
origin looks like five administrators materialising from nothing.

## Authentication changes

### Per-request revalidation

`jwtAuthMiddleware` ([jwt-middleware.ts](../../packages/backend/src/middleware/auth/jwt-middleware.ts))
becomes async and, when a valid token is present, reads the user once:

```
findUnique({ where: { id: payload.userId }, select: { id, email, role, accessState } })
```

- User missing, or `accessState === 'REVOKED'` → clear cookie, `401`, with a
  distinct code so the client redirects to login and shows the configured
  message.
- Success → `req.auth = { userId, email, role, accessState }`. One read per
  request; every downstream guard reads the request object.
- Database read throws → **fail closed with `503`**, not `401`. Denying access
  is correct; destroying the session over an infrastructure blip is not, and a
  `401` would bounce the user to a login that fails identically.
- Skipped when no token is present (unchanged `next()`), and for the
  `x-internal-pdf-request` Puppeteer path so PDF export gains no auth dependency.

`/api/public` is mounted at [server.ts:54](../../packages/backend/src/server.ts:54),
ahead of the auth chain, and is unaffected.

Cost: an indexed point lookup on a ~6-row table, permanently in page cache.
WAL mode (beta.2) means it does not block behind a write transaction. This is
the change that makes revocation effective within one request instead of within
seven days.

### Sign-in gate

New `AccessPolicyService.assertMayAuthenticate(email)`:

- `REVOKED` roster row → deny, in **both** modes.
- Domain mode → require the `@williamtemple.org` suffix (current behaviour).
- Allowlist mode → require a roster row that is not revoked.
- Denial throws with the configured message and `statusCode: 403`.

Applied to **all four** entry points — `/magic-link/request`, `/callback`,
`/otp/request`, `/otp/verify`. Gating only the request endpoints would leave the
other path open, and re-checking at verify means a revocation between request and
verify takes effect rather than honouring an in-flight token.

`findOrCreateUser` may create only in Domain mode; in Allowlist mode the gate has
already established that a row exists. Both verification paths set `lastLoginAt`.

### `requireAdmin`

Reads the already-loaded `req.auth`; no second query. Requires `req.auth?.userId`
to be present **and** `role === 'ADMINISTRATOR'`.

The presence check matters: `authMiddleware` calls `next()` without setting
`req.auth` when `NODE_ENV === 'development' && FORCE_AUTH !== 'true'`. A guard
that treated missing auth as permissive would be a production-shaped hole. The
consequence is that local admin work needs a real login — the two documented
approaches in AGENTS.md ("Auth in dev is subtle") both apply.

## Guard rules

Enforced **at the route**, mirrored in the UI. UI-only enforcement is not a
boundary.

| Rule | Condition |
| --- | --- |
| Minimum administrators | Always ≥ 1 |
| Minimum administrators, Allowlist mode | ≥ 2 with `role = ADMINISTRATOR` and `accessState = ALLOWED` |
| Enabling Allowlist mode | Acting admin must be in the roster and allowed, and the ≥ 2 rule must already hold |
| Demote / revoke / delete | Refused if it would break the applicable minimum |
| Self-demotion | Permitted only if another administrator remains; confirmation dialog |

Scaling the minimum with the mode is deliberate. In Domain mode, lockout requires
losing the entire mail domain. In Allowlist mode the list is the only door, so it
needs two keys. It also keeps FEED viable for a one-administrator pantry that
never leaves Domain mode.

"Primary" and "alternate" stay an operational convention rather than schema —
enforcement only cares about the count, and a designation flag adds state that
goes stale without changing behaviour. A true **break-glass account** (a
dedicated, rarely-used address that is not exposed to a working mailbox's
phishing surface) is a separate operational decision, not a code feature;
minimum-two does not provide one, since two normal staff accounts share a risk
profile.

## Backend routes

New `/api/admin` router, mounted after `jwtAuthMiddleware`/`authMiddleware`, every
route behind `requireAdmin`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/users` | Roster: email, role, access, `lastLoginAt`, invited state |
| POST | `/api/admin/users/invite` | Create a Staff row, set `invitedAt`/`invitedBy`, send invite email |
| PUT | `/api/admin/users/:id/role` | Promote / demote |
| PUT | `/api/admin/users/:id/access` | Revoke / restore |
| DELETE | `/api/admin/users/:id` | Remove roster row |
| GET | `/api/admin/audit` | Paginated, filterable audit history |
| GET | `/api/admin/access-policy` | Current mode, message, contact |
| PUT | `/api/admin/access-policy` | Update mode / message / contact |

Responses use the repo's envelope convention (`{ users }`, `{ user }`,
`{ auditEntries }`, `{ policy }`), and the frontend service unwraps every one —
including mutations, which is where the `FoodItemService` bug documented in
AGENTS.md originated.

`GET /api/auth/session` gains `role` and `accessState`, read from `req.auth`.

Every mutating route writes an audit row in the same transaction as its mutation.

### Invite email

A new Resend template linking to `${APP_URL}/login` — a plain page URL carrying
**no token**. A scanner prefetching it is harmless. The flow is: admin invites →
staff member clicks through to the login page → enters their address → receives
an OTP.

## Frontend

- `AuthContext` exposes `role`, `isAdministrator`, `accessState`.
- A `requireAdmin` variant of `ProtectedRoute` renders an explicit 403 page
  rather than redirecting, so a Staff user who follows a link gets an
  explanation instead of a silent bounce.
- Route `/admin` registered in `App.tsx` inside the existing `<ProtectedRoute>`
  block.
- Navigation: **Admin** under *Information*, adjacent to Settings, rendered only
  when `isAdministrator`. Hiding it is presentation, not authorization — the
  routes enforce independently.
- `components/admin/index.tsx`, structured with Shadcn `Tabs`: **Users**,
  **Access**, **Audit**. `EnhancedDataTable` for the roster and audit tables;
  `ScrollArea` with a definite height wherever a panel scrolls, never a bare
  `max-h-*`.
- `services/admin/index.ts` extending `BaseApiService`.
- All copy through `messageService` / `ErrorHandlerService`, ASK-compliant. The
  guard refusals in particular need to say *why* — "This is the last
  administrator who can sign in. Promote another administrator before demoting
  this one."
- Expect the known `ColumnDef` / Lucide `ComponentType` generic errors from
  `EnhancedDataTable` (docs/TSC-DEBT.md). Pre-existing systemic debt; do not fix
  opportunistically inside this feature.

## Operator CLI

**Finding that changes the original sketch:** the production backend image
installs with `npm ci --omit=dev`, copies only `dist`, `assets`, the Prisma
client and `prisma/`, and never copies `scripts/`. The backend `tsconfig.json`
sets `rootDir: ./src` with `include: ["src/**/*"]`. A `.ts` file in
`packages/backend/scripts/` — the pattern used by `migrate-encryption-key.ts` —
**cannot run in production**: no `scripts/` directory, no `ts-node`.

A recovery path that does not exist on the Pi is not a recovery path. So the CLI
lives at `packages/backend/src/cli/admin.ts`, compiles to `dist/cli/admin.js`
with the normal build, and runs with the production runtime:

```bash
docker compose exec backend node dist/cli/admin.js grant --email=<address> --confirm
```

Commands:

| Command | Behaviour |
| --- | --- |
| `list` | Print the roster: email, role, access, last login |
| `grant --email= --confirm` | Promote an **existing** user to Administrator. Idempotent. Refuses to create a user — a typo would otherwise mint a phantom account |
| `revoke --email= --confirm` | Demote, subject to the same minimum-administrator guard |
| `reset-access-mode --confirm` | Return the policy to Domain mode. The shell-level escape from an Allowlist lockout |

Every command writes an audit row with `actorLabel = 'operator:cli'` and prints
the resulting administrator roster. `--confirm` is required throughout, matching
the guard pattern in `seed-operational-history.ts`.

npm script aliases (`admin:list`, `admin:grant`, …) are dev-side sugar; the
documented production invocation is the `node dist/...` form above.

## Test coverage

Backend, `packages/backend/__tests__/features/admin/` (no auth tests exist there
today; `src/middleware/auth/__tests__/jwt-middleware.test.ts` is the only one):

- Staff receives 403 on every `/api/admin` route.
- Missing `req.auth` receives 403 — the dev-bypass hole.
- Last-administrator guard: demote, revoke, and delete refusals.
- Allowlist minimum-two guard, including refusal to *enable* the mode.
- Enabling Allowlist mode without the acting admin on the roster is refused.
- Access gate across the matrix: {Domain, Allowlist} × {magic link, OTP} ×
  {request, verify} × {allowed, revoked, absent}.
- A revoked user's existing JWT is rejected on the next request.
- A `503`, not a `401`, when the revalidation read fails.
- Migration semantics: pre-existing users promoted, users created afterwards
  default to Staff.
- An audit row is written for every mutating action, and rolls back with it.

Frontend: roster column rendering (including "Invited — not yet signed in"), and
the admin route guard.

Manual checklist: log in; confirm Admin is visible; confirm a Staff account
cannot see it and gets the 403 page at `/admin` directly; invite an address and
confirm the email arrives without a token; demote and confirm the guard fires at
the last administrator; revoke a second session and confirm it drops on its next
request; flip to Allowlist mode and confirm an unlisted domain address sees the
configured message.

## Deploy runbook

1. Back up `production.db` on the Pi. This is the first migration since 1.5.0,
   and migrations auto-apply on container start.
2. Bump all three version sources to `1.5.0-beta.4` — frontend `package.json`,
   backend `package.json`, and the `VERSION` build arg.
3. Build and push the image.
4. **Edit `VERSION` in the Pi's `.env`.** Do not rely on `export` — a dropped
   session falls back to `.env`, which is how `VERSION=1.0.10` rolled production
   back several versions on 2026-07-29.
5. Pre-flight: `docker compose config | grep image:`.
6. `docker compose pull && docker compose up -d`.
7. Confirm `/api/health` reports `1.5.0-beta.4`.
8. Sign in. Confirm Admin appears and the roster lists every existing user as
   Administrator.
9. **Prune in this session**: demote departed staff, revoke where appropriate,
   set new joiners' levels. Exposure is measured in minutes, not days.
10. **Leave the mode at Domain.** Deploying changes no authentication behaviour.
11. Later, deliberately, with the roster verified and two administrators
    confirmed: flip to Allowlist mode.

Deploy outside pantry hours.

## Documentation updates

Part of the deliverable, not follow-up:

- `docs/auth/administrator-authorization.md` — revise the bootstrap section to
  record the populated-production decision. The approved text currently reads as
  contradicting what ships.
- `ISSUES.md` #50 — split into authority (closing at beta.4/beta.5) and
  sanitized backups (still open). As one issue it cannot close until the
  riskiest piece ships.
- `CHANGELOG.md` and `docs/release-notes.md` for 1.5.0-beta.4.
- A user guide under `docs/user-guides/` covering invite, prune, and the two
  access modes.

## Delivered after beta.4

Both items originally deferred here shipped in **1.5.0-beta.5**:

- **Magic-link POST interstitial** — the emailed URL is now a GET to a page
  whose button POSTs to consume the token, so a mail scanner's prefetch cannot
  burn it. ISSUES.md #57.
- **Tightening existing privileged routes** with `requireAdmin` — procurement
  rollback/restore, data-shaping rules, AI configuration mutations.
  ISSUES.md #50a.

## Deferred to beta.6

- **Sanitized backup and restore** (ISSUES.md #50b). The precondition this
  document set — "deferred until Administrator authority is implemented" — is
  now met, so the work is unblocked rather than merely postponed. It is the
  largest single feature in this plan and the only one where a mistake destroys
  production data, so it gets its own design pass before implementation, the
  way the Admin page did. Brief: `docs/data-management/beta-6-backup-restore-brief.md`.

## v2.0 notes

`isAllowedDomain` pins `@williamtemple.org` at
[routes/auth/index.ts:34](../../packages/backend/src/routes/auth/index.ts:34),
repeated in three handlers and the login UI copy. White-labelling FEED for other
pantries requires allowed domains — plural, since many organisations run two — to
become configurable. `AccessPolicy` is the natural owner when that work happens;
adding a column later is cheap. Explicitly out of scope for beta.4.

Note the lifecycle difference from LOTTO's approach: LOTTO selects an immutable,
code-owned brand profile at build time, whereas FEED's access policy is
operational state an administrator changes after deployment. Different
lifecycles, correctly different mechanisms.

## Implementation notes

Three departures from the plan as written, each found while building it.

**1. Timestamp storage mismatch in the migration.** The migration originally
wrote `CURRENT_TIMESTAMP` for the audit rows and the policy row. SQLite stores
that as TEXT, while Prisma stores `DateTime` as INTEGER milliseconds — and
SQLite orders every INTEGER ahead of every TEXT regardless of value. Prisma
*reads* both formats without complaint, which is what made the mismatch silent:
the migration's own audit rows would have sorted as permanently newer than
everything the application wrote afterwards, so the History tab's "newest first"
would have been wrong from day one. Both inserts now write
`CAST(strftime('%s','now') AS INTEGER) * 1000`. Verified by applying the
migration to a scratch database and reading it back through Prisma.

**2. The operator CLI moved from `scripts/` to `src/cli/`.** The plan already
flagged that the production image installs `--omit=dev` and never copies
`scripts/`, so the `migrate-encryption-key.ts` pattern cannot reach production.
Confirmed and acted on: the CLI compiles into `dist` with the normal build and
runs as `node dist/cli/admin.js`. The `admin:*` npm scripts are dev-side
convenience only.

**3. `PATCH` became `PUT` for the role and access routes.** `BaseApiService` has
no `patch` method. Adding one to a shared base class for a single feature was
the larger change; `PUT` is also the more accurate verb, since both routes
replace the whole value of a single sub-resource.

Known accepted debt: `user-roster.tsx` produces three `TableRowAction` icon
variance errors, the systemic class documented in `docs/TSC-DEBT.md` that every
table in the app already produces. The repo's own `createFallbackIcon` wrapper
returns the same `forwardRef` shape, so it does not avoid them either. Left in
place per AGENTS.md rather than fixed opportunistically inside this feature.
