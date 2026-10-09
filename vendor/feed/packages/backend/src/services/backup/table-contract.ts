// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * What a sanitized backup contains, and — just as importantly — what it does
 * not.
 *
 * `docs/data-management/backup-and-restore.md` is the approved boundary: a raw
 * SQLite snapshot necessarily carries key material, authentication records, and
 * encrypted provider secrets, so it stays an operator concern and is never a
 * browser download. The in-app artifact is a *selective logical export*, and
 * "selective" is only meaningful if the selection is enumerated rather than
 * implied.
 *
 * Every model in the schema appears in exactly one of INCLUDED_TABLES or
 * EXCLUDED_TABLES. A test reads the Prisma schema and fails if any model is
 * missing from both, so a table added later cannot drift into a backup — or
 * silently out of one — without somebody making that call deliberately.
 *
 * REDACTED_COLUMNS is the third category: tables that are exported with
 * specific columns stripped, for the case where excluding the whole table to
 * protect one field would also discard an administrator's work.
 */

/** Organization operating data. The point of the artifact. */
export const INCLUDED_TABLES = [
  // Staff roster. Authority is neutralized by stripping role on export; the
  // administrator performing an in-app restore is re-granted during restore.
  'User',
  // Inventory and its translations
  'Category',
  'CategoryTranslation',
  'FoodItem',
  'FoodItemTranslation',
  'GlobalLimit',
  // Append-only operational history behind Analytics
  'FoodItemInventoryEvent',
  'CategoryInventoryEvent',
  // Languages and the translation cache
  'Language',
  'Translation',
  // Shopping list authoring
  'ShoppingListTemplate',
  'ShoppingListSection',
  'ShoppingListBuilderTemplate',
  'ShoppingListBuilderComponent',
  // MealLine household fulfilment. Contact data is organization operating data;
  // volunteer credentials are stripped separately below.
  'NourishClient',
  'NourishClientRevision',
  'NourishPhoneCall',
  'NourishChangeRequest',
  'NourishDeliveryEvent',
  'NourishIntake',
  'NourishBasket',
  'NourishVolunteer',
  'NourishDelivery',
  // Organization configuration
  'AIConfiguration',
  'ExportSettings',
  'OperatingHoursRevision',
  // Deployment capabilities. Included with the other organization
  // configuration, which means restoring an older backup can restore an older
  // publishing decision — the same is already true of operating hours and
  // branding, and restore is selective, so consistency wins over a special
  // case. It carries no credentials, unlike LottoQueueIntegrationConfig below.
  'DeploymentSettings',
  'SystemPrompt',
  'FormattingChoice',
  'SavedCustomText',
  // Organization branding. Assets are stored in the database deliberately so
  // a sanitized backup is a complete, portable copy of the active identity.
  'BrandConfiguration',
  'BrandAsset',
  // Procurement observations and the overlays that shape them
  'ProcurementImport',
  'ProcurementOrderRevision',
  'ProcurementProduct',
  'ProcurementLine',
  'ProcurementDataRule',
  // Formal Service imports and non-destructive interpretation overlays
  'ServiceImport',
  'ServiceClient',
  'ServicePerson',
  'ServiceEncounterRevision',
  'ServiceEncounterPerson',
  'ServiceClientProfileRevision',
  'ServiceClientProfileResponse',
  'ServicePersonProfileRevision',
  'ServicePersonProfileResponse',
  'ServiceQualityIssue',
  'ServiceQualityIssueDecision',
  'ServiceSourceResolution',
  'ServiceMetricDefinition',
  'ServiceMetricDefinitionRevision',
  'ServiceMetricObservationRevision',
  'ServiceDayStatusRevision',
  'ServiceCapacityPlan',
  'ServiceCapacityPlanRevision',
  'ServiceCapacityTarget',
  'LottoQueueSyncRun',
  'LottoQueueSessionRevision',
  'LottoQueueTicketObservation',
  'LottoQueueQualityIssue',
  'LottoQueueSessionResolution',
] as const;

export type IncludedTable = (typeof INCLUDED_TABLES)[number];

/**
 * Everything deliberately left out, with the reason attached. The reason is
 * not decoration: it is what a future maintainer needs in order to judge
 * whether a request to "just add that table" is safe.
 */
/**
 * Excluded tables that hold foreign keys INTO included tables, and must be
 * cleared when their parents are replaced.
 *
 * Restore copies the live database, then deletes and reloads the selected
 * units — so an excluded table survives the copy still pointing at rows the
 * restore is about to delete. `PRAGMA foreign_keys = ON` is set on the scratch
 * database, so the delete fails with P2003 and the whole restore aborts.
 *
 * This was not theoretical: eight `UsageRecord` rows were enough to break a
 * full restore, and the generic error handler rendered the constraint failure
 * as "Cannot delete this item because it is referenced by other items" — a
 * message about deleting one item, shown for a failed disaster-recovery
 * restore. Any instance with AI usage telemetry would have hit it, including
 * production, at exactly the moment recovery mattered. See ISSUES.md #73.
 *
 * Clearing rather than preserving is the right call for both entries below,
 * and only because of what they are. `UsageRecord` is aggregated telemetry the
 * contract already describes as "rebuilt from operation rather than restored".
 * `ShoppingListInstance` is generated output bound to a `ShoppingListPDF` file
 * the artifact does not carry, so its rows are already dangling after a
 * restore. Neither is organization data a user authored.
 *
 * A table must NOT be added here to make a restore pass if its rows are
 * something a user would miss. That case needs a different answer — carrying
 * the table in the artifact, or nulling the reference — not silent deletion.
 */
export const RESTORE_CLEARED_TABLES: Record<string, {
  /** Included tables this one references. Cleared only if one is being replaced. */
  readonly references: readonly string[];
  readonly reason: string;
  /**
   * What these rows are, in the words the restore confirmation shows. The
   * `reason` above explains the decision to a maintainer; this explains the
   * consequence to the administrator about to accept it, who would otherwise
   * lose the rows without being told.
   */
  readonly label: string;
}> = {
  UsageRecord: {
    references: ['AIConfiguration', 'Translation'],
    label: 'AI usage history',
    reason:
      'Aggregated AI telemetry, already excluded as "rebuilt from operation rather than restored". '
      + 'Its rows describe work done against configurations and translations that the restore replaces.',
  },
  ShoppingListInstance: {
    references: ['ShoppingListTemplate'],
    label: 'records of previously generated shopping lists',
    reason:
      'Generated output tied to a ShoppingListPDF file the artifact does not carry, so these rows '
      + 'are already unusable after a restore. Regenerated from a template on demand.',
  },
};

export const EXCLUDED_TABLES: Record<string, string> = {
  NourishAgentReceipt: 'Transient service-command replay receipts; never restore delegated authority from a portable file.',
  // --- Secrets. Non-negotiable; this is why the artifact exists at all. ---
  EncryptionKey:
    'Key material. The runtime encryption key lives here, not in env (KeyManager.getActiveKey).',

  // --- Authentication material. ---
  VerificationToken: 'Live magic-link and OTP tokens.',
  OtpFailure: 'Lockout state; restoring it would resurrect or clear lockouts arbitrarily.',

  // --- Authority. Restoring these would restore *access*. ---
  AccessPolicy:
    'Sign-in mode is an authority decision. A restore must not quietly widen or narrow who can sign in.',
  AdminAuditLog:
    'A security record. Importing it from a file would let someone rewrite the history of privileged actions.',

  // --- Rows that point at files the artifact does not carry. ---
  Document: 'References an uploaded file on disk; the artifact carries no file payloads.',
  TranslatedDocument: 'References a generated file on disk.',
  ShoppingListPDF: 'References a generated PDF on disk.',
  ShoppingListInstance: 'Generated output tied to ShoppingListPDF rows.',

  // --- Telemetry and transient state. ---
  ApiUsageLog: 'Per-request AI telemetry. Large, derived, and not organization operating data.',
  UsageRecord: 'Aggregated usage telemetry, rebuilt from operation rather than restored.',
  Alert: 'Transient notifications, regenerated from current state.',
  DataImportJob:
    'Transient unified-import workflow state. Staged source files are separately deleted and never belong in a portable organization-data artifact.',
  DataImportJobEvent:
    'Transient progress events for DataImportJob; completed imports retain their durable provenance in domain-specific import tables.',
  Link2FeedVisitStagingRow:
    'Transient allowlisted Link2Feed projection used only during import review; activated facts move into the durable Service tables.',
  SimcVisitStagingRow:
    'Transient allowlisted SIMC household-visit projection used only during import review.',
  SimcPersonStagingRow:
    'Transient allowlisted SIMC person-profile projection used only during import review.',
  SimcEncounterPersonStagingRow:
    'Transient SIMC encounter-membership projection used only during import review.',
  WthTrackingStagingRow:
    'Transient normalized WTH Tracking observations used only during import review.',
  DataImportReviewIssue:
    'Transient pre-activation quality review. Issues needed to explain active facts become durable ServiceQualityIssue rows.',
  DataImportReviewDecision:
    'Transient operator decision attached to a staged review issue; activation copies its audit meaning into durable Service decisions and resolutions.',
  LottoQueueIntegrationConfig:
    'Contains the LOTTO source URL, encrypted bearer token, token salt, and live cursor. In-place restore preserves the destination connection; a new installation must pair again.',

  // --- Dormant. ---
  ReportTemplate:
    'Dormant prototype infrastructure pending an approved report-template contract (ISSUES.md #46).',
};

/**
 * Columns stripped from otherwise-included tables.
 *
 * The middle category between "exported" and "excluded", and the reason it
 * exists: dropping a whole table to protect one column also discards work.
 * `AIConfiguration` holds an administrator's model choice, temperature,
 * thinking level, token limits, cost limits, and rate limits alongside the
 * provider key. Excluding the table — as beta.6 did — threw all of that away to
 * protect two fields. backup-and-restore.md only ever asked for column-level
 * exclusion; this implements what it said.
 *
 * A restored configuration therefore arrives complete but keyless, which is
 * exactly the state the restore contract already requires ("fresh AI provider
 * keys afterwards").
 */
export const REDACTED_COLUMNS: Record<string, readonly string[]> = {
  AIConfiguration: ['encryptedApiKey', 'salt'],
  User: ['role'],
  NourishVolunteer: ['passwordHash'],
  NourishClient: ['phoneVerifiedAt'],
};

/**
 * Pending Service revisions are durable staging, not organization facts. They
 * are deliberately queryable for activation recovery but must never cross the
 * sanitized-backup boundary before their import becomes active.
 */
export const BACKUP_QUERY_ARGS: Partial<Record<IncludedTable, object>> = {
  ServiceImport: { where: { status: { not: 'pending' } } },
  ServiceClient: {
    where: {
      OR: [
        { encounters: { some: { import: { status: { not: 'pending' } } } } },
        { profileRevisions: { some: { import: { status: { not: 'pending' } } } } },
      ],
    },
  },
  ServicePerson: {
    where: {
      OR: [
        { encounterLinks: { some: { encounter: { import: { status: { not: 'pending' } } } } } },
        { profileRevisions: { some: { import: { status: { not: 'pending' } } } } },
      ],
    },
  },
  ServiceEncounterRevision: { where: { import: { status: { not: 'pending' } } } },
  ServiceEncounterPerson: { where: { encounter: { import: { status: { not: 'pending' } } } } },
  ServiceClientProfileRevision: { where: { import: { status: { not: 'pending' } } } },
  ServiceClientProfileResponse: {
    where: { profileRevision: { import: { status: { not: 'pending' } } } },
  },
  ServicePersonProfileRevision: { where: { import: { status: { not: 'pending' } } } },
  ServicePersonProfileResponse: {
    where: { profileRevision: { import: { status: { not: 'pending' } } } },
  },
  ServiceQualityIssue: { where: { import: { status: { not: 'pending' } } } },
  ServiceQualityIssueDecision: {
    where: { issue: { import: { status: { not: 'pending' } } } },
  },
  ServiceSourceResolution: {
    where: {
      OR: [
        { qualityIssueId: null },
        { qualityIssue: { import: { status: { not: 'pending' } } } },
      ],
    },
  },
  LottoQueueSessionRevision: {
    where: { OR: [{ importId: null }, { import: { status: { not: 'pending' } } }] },
  },
  LottoQueueTicketObservation: {
    where: { sessionRevision: { OR: [{ importId: null }, { import: { status: { not: 'pending' } } }] } },
  },
  LottoQueueQualityIssue: {
    where: { sessionRevision: { OR: [{ importId: null }, { import: { status: { not: 'pending' } } }] } },
  },
};

/**
 * Bumped when the shape of `data` changes in a way a reader must notice —
 * a table added or removed, or a payload restructured. Distinct from the FEED
 * version and from the migration name: an artifact can be produced by many FEED
 * builds while remaining the same contract.
 */
export const TABLE_CONTRACT_VERSION = 14;

export const ARTIFACT_KIND = 'feed-sanitized-backup';

/**
 * References that a restore deliberately blanks instead of resolving.
 *
 * A foreign key whose parent is excluded from every artifact cannot be
 * satisfied by any selection — no unit contains the parent, so no `requires`
 * edge can reach it. There are exactly two ways to handle that: carry the
 * parent after all, or null the reference on insert. This registry is the
 * second, and it is deliberately narrow.
 *
 * Both entries point at `Document`, and the reasoning is the same for each.
 * The artifact carries no file payloads — an uploaded document is storage,
 * not database — so a `Document` row restored onto a fresh instance would
 * describe a file that is not there. FEED already has a name and a repair
 * tool for that state (`services/storage/reconciliation.ts` Phase 1 reports
 * database records whose files are missing), but a *dangling* reference is
 * different: it aborts the whole restore. Measured on a production snapshot,
 * 112 of 2,319 translations carry a `documentId`, so this is the ordinary
 * case rather than an edge one.
 *
 * What is lost is the association between a translation and the document it
 * came from. The document itself is already gone — the file was never in the
 * artifact — so the association had nothing left to point at. The
 * confirmation dialog states this in `label` before the administrator
 * accepts, for the same reason RESTORE_CLEARED_TABLES does: a restore that
 * quietly drops data teaches people not to trust it.
 *
 * A column must NOT be added here to make a restore pass if the parent
 * *could* be carried. That case needs the parent in the artifact, not a
 * blanked reference.
 */
export const RESTORE_NULLED_REFERENCES: Record<string, {
  /** Columns on this table that are set to null when the parent is unavailable. */
  readonly columns: readonly string[];
  /** The excluded table these columns point at. */
  readonly parent: string;
  /** What the administrator loses, in the words the confirmation shows. */
  readonly label: string;
  readonly reason: string;
}> = {
  Translation: {
    columns: ['documentId'],
    parent: 'Document',
    label: 'the link from each translation to the document it was made from',
    reason:
      'Document rows are excluded because the artifact carries no file payloads. A translation '
      + 'restored onto a fresh instance has no document to point at, and the dangling reference '
      + 'would abort the restore.',
  },
  FormattingChoice: {
    columns: ['documentId'],
    parent: 'Document',
    label: 'the link from each saved formatting choice to its document',
    reason:
      'Same as Translation: the parent document is not carried, so the reference cannot resolve '
      + 'on any instance that does not already hold that exact row.',
  },
};
