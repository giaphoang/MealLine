// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';
import { parse } from 'csv-parse';
import type { Readable } from 'stream';
import {
  inspectCsvHeader,
  LINK2FEED_VISIT_ALLOWED_HEADERS,
} from '../../data-import/source-contracts';
import {
  reviewServiceEncounter,
  serviceEncounterSnapshotHash,
  type ServiceEncounterDraft,
} from '../foundation';
import {
  buildServiceBirthYearObservation,
  buildServiceProfileResponse,
  serviceClientProfileSnapshotHash,
  type ServiceClientProfileDraft,
  type ServiceProfileDimension,
  type ServiceProfileResponse,
} from '../profiles';

export const LINK2FEED_VISIT_CONTRACT_ID = 'link2feed_visits_v1';
export const LINK2FEED_SOURCE = 'link2feed';
export const LINK2FEED_VISIT_ADAPTER_VERSION = 1;

const PROJECTED_HEADERS: ReadonlySet<string> = new Set<string>(
  LINK2FEED_VISIT_ALLOWED_HEADERS.filter((header) => header !== 'Notes'),
);

const RESPONSE_FIELDS: readonly {
  header: typeof LINK2FEED_VISIT_ALLOWED_HEADERS[number];
  dimension: ServiceProfileDimension;
}[] = [
  { header: 'Client Gender Identity-Labels', dimension: 'gender_identity' },
  { header: 'Client Gender Identity-Parent Types', dimension: 'gender_identity_parent_type' },
  { header: 'Client Ethnicity-Labels', dimension: 'ethnicity' },
  { header: 'Client Disability', dimension: 'disability' },
  { header: 'Client Self-Identifies As', dimension: 'self_identifies_as' },
  { header: 'City', dimension: 'city' },
  { header: 'County', dimension: 'county' },
  { header: 'State', dimension: 'state' },
  { header: 'Zip Code', dimension: 'postal_code' },
  { header: 'Housing Type', dimension: 'housing_type' },
  { header: 'Household Languages', dimension: 'household_languages' },
  { header: 'Household Primary Income Source', dimension: 'primary_income_source' },
  { header: 'Dietary Considerations', dimension: 'dietary_considerations' },
  { header: 'Social Assistance', dimension: 'social_assistance' },
];

export interface Link2FeedVisitStagingDraft {
  sourceRowNumber: number;
  sourceRecordKey: string;
  serviceDate: string;
  sourceClientId: string | null;
  recordedAtSerial: number;
  clientVisitStatus: 'first' | 'returning' | 'unknown';
  encounterSnapshotHash: string;
  recordKind: ServiceEncounterDraft['recordKind'];
  reportedHouseholdCount: number | null;
  reportedPeopleCount: number | null;
  sourceProfileKey: string | null;
  profileSnapshotHash: string | null;
  birthYear: number | null;
  birthYearEstimated: boolean | null;
  birthYearResponseStatus: 'provided' | 'not_provided' | null;
  profileResponses: ServiceProfileResponse[];
  warningCodes: string[];
}

export interface Link2FeedVisitReviewIssueDraft {
  sourceRecordKey: string | null;
  code: string;
  severity: 'info' | 'warning' | 'blocking';
  requiresDecision: boolean;
  field: string | null;
  safeDetails: Record<string, string | number | boolean | null>;
}

interface ResponseCoverage {
  provided: number;
  notProvided: number;
}

export interface Link2FeedVisitParseSummary {
  adapterVersion: number;
  rowCount: number;
  rangeStart: string;
  rangeEnd: string;
  identifiedEncounterCount: number;
  identityUnavailableEncounterCount: number;
  uniqueIdentifiedClientCount: number;
  reportedPeopleCount: number;
  clientVisitStatus: {
    first: number;
    returning: number;
    unknown: number;
  };
  demographicEncounterCoverage: Partial<Record<ServiceProfileDimension, ResponseCoverage>>;
  latestClientDemographicCoverage: Partial<Record<ServiceProfileDimension, ResponseCoverage>>;
  qualityIssueCount: number;
  blockingIssueCount: number;
  warningCount: number;
}

export interface Link2FeedVisitParserOptions {
  maxPeoplePerHouseholdWithoutReview: number;
  batchSize?: number;
  /** Nameless empty fields the exporter appends to each data row. See
   * `detectLink2FeedTrailingFillerColumns`. */
  trailingFillerColumns?: number;
  onRows: (rows: Link2FeedVisitStagingDraft[]) => Promise<void>;
  onIssues: (issues: Link2FeedVisitReviewIssueDraft[]) => Promise<void>;
  onProgress?: (processedRows: number) => Promise<void>;
}

export class Link2FeedVisitImportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly rowNumber?: number,
  ) {
    super(message);
    this.name = 'Link2FeedVisitImportError';
  }
}

const quoteHeader = (header: string): string => `"${header.replace(/"/g, '""')}"`;

// Link2Feed's native visit export writes ISO dates (`YYYY-MM-DD`) and ISO
// datetimes (`YYYY-MM-DD HH:MM:SS`). The serial form below is the spreadsheet
// day-number encoding produced by pre-serialized exports; both are accepted and
// both resolve to the SAME canonical serial, so a record key is identical
// whichever encoding a given export used.
const SPREADSHEET_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
// Slash dates carry no reliable field order and, at two digits, no century.
// They are refused rather than guessed — see `canonicalSerial`.
const AMBIGUOUS_DATE_PATTERN = /^\d{1,2}\/\d{1,2}\/\d{2,4}/;

const canonicalSerial = (
  raw: string | undefined,
  field: string,
  rowNumber: number,
): { serial: string; localDate: string } => {
  const text = String(raw ?? '').trim();
  if (!text) {
    throw new Link2FeedVisitImportError(
      `Row ${rowNumber} has an invalid ${field}. Export the Link2Feed visits again and retry.`,
      'INVALID_LINK2FEED_DATE',
      rowNumber,
    );
  }

  // A spreadsheet round-trip rewrites Link2Feed's ISO dates as `M/D/YY`, which
  // loses the century outright and does not state whether month or day comes
  // first. Importing 2024 as 1924 is worse than refusing the file, so this is a
  // named failure that tells the user what happened rather than a silent guess.
  if (AMBIGUOUS_DATE_PATTERN.test(text)) {
    throw new Link2FeedVisitImportError(
      `Row ${rowNumber} has a ${field} in a spreadsheet-reformatted date style, which does not state its century or field order. Upload the original Link2Feed export instead of a file re-saved through a spreadsheet.`,
      'AMBIGUOUS_LINK2FEED_DATE_FORMAT',
      rowNumber,
    );
  }

  let serial: number;
  const datetimeMatch = ISO_DATETIME_PATTERN.exec(text);
  const dateMatch = ISO_DATE_PATTERN.exec(text);
  if (datetimeMatch || dateMatch) {
    const [, year, month, day, hour, minute, second] = (datetimeMatch ?? dateMatch)!;
    const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day));
    const calendar = new Date(utcMs);
    // Date.UTC rolls impossible values over (2026-02-30 becomes March 2), so a
    // round-trip comparison is what actually rejects them.
    if (
      calendar.getUTCFullYear() !== Number(year)
      || calendar.getUTCMonth() !== Number(month) - 1
      || calendar.getUTCDate() !== Number(day)
    ) {
      throw new Link2FeedVisitImportError(
        `Row ${rowNumber} has an invalid ${field}. Export the Link2Feed visits again and retry.`,
        'INVALID_LINK2FEED_DATE',
        rowNumber,
      );
    }
    const seconds = (Number(hour ?? 0) * 3_600) + (Number(minute ?? 0) * 60) + Number(second ?? 0);
    if (seconds >= 86_400) {
      throw new Link2FeedVisitImportError(
        `Row ${rowNumber} has an invalid ${field}. Export the Link2Feed visits again and retry.`,
        'INVALID_LINK2FEED_DATE',
        rowNumber,
      );
    }
    serial = ((utcMs - SPREADSHEET_EPOCH_UTC_MS) / MS_PER_DAY) + (seconds / 86_400);
  } else {
    serial = Number(text);
  }

  if (!Number.isFinite(serial) || serial < 1) {
    throw new Link2FeedVisitImportError(
      `Row ${rowNumber} has an invalid ${field}. Export the Link2Feed visits again and retry.`,
      'INVALID_LINK2FEED_DATE',
      rowNumber,
    );
  }
  const day = Math.floor(serial);
  const date = new Date(SPREADSHEET_EPOCH_UTC_MS + day * MS_PER_DAY);
  if (date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2200) {
    throw new Link2FeedVisitImportError(
      `Row ${rowNumber} has an out-of-range ${field}. Export the Link2Feed visits again and retry.`,
      'INVALID_LINK2FEED_DATE',
      rowNumber,
    );
  }
  return { serial: serial.toString(), localDate: date.toISOString().slice(0, 10) };
};

const optionalFirstVisitDate = (
  raw: string | undefined,
  field: string,
  rowNumber: number,
): { date: string | null; invalid: boolean } => {
  const text = String(raw ?? '').trim();
  if (!text || text.toLocaleLowerCase('en-US') === 'unknown') {
    return { date: null, invalid: false };
  }
  try {
    return { date: canonicalSerial(text, field, rowNumber).localDate, invalid: false };
  } catch {
    return { date: null, invalid: true };
  }
};

const splitSourceValues = (raw: string | undefined): string[] => String(raw ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

export const link2FeedVisitSourceRecordKey = (
  visitDateSerial: string,
  recordedAtSerial: string,
  sourceClientId: string | null,
  occurrence = 1,
): string => {
  const digest = createHash('sha256').update(JSON.stringify({
    visitDateSerial: Number(visitDateSerial).toString(),
    recordedAtSerial: Number(recordedAtSerial).toString(),
    sourceClientId,
  })).digest('hex');
  return `l2f_visit:${digest}:${occurrence}`;
};

export const link2FeedClientProfileKey = (sourceClientId: string): string => {
  const digest = createHash('sha256').update(sourceClientId).digest('hex');
  return `l2f_client:${digest}`;
};

const householdCount = (raw: string | undefined, rowNumber: number): number => {
  const text = String(raw ?? '').trim();
  const value = Number(text);
  if (!text || !Number.isSafeInteger(value) || value < 1) {
    throw new Link2FeedVisitImportError(
      `Row ${rowNumber} has an invalid Household Size. Correct the source export and retry.`,
      'INVALID_LINK2FEED_HOUSEHOLD_SIZE',
      rowNumber,
    );
  }
  return value;
};

const birthObservation = (
  row: Record<string, string>,
  rowNumber: number,
  referenceYear: number,
) => {
  const rawBirthDate = String(row['Client Date of Birth'] ?? '').trim();
  if (!rawBirthDate) return buildServiceBirthYearObservation(null, null, referenceYear);
  const birthDate = canonicalSerial(rawBirthDate, 'Client Date of Birth', rowNumber).localDate;
  const estimatedRaw = String(row['Client Estimated Date of Birth'] ?? '').trim();
  if (!['0', '1'].includes(estimatedRaw)) {
    throw new Link2FeedVisitImportError(
      `Row ${rowNumber} has an invalid estimated-birth-date marker. Export the Link2Feed visits again and retry.`,
      'INVALID_LINK2FEED_BIRTH_ESTIMATE',
      rowNumber,
    );
  }
  try {
    return buildServiceBirthYearObservation(
      Number(birthDate.slice(0, 4)),
      estimatedRaw === '1',
      referenceYear,
    );
  } catch {
    throw new Link2FeedVisitImportError(
      `Row ${rowNumber} has a birth year after its service date. Review the source data and retry.`,
      'INVALID_LINK2FEED_BIRTH_YEAR',
      rowNumber,
    );
  }
};

const responseRows = (
  row: Record<string, string>,
  availableHeaders: ReadonlySet<string>,
): ServiceProfileResponse[] => {
  const responses = RESPONSE_FIELDS
  .filter(({ header }) => availableHeaders.has(header))
  .map(({ header, dimension }) => buildServiceProfileResponse(
    dimension,
    splitSourceValues(row[header]),
  ));
  const gender = responses.find((response) => response.dimension === 'gender_identity');
  const parentIndex = responses.findIndex(
    (response) => response.dimension === 'gender_identity_parent_type',
  );
  // Parent Types is Link2Feed's derived taxonomy, not a second client answer.
  // A non-answer in Labels can map to "None of These" in Parent Types; carrying
  // that as provided would manufacture participation the client did not give.
  if (gender?.responseStatus === 'not_provided' && parentIndex >= 0) {
    responses[parentIndex] = {
      dimension: 'gender_identity_parent_type',
      responseStatus: 'not_provided',
      values: [],
    };
  }
  return responses;
};

const visitStatus = (
  row: Record<string, string>,
  rowNumber: number,
  serviceDate: string,
): {
  status: 'first' | 'returning' | 'unknown';
  issueCode:
    | 'CONFLICTING_LINK2FEED_FIRST_VISIT'
    | 'INVALID_LINK2FEED_FIRST_VISIT_VALUE'
    | 'LINK2FEED_FIRST_VISIT_AFTER_SERVICE_DATE'
    | null;
} => {
  const personal = optionalFirstVisitDate(
    row['Client First Visit- Personal Tab'],
    'Client First Visit- Personal Tab',
    rowNumber,
  );
  const visit = optionalFirstVisitDate(
    row['Client First Visit-Date'],
    'Client First Visit-Date',
    rowNumber,
  );
  if (personal.invalid || visit.invalid) {
    return { status: 'unknown', issueCode: 'INVALID_LINK2FEED_FIRST_VISIT_VALUE' };
  }
  const personalDate = personal.date;
  const visitDate = visit.date;
  if (personalDate && visitDate && personalDate !== visitDate) {
    return { status: 'unknown', issueCode: 'CONFLICTING_LINK2FEED_FIRST_VISIT' };
  }
  const firstVisitDate = personalDate ?? visitDate;
  if (!firstVisitDate) return { status: 'unknown', issueCode: null };
  if (firstVisitDate === serviceDate) return { status: 'first', issueCode: null };
  if (firstVisitDate < serviceDate) return { status: 'returning', issueCode: null };
  return { status: 'unknown', issueCode: 'LINK2FEED_FIRST_VISIT_AFTER_SERVICE_DATE' };
};

// Link2Feed's native export terminates every DATA row with a delimiter its
// HEADER row does not have, producing one nameless, always-empty field at the
// end of each record. It is a defect in the exporter, not in the data: the
// named columns stay correctly aligned because the surplus sits past the last
// one.
//
// It is deliberately NOT handled with csv-parse's `relax_column_count_more`.
// That option discards ANY surplus field silently, which would also swallow a
// real defect — an unquoted comma mid-row shifts every later value left and
// pushes genuine data into the surplus, so client values would land under the
// wrong headers with no error at all. Instead the filler is measured once and
// declared as part of the expected record shape, leaving strict column counting
// on: a row that is not exactly `headers + filler` fields wide still fails.
const MAX_TRAILING_FILLER_COLUMNS = 4;

export async function detectLink2FeedTrailingFillerColumns(
  input: Readable,
): Promise<number> {
  const parser = input.pipe(parse({
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
    to: 2,
  }));
  let headerWidth: number | null = null;
  try {
    for await (const record of parser) {
      const fields = record as string[];
      if (headerWidth === null) {
        headerWidth = fields.length;
        continue;
      }
      const filler = fields.length - headerWidth;
      if (filler <= 0) return 0;
      if (filler > MAX_TRAILING_FILLER_COLUMNS) {
        throw new Link2FeedVisitImportError(
          `This Link2Feed export has ${filler} more values per row than it has column names, which is too many to treat as export padding. Export the visits again and retry.`,
          'LINK2FEED_ROW_WIDTH_MISMATCH',
          2,
        );
      }
      // Padding is only padding when it carries nothing. A populated surplus
      // means the row is misaligned, not merely terminated with a delimiter.
      const surplus = fields.slice(headerWidth);
      if (surplus.some((value) => String(value ?? '').trim() !== '')) {
        throw new Link2FeedVisitImportError(
          'This Link2Feed export has more values than column names on its first row, and those extra values are not empty. Export the visits again and retry.',
          'LINK2FEED_ROW_WIDTH_MISMATCH',
          2,
        );
      }
      return filler;
    }
  } finally {
    input.destroy();
  }
  return 0;
}

export async function parseLink2FeedVisitCsv(
  input: Readable,
  options: Link2FeedVisitParserOptions,
): Promise<Link2FeedVisitParseSummary> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 2_000) {
    throw new Link2FeedVisitImportError('Link2Feed parser batch size is invalid.', 'INVALID_LINK2FEED_BATCH_SIZE');
  }
  const trailingFillerColumns = options.trailingFillerColumns ?? 0;
  if (
    !Number.isSafeInteger(trailingFillerColumns)
    || trailingFillerColumns < 0
    || trailingFillerColumns > MAX_TRAILING_FILLER_COLUMNS
  ) {
    throw new Link2FeedVisitImportError(
      'Link2Feed trailing filler column count is invalid.',
      'INVALID_LINK2FEED_FILLER_COLUMNS',
    );
  }

  let availableHeaders = new Set<string>();
  const parser = input.pipe(parse({
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
    columns: (headers: string[]) => {
      const inspection = inspectCsvHeader(headers.map(quoteHeader).join(','));
      if (
        inspection.status !== 'detected'
        || inspection.contract.id !== LINK2FEED_VISIT_CONTRACT_ID
      ) {
        throw new Link2FeedVisitImportError(
          'This staged CSV no longer matches the Link2Feed visit contract.',
          'LINK2FEED_VISIT_CONTRACT_MISMATCH',
        );
      }
      availableHeaders = new Set(headers.filter((header) => PROJECTED_HEADERS.has(header)));
      // csv-parse omits columns mapped to false, so ignored columns, Notes, and
      // the exporter's trailing filler are never materialized as row values.
      return [
        ...headers.map((header) => PROJECTED_HEADERS.has(header) ? header : false),
        ...Array.from({ length: trailingFillerColumns }, () => false as const),
      ];
    },
  }));

  const rows: Link2FeedVisitStagingDraft[] = [];
  const issues: Link2FeedVisitReviewIssueDraft[] = [];
  const identityOccurrences = new Map<string, number>();
  const identifiedClients = new Set<string>();
  const demographicEncounterCoverage: Partial<Record<ServiceProfileDimension, ResponseCoverage>> = {};
  const latestProfilesByClient = new Map<string, {
    serviceDate: string;
    recordedAtSerial: number;
    sourceRecordKey: string;
    responses: ServiceProfileResponse[];
  }>();
  let rowCount = 0;
  let rangeStart = '';
  let rangeEnd = '';
  let identifiedEncounterCount = 0;
  let identityUnavailableEncounterCount = 0;
  let reportedPeopleCount = 0;
  let qualityIssueCount = 0;
  let blockingIssueCount = 0;
  let warningCount = 0;
  const statusCounts = { first: 0, returning: 0, unknown: 0 };

  const flush = async (): Promise<void> => {
    if (rows.length > 0) await options.onRows(rows.splice(0));
    if (issues.length > 0) await options.onIssues(issues.splice(0));
  };

  try {
    for await (const record of parser) {
      rowCount += 1;
      const sourceRowNumber = rowCount + 1;
      const row = record as Record<string, string>;
      const visit = canonicalSerial(row['Visit Date'], 'Visit Date', sourceRowNumber);
      const recorded = canonicalSerial(row['Recorded At'], 'Recorded At', sourceRowNumber);
      const sourceClientId = String(row['Client ID'] ?? '').trim() || null;
      const identityBase = JSON.stringify([visit.serial, recorded.serial, sourceClientId]);
      const occurrence = (identityOccurrences.get(identityBase) ?? 0) + 1;
      identityOccurrences.set(identityBase, occurrence);
      const sourceRecordKey = link2FeedVisitSourceRecordKey(
        visit.serial,
        recorded.serial,
        sourceClientId,
        occurrence,
      );
      const peopleCount = householdCount(row['Household Size'], sourceRowNumber);
      const visitStatusResult = sourceClientId
        ? visitStatus(row, sourceRowNumber, visit.localDate)
        : { status: 'unknown' as const, issueCode: null };
      const clientVisitStatus = visitStatusResult.status;
      const encounter: ServiceEncounterDraft = {
        source: LINK2FEED_SOURCE,
        sourceRecordKey,
        serviceDate: visit.localDate,
        sourceClientId,
        recordKind: sourceClientId
          ? 'identified_household_encounter'
          : 'identity_unavailable_encounter',
        clientVisitStatus,
        reportedHouseholdCount: 1,
        reportedPeopleCount: peopleCount,
      };
      const rowWarningCodes: string[] = [];
      if (visitStatusResult.issueCode) {
        rowWarningCodes.push(visitStatusResult.issueCode);
        issues.push({
          sourceRecordKey,
          code: visitStatusResult.issueCode,
          severity: 'warning',
          requiresDecision: false,
          field: 'Client First Visit-Date',
          safeDetails: {
            rowNumber: sourceRowNumber,
            serviceDate: visit.localDate,
            sourceField: 'Client First Visit-Date',
            explanationCode: visitStatusResult.issueCode,
          },
        });
        qualityIssueCount += 1;
        warningCount += 1;
      }
      if (occurrence > 1) {
        rowWarningCodes.push('DUPLICATE_LINK2FEED_VISIT_IDENTITY');
        issues.push({
          sourceRecordKey,
          code: 'DUPLICATE_LINK2FEED_VISIT_IDENTITY',
          severity: 'blocking',
          requiresDecision: true,
          field: null,
          safeDetails: {
            rowNumber: sourceRowNumber,
            serviceDate: visit.localDate,
            occurrenceCount: occurrence,
            contractId: LINK2FEED_VISIT_CONTRACT_ID,
          },
        });
        qualityIssueCount += 1;
        blockingIssueCount += 1;
      }
      for (const issue of reviewServiceEncounter(encounter, {
        maxPeoplePerHouseholdWithoutReview: options.maxPeoplePerHouseholdWithoutReview,
      })) {
        rowWarningCodes.push(issue.code);
        issues.push({
          sourceRecordKey,
          code: issue.code,
          severity: 'warning',
          requiresDecision: true,
          field: issue.field,
          safeDetails: {
            rowNumber: sourceRowNumber,
            serviceDate: visit.localDate,
            sourceField: 'Household Size',
            observedCount: issue.value,
            expectedMaximum: options.maxPeoplePerHouseholdWithoutReview,
            recordKind: encounter.recordKind,
          },
        });
        qualityIssueCount += 1;
        warningCount += 1;
      }

      let profile: ServiceClientProfileDraft | null = null;
      if (sourceClientId) {
        identifiedEncounterCount += 1;
        identifiedClients.add(sourceClientId);
        const birth = birthObservation(row, sourceRowNumber, Number(visit.localDate.slice(0, 4)));
        const responses = responseRows(row, availableHeaders);
        for (const response of responses) {
          const coverage = demographicEncounterCoverage[response.dimension]
            ?? { provided: 0, notProvided: 0 };
          if (response.responseStatus === 'provided') coverage.provided += 1;
          else coverage.notProvided += 1;
          demographicEncounterCoverage[response.dimension] = coverage;
        }
        profile = {
          source: LINK2FEED_SOURCE,
          sourceProfileKey: link2FeedClientProfileKey(sourceClientId),
          sourceClientId,
          observedDate: visit.localDate,
          birthYear: birth.birthYear,
          birthYearEstimated: birth.birthYearEstimated,
          responseStatus: birth.responseStatus,
          responses,
        };
        const previous = latestProfilesByClient.get(sourceClientId);
        if (
          !previous
          || visit.localDate > previous.serviceDate
          || (
            visit.localDate === previous.serviceDate
            && Number(recorded.serial) > previous.recordedAtSerial
          )
          || (
            visit.localDate === previous.serviceDate
            && Number(recorded.serial) === previous.recordedAtSerial
            && sourceRecordKey.localeCompare(previous.sourceRecordKey) > 0
          )
        ) {
          latestProfilesByClient.set(sourceClientId, {
            serviceDate: visit.localDate,
            recordedAtSerial: Number(recorded.serial),
            sourceRecordKey,
            responses,
          });
        }
      } else {
        identityUnavailableEncounterCount += 1;
      }

      statusCounts[clientVisitStatus] += 1;
      reportedPeopleCount += peopleCount;
      rangeStart = !rangeStart || visit.localDate < rangeStart ? visit.localDate : rangeStart;
      rangeEnd = !rangeEnd || visit.localDate > rangeEnd ? visit.localDate : rangeEnd;
      rows.push({
        sourceRowNumber,
        sourceRecordKey,
        serviceDate: visit.localDate,
        sourceClientId,
        recordedAtSerial: Number(recorded.serial),
        clientVisitStatus,
        encounterSnapshotHash: serviceEncounterSnapshotHash(encounter),
        recordKind: encounter.recordKind,
        reportedHouseholdCount: encounter.reportedHouseholdCount,
        reportedPeopleCount: encounter.reportedPeopleCount,
        sourceProfileKey: profile?.sourceProfileKey ?? null,
        profileSnapshotHash: profile ? serviceClientProfileSnapshotHash(profile) : null,
        birthYear: profile?.birthYear ?? null,
        birthYearEstimated: profile?.birthYearEstimated ?? null,
        birthYearResponseStatus: profile?.responseStatus ?? null,
        profileResponses: profile?.responses ?? [],
        warningCodes: rowWarningCodes,
      });

      if (rows.length >= batchSize || issues.length >= batchSize) await flush();
      if (options.onProgress && rowCount % 5_000 === 0) await options.onProgress(rowCount);
    }
  } catch (error) {
    if (error instanceof Link2FeedVisitImportError) throw error;
    throw new Link2FeedVisitImportError(
      `FEED could not parse the Link2Feed visit CSV near row ${rowCount + 2}. Export it again and retry.`,
      'MALFORMED_LINK2FEED_VISIT_CSV',
      rowCount + 2,
    );
  }

  await flush();
  if (rowCount === 0) {
    throw new Link2FeedVisitImportError(
      'The Link2Feed visit CSV contains no visit rows.',
      'EMPTY_LINK2FEED_VISIT_CSV',
    );
  }

  const latestClientDemographicCoverage: Partial<Record<ServiceProfileDimension, ResponseCoverage>> = {};
  for (const profile of latestProfilesByClient.values()) {
    for (const response of profile.responses) {
      const coverage = latestClientDemographicCoverage[response.dimension]
        ?? { provided: 0, notProvided: 0 };
      if (response.responseStatus === 'provided') coverage.provided += 1;
      else coverage.notProvided += 1;
      latestClientDemographicCoverage[response.dimension] = coverage;
    }
  }

  return {
    adapterVersion: LINK2FEED_VISIT_ADAPTER_VERSION,
    rowCount,
    rangeStart,
    rangeEnd,
    identifiedEncounterCount,
    identityUnavailableEncounterCount,
    uniqueIdentifiedClientCount: identifiedClients.size,
    reportedPeopleCount,
    clientVisitStatus: statusCounts,
    demographicEncounterCoverage,
    latestClientDemographicCoverage,
    qualityIssueCount,
    blockingIssueCount,
    warningCount,
  };
}
