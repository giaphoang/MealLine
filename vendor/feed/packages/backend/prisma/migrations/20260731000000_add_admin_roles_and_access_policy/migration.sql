-- Administrator authority, a durable access state, and a privileged-action
-- ledger. Roles authorize actions; they do not partition feature data. Every
-- authenticated user continues to see the same shared organization dataset.
--
-- BOOTSTRAP DECISION (deviates from docs/auth/administrator-authorization.md,
-- which assumed a fresh instance): production is not fresh. Every successful
-- verification since the auth rollout created a User row, so "the first
-- verified user" has no live referent here. Instead, every user that exists at
-- migration time is promoted to Administrator and the roster is pruned
-- manually by the deploying administrator. The existing cohort already has
-- unrestricted access to every route — no requireAdmin exists yet — so this
-- grants almost nothing they do not already have. New users created after this
-- migration default to STAFF via the column default and require an explicit
-- promotion. See docs/auth/admin-page-implementation-plan.md.
--
-- Statement order matters: AdminAuditLog must exist before the promotion is
-- recorded, so the roster's origin is on the record rather than appearing as
-- administrators materializing from nothing.

-- Roles and durable access state. REVOKED blocks sign-in under BOTH access
-- modes, which is what makes removing a departed staff member stick;
-- findOrCreateUser would otherwise recreate the row on their next login.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'STAFF';
ALTER TABLE "User" ADD COLUMN "accessState" TEXT NOT NULL DEFAULT 'ALLOWED';

-- emailVerified records account creation, not recent activity, so it cannot
-- answer "who has left?". lastLoginAt is the evidence input to pruning.
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "invitedAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "invitedBy" TEXT;

CREATE INDEX "User_role_idx" ON "User"("role");

-- Append-only privileged-action ledger. The actor is stored as both id and
-- label so rows stay legible after the acting user is deleted.
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetLabel" TEXT,
    "detail" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");

-- Org-wide shared sign-in policy, single upserted row (id = 1), following the
-- ExportSettings precedent. Ships in DOMAIN mode so deploying this migration
-- changes no authentication behavior; the ALLOWLIST flip is a later,
-- deliberate act made with the roster verified.
CREATE TABLE "AccessPolicy" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mode" TEXT NOT NULL DEFAULT 'DOMAIN',
    "deniedMessage" TEXT NOT NULL DEFAULT 'FEED access is limited to authorized staff.',
    "contactEmail" TEXT NOT NULL DEFAULT 'technology@williamtemple.org',
    "updatedAt" DATETIME NOT NULL
);

-- Timestamps are written as INTEGER milliseconds, which is how Prisma stores
-- DateTime on SQLite. CURRENT_TIMESTAMP would write TEXT instead, and SQLite
-- orders every INTEGER ahead of every TEXT regardless of value — so rows
-- written here would sort as permanently newer than everything the application
-- writes afterwards. Prisma reads both formats, which is what makes the
-- mismatch silent rather than loud.
INSERT INTO "AccessPolicy" ("id", "mode", "deniedMessage", "contactEmail", "updatedAt")
VALUES (
    1,
    'DOMAIN',
    'FEED access is limited to authorized staff.',
    'technology@williamtemple.org',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

-- Promote every user that exists at migration time. Rows created afterwards
-- take the STAFF column default.
UPDATE "User" SET "role" = 'ADMINISTRATOR';

-- Record the mass grant. Prisma's cuid() is client-side and unavailable here,
-- so ids come from randomblob.
INSERT INTO "AdminAuditLog" (
    "id", "actorUserId", "actorLabel", "action",
    "targetType", "targetId", "targetLabel", "detail", "createdAt"
)
SELECT
    lower(hex(randomblob(16))),
    NULL,
    'system:beta.4-migration',
    'ROLE_GRANTED',
    'USER',
    "id",
    "email",
    json_object(
        'role', 'ADMINISTRATOR',
        'reason', 'beta.4 migration promoted all pre-existing users; prune manually'
    ),
    -- INTEGER milliseconds, matching Prisma's SQLite DateTime storage. See the
    -- note on AccessPolicy above: CURRENT_TIMESTAMP writes TEXT, and mixing the
    -- two silently inverts "newest first" for these rows forever.
    CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM "User";
