// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Roles authorize actions; they never partition feature data. Every
 * authenticated user still sees the same shared organization dataset.
 */
export type UserRole = 'STAFF' | 'ADMINISTRATOR';

/** Revocation blocks sign-in under both access modes. */
export type UserAccessState = 'ALLOWED' | 'REVOKED';

export type AccessMode = 'DOMAIN' | 'ALLOWLIST';

export interface RosterUser {
  id: string;
  email: string;
  role: UserRole;
  accessState: UserAccessState;
  /** Null until the person completes their first sign-in. */
  emailVerified: string | null;
  /** The evidence an administrator prunes by. */
  lastLoginAt: string | null;
  invitedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

export interface AdministratorSummary {
  mode: AccessMode;
  /** Administrators who could actually sign in right now. */
  eligible: number;
  /** How many this mode requires. */
  required: number;
}

export interface AccessPolicy {
  id: number;
  mode: AccessMode;
  deniedMessage: string;
  contactEmail: string;
  updatedAt: string;
}

export interface AccessPolicyUpdate {
  mode?: AccessMode;
  deniedMessage?: string;
  contactEmail?: string;
}

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  detail: unknown;
  createdAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface InviteResult {
  user: RosterUser;
  /** False when the roster row was created but the notification failed. */
  invitationEmailSent: boolean;
}

export const DENIED_MESSAGE_MAX_LENGTH = 240;

/** Human wording for audit actions, used by the Audit tab. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  DEVELOPMENT_SIGN_IN: 'Local developer signed in',
  ROLE_GRANTED: 'Made Administrator',
  ROLE_REVOKED: 'Changed to Staff',
  ACCESS_REVOKED: 'Access revoked',
  ACCESS_RESTORED: 'Access restored',
  USER_INVITED: 'Invited',
  USER_DELETED: 'Removed from roster',
  ACCESS_POLICY_UPDATED: 'Access settings changed',
  BACKUP_DOWNLOADED: 'Backup downloaded',
  // Added to the backend in beta.5/6 and missed here, so the two heaviest
  // actions in the log — the ones that replace or discard the whole database —
  // rendered as raw BACKUP_RESTORED and CLEAN_SLATE_APPLIED. The wording keeps
  // them distinct on purpose: restore recovers, reset discards.
  BACKUP_RESTORED: 'Backup restored',
  BACKUP_RESTORE_FAILED: 'Backup restore failed',
  CLEAN_SLATE_APPLIED: 'Reset to clean slate',
  BRAND_ASSETS_CLEANED: 'Unused brand assets cleaned',
};

export interface DatabaseSummary {
  /** Row count per table the backup covers. */
  rowCounts: Record<string, number>;
  totalRecords: number;
  /** SQLite file size in bytes, or null when the pragmas are unavailable. */
  sizeBytes: number | null;
  lastBackupAt: string | null;
  lastBackupBy: string | null;
}

/**
 * How the Database tab groups and names the raw table counts.
 *
 * Presentation only — the backend returns table names, which are FEED's
 * internal vocabulary, not a staff member's. Tables absent from this map still
 * count toward the total; they simply do not earn their own line.
 */
export const DATABASE_SUMMARY_GROUPS: {
  label: string;
  tables: { table: string; label: string }[];
}[] = [
  {
    label: 'Staff roster',
    tables: [{ table: 'User', label: 'Accounts' }],
  },
  {
    label: 'Inventory',
    tables: [
      { table: 'Category', label: 'Categories' },
      { table: 'FoodItem', label: 'Food items' },
    ],
  },
  {
    label: 'Languages & translations',
    tables: [
      { table: 'Language', label: 'Languages' },
      { table: 'Translation', label: 'Translations' },
      { table: 'FoodItemTranslation', label: 'Food item names' },
      { table: 'CategoryTranslation', label: 'Category names' },
    ],
  },
  {
    label: 'Shopping lists',
    tables: [
      { table: 'ShoppingListBuilderTemplate', label: 'Templates' },
      { table: 'ShoppingListBuilderComponent', label: 'Saved components' },
    ],
  },
  {
    label: 'MealLine fulfilment',
    tables: [
      { table: 'NourishIntake', label: 'Voice intakes' },
      { table: 'NourishBasket', label: 'Household baskets' },
      { table: 'NourishVolunteer', label: 'Volunteers' },
      { table: 'NourishDelivery', label: 'Deliveries' },
    ],
  },
  {
    label: 'Procurement',
    tables: [
      { table: 'ProcurementImport', label: 'Imports' },
      { table: 'ProcurementOrderRevision', label: 'Orders' },
      { table: 'ProcurementLine', label: 'Line items' },
      { table: 'ProcurementDataRule', label: 'Data rules' },
    ],
  },
  {
    label: 'Service',
    tables: [
      { table: 'ServiceImport', label: 'Imports' },
      { table: 'ServiceClient', label: 'Source clients' },
      { table: 'ServiceEncounterRevision', label: 'Encounter revisions' },
      { table: 'ServiceClientProfileRevision', label: 'Client profile revisions' },
      { table: 'ServiceClientProfileResponse', label: 'Profile responses' },
      { table: 'ServiceQualityIssue', label: 'Quality issues' },
      { table: 'ServiceQualityIssueDecision', label: 'Quality decisions' },
      { table: 'ServiceSourceResolution', label: 'Source resolutions' },
      { table: 'ServiceMetricDefinition', label: 'Metric definitions' },
      { table: 'ServiceMetricObservationRevision', label: 'Metric observations' },
      { table: 'ServiceDayStatusRevision', label: 'Daily entry revisions' },
      { table: 'ServiceCapacityPlan', label: 'Capacity plans' },
      { table: 'ServiceCapacityPlanRevision', label: 'Capacity plan revisions' },
      { table: 'ServiceCapacityTarget', label: 'Capacity targets' },
      { table: 'LottoQueueSyncRun', label: 'LOTTO synchronization runs' },
      { table: 'LottoQueueSessionRevision', label: 'LOTTO queue sessions' },
    ],
  },
  {
    label: 'Recorded history',
    tables: [
      { table: 'FoodItemInventoryEvent', label: 'Food item changes' },
      { table: 'CategoryInventoryEvent', label: 'Category changes' },
    ],
  },
];

/**
 * Restore.
 *
 * The units are closed under foreign keys — a selection that is not would
 * produce rows pointing at rows that were not restored — so the server decides
 * the closure and the client only reports it. See
 * `services/restore/restore-units.ts` and
 * docs/data-management/beta-6-backup-restore-brief.md.
 */
export type RestoreUnitId =
  | 'staffRoster'
  | 'inventory'
  | 'languages'
  | 'shoppingLists'
  | 'nourish'
  | 'procurement'
  | 'service'
  | 'configuration';

export interface RestoreUnitInfo {
  id: RestoreUnitId;
  label: string;
  description: string;
  requires: RestoreUnitId[];
  /**
   * Records that restoring this unit also clears, in plain language. They point
   * into tables the restore replaces and cannot survive it, so the confirmation
   * names them rather than discarding them silently. Derived server-side from
   * the same contract the restore reads.
   */
  clears: string[];
  /**
   * Associations this unit carries but cannot resolve on another instance, in
   * plain language. Their parent rows are excluded from every artifact — an
   * uploaded document is storage, not database — so the reference is blanked
   * on insert rather than aborting the restore. The row survives; the link
   * does not. Derived server-side from the same contract the restore reads.
   */
  blanks: string[];
}

/** What validation found in an uploaded file, before anything is replaced. */
export interface RestorePreview {
  generatedAt: string;
  generatedBy: string;
  feedVersion: string;
  tableContractVersion: number;
  rowCounts: Record<string, number>;
  availableUnits: RestoreUnitId[];
  rowsByUnit: Record<string, number>;
  notes: string[];
}

export interface RestoreResult {
  units: RestoreUnitId[];
  tables: string[];
  rowsWritten: Record<string, number>;
  backupTakenAt: string;
}

/** Clean slate — the reset that shares restore's mechanism. */
export interface CleanSlateOptions {
  /** Include example categories and items. Default true. */
  withExamples: boolean;
  /**
   * Also clear the roster. Default false: preserving it keeps the
   * administrator and their colleagues signed in to their own instance.
   * Clearing arms the fresh-instance bootstrap, so it must be chosen.
   */
  clearRoster: boolean;
}

export interface CleanSlateResult {
  withExamples: boolean;
  rosterCleared: boolean;
  seeded: {
    languages: number;
    enabledLanguages: number;
    categories: number;
    foodItems: number;
    globalLimit: number;
  };
  clearedTables: number;
}
