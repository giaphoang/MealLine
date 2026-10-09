// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';
import { parse } from 'csv-parse';
import type { Readable } from 'stream';
import {
  inspectCsvHeader,
  SIMC_SERVICE_VISIT_ALLOWED_HEADERS,
} from '../../data-import/source-contracts';
import {
  serviceEncounterSnapshotHash,
  validateServiceEncounter,
} from '../foundation';
import {
  buildServiceBirthYearObservation,
  buildServiceProfileResponse,
  serviceClientProfileSnapshotHash,
  servicePersonProfileSnapshotHash,
  type ServiceClientProfileDraft,
  type ServicePersonProfileDraft,
  type ServiceProfileDimension,
  type ServiceProfileResponse,
} from '../profiles';

export const SIMC_SERVICE_VISIT_CONTRACT_ID = 'simc_service_visits_v1';
export const SIMC_SOURCE = 'simc';
export const SIMC_SERVICE_VISIT_ADAPTER_VERSION = 1;

const PROJECTED_HEADERS = new Set<string>(
  SIMC_SERVICE_VISIT_ALLOWED_HEADERS.filter((header) => header !== 'Additional Notes'),
);

type SourceRow = Record<string, string>;
type ResponseCoverage = { provided: number; notProvided: number };

export interface SimcVisitStagingDraft {
  sourceRowNumber: number;
  sourceRecordKey: string;
  serviceDate: string;
  sourceHouseholdId: string | null;
  sourceEventId: string | null;
  sourceRecordedAt: string | null;
  encounterSnapshotHash: string;
  recordKind: 'identified_household_encounter' | 'identity_unavailable_encounter';
  reportedHouseholdCount: number;
  reportedPeopleCount: number;
  numberAdults: number;
  numberChildren: number;
  numberSeniors: number;
  numberUnknownAge: number;
  sourceProfileKey: string | null;
  profileSnapshotHash: string | null;
  profileResponses: ServiceProfileResponse[];
  warningCodes: string[];
}

export interface SimcPersonStagingDraft {
  sourcePersonId: string;
  sourceProfileKey: string;
  observedDate: string;
  profileSnapshotHash: string;
  birthYear: number | null;
  birthYearEstimated: boolean | null;
  birthYearResponseStatus: 'provided' | 'not_provided';
  profileResponses: ServiceProfileResponse[];
}

export interface SimcEncounterPersonStagingDraft {
  sourceRecordKey: string;
  sourcePersonId: string;
  isHeadOfHousehold: boolean;
}

export interface SimcReviewIssueDraft {
  sourceRecordKey: string | null;
  code: string;
  severity: 'info' | 'warning' | 'blocking';
  requiresDecision: boolean;
  field: string | null;
  safeDetails: Record<string, string | number | boolean | null>;
}

export interface SimcServiceVisitParseSummary {
  adapterVersion: number;
  rawRowCount: number;
  visitCount: number;
  rangeStart: string;
  rangeEnd: string;
  serviceDateCount: number;
  eventCount: number;
  identifiedHouseholdCount: number;
  identifiedPersonCount: number;
  reportedPeopleCount: number;
  memberRowCount: number;
  memberCoveragePercent: number;
  visitsWithMemberCountMismatch: number;
  netMissingMemberRows: number;
  householdDatePairsWithMultipleVisits: number;
  demographicCoverage: Partial<Record<ServiceProfileDimension, ResponseCoverage>>;
  qualityIssueCount: number;
  warningCount: number;
}

export interface SimcParserOptions {
  onVisits: (rows: SimcVisitStagingDraft[]) => Promise<void>;
  onPeople: (rows: SimcPersonStagingDraft[]) => Promise<void>;
  onMemberships: (rows: SimcEncounterPersonStagingDraft[]) => Promise<void>;
  onIssues: (issues: SimcReviewIssueDraft[]) => Promise<void>;
  onProgress?: (processedRows: number) => Promise<void>;
}

export class SimcServiceVisitImportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly rowNumber?: number,
  ) {
    super(message);
    this.name = 'SimcServiceVisitImportError';
  }
}

const quoteHeader = (header: string) => `"${header.replace(/"/g, '""')}"`;
const clean = (value: string | undefined) => String(value ?? '').trim().replace(/\s+/g, ' ');
const yes = (value: string | undefined) => clean(value).toLocaleLowerCase('en-US') === 'yes';

const parseDateTime = (raw: string | undefined, field: string, rowNumber: number) => {
  const text = clean(raw);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+(AM|PM))?$/i.exec(text);
  if (!match) {
    throw new SimcServiceVisitImportError(
      `Row ${rowNumber} has an invalid ${field}. Export the SIMC service data again and retry.`,
      'INVALID_SIMC_DATE',
      rowNumber,
    );
  }
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const sourceHour = Number(match[4]);
  const meridiem = match[7]?.toLocaleUpperCase('en-US');
  const hour = meridiem === 'PM' && sourceHour < 12
    ? sourceHour + 12
    : meridiem === 'AM' && sourceHour === 12 ? 0 : sourceHour;
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day || hour > 23 || sourceHour < 0
    || (meridiem && (sourceHour < 1 || sourceHour > 12))
    || minute > 59 || second > 59
  ) {
    throw new SimcServiceVisitImportError(
      `Row ${rowNumber} has an invalid ${field}. Export the SIMC service data again and retry.`,
      'INVALID_SIMC_DATE',
      rowNumber,
    );
  }
  const localDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { localDate, localDateTime: `${localDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}` };
};

const wholeNumber = (raw: string | undefined, field: string, rowNumber: number, minimum = 0) => {
  const text = clean(raw);
  const value = Number(text);
  if (!text || !Number.isSafeInteger(value) || value < minimum) {
    throw new SimcServiceVisitImportError(
      `Row ${rowNumber} has an invalid ${field}. Correct the SIMC export and retry.`,
      'INVALID_SIMC_COUNT',
      rowNumber,
    );
  }
  return value;
};

const nonAnswer = (value: string) => {
  const key = clean(value).replace(/[’]/g, "'").toLocaleLowerCase('en-US');
  return !key || key === '/' || key === "don't know / prefer not to answer"
    || key === 'dont know / prefer not to answer' || key === 'do not know / prefer not to answer';
};

/**
 * SIMC answer labels that contain a comma of their own.
 *
 * The export joins multiple answers with a comma, and four of its category
 * names contain one — so a naive split shreds them. "Hispanic, Latino, or
 * Spanish" became three answers ("Hispanic", "Latino", "or Spanish"), each
 * counted separately, and a race breakdown built on that would have shown
 * "or Spanish" as a race.
 *
 * The delimiter cannot be changed to fix this: "Asian, Chinese" really is two
 * answers. The only reliable rule is to know which labels contain commas and
 * hold them aside before splitting. Extend this list when SIMC adds a category
 * with a comma in it; a value that arrives split into obvious fragments is the
 * symptom.
 *
 * Sorted longest-first so an overlapping label cannot be partly consumed by a
 * shorter one.
 */
const SIMC_LABELS_CONTAINING_COMMAS: readonly string[] = [
  'I have a place to live today, but I am worried about losing it in the future',
  'No, never on active duty except for initial/basic training',
  'No, never served in the U.S. Armed Forces',
  'Hispanic, Latino, or Spanish',
].sort((left, right) => right.length - left.length);

/** Placeholder that cannot occur in exported text. */
const HOLD = '\u0000';

const commaValues = (raw: string | undefined) => {
  let text = clean(raw);
  const held: string[] = [];

  for (const label of SIMC_LABELS_CONTAINING_COMMAS) {
    for (;;) {
      const at = text.toLocaleLowerCase('en-US').indexOf(label.toLocaleLowerCase('en-US'));
      if (at === -1) break;
      held.push(text.slice(at, at + label.length));
      text = `${text.slice(0, at)}${HOLD}${held.length - 1}${HOLD}${text.slice(at + label.length)}`;
    }
  }

  return text
    .split(',')
    .map(clean)
    .filter(Boolean)
    .map((value) => value.replace(
      new RegExp(`${HOLD}(\\d+)${HOLD}`, 'g'),
      (_, index: string) => held[Number(index)],
    ));
};
const answerValues = (raw: string | undefined) => commaValues(raw).filter((value) => !nonAnswer(value));
const languageResponse = (raw: string | undefined) => {
  const values = answerValues(raw)
    .map((value) => value.replace(/\s*\(Language Translation Needed\)\s*/gi, '').trim())
    .filter(Boolean);
  return {
    languages: buildServiceProfileResponse('household_languages', values),
    translation: buildServiceProfileResponse(
      'translation_needed',
      /\(Language Translation Needed\)/i.test(clean(raw)) && values.length > 0 ? ['Yes'] : [],
    ),
  };
};

const buildResponse = (dimension: ServiceProfileDimension, raw: string | undefined) => (
  buildServiceProfileResponse(dimension, answerValues(raw))
);

const householdResponses = (row: SourceRow, availableHeaders: ReadonlySet<string>): ServiceProfileResponse[] => {
  const language = languageResponse(row['Preferred Language(s)']);
  const fields: Array<[string, ServiceProfileDimension]> = [
    ['Household City', 'city'], ['Household County', 'county'],
    ['Household FIPS', 'county_fips'], ['Household ST', 'state'],
    ['Household Zip', 'postal_code'], ['No Fixed Address', 'no_fixed_address'],
    ['Household Dietary Factors or Concerns', 'dietary_considerations'],
    ['Household Disability Status', 'disability'], ['Household Employment', 'employment'],
    ['Household Food Insecurity(run out of food/ does not last)', 'food_insecurity'],
    ['Household Living Situation', 'housing_stability'],
    ['Household Military Status', 'military_status'],
    ['SNAP Participation', 'snap_participation'],
    ['Other Government Program(s)', 'government_programs'],
    ['Additional Assistance', 'social_assistance'],
  ];
  const responses = fields
    .filter(([header]) => availableHeaders.has(header))
    .map(([header, dimension]) => buildResponse(dimension, row[header]));
  if (availableHeaders.has('Preferred Language(s)')) responses.push(language.languages, language.translation);
  return responses;
};

const personResponses = (row: SourceRow): ServiceProfileResponse[] => [
  buildResponse('gender_identity', row['Neighbor Gender Identity']),
  buildResponse('race_or_ethnicity', row['Neighbor Race or Ethnicity']),
];

const profileKey = (prefix: string, id: string) => `${prefix}:${createHash('sha256').update(id).digest('hex')}`;

const birthYear = (row: SourceRow, rowNumber: number, serviceYear: number) => {
  const raw = clean(row['Neighbor Date of Birth']);
  if (!raw || nonAnswer(raw)) return buildServiceBirthYearObservation(null, null, serviceYear);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw);
  if (!match) {
    throw new SimcServiceVisitImportError(
      `Row ${rowNumber} has an invalid Neighbor Date of Birth. Export the SIMC service data again and retry.`,
      'INVALID_SIMC_BIRTH_DATE',
      rowNumber,
    );
  }
  const sourceAge = wholeNumber(row['Neighbor Age'], 'Neighbor Age', rowNumber);
  const rawYear = Number(match[3]);
  const candidates = match[3].length === 4 ? [rawYear] : [1900 + rawYear, 2000 + rawYear];
  const year = candidates
    .filter((candidate) => candidate <= serviceYear)
    .sort((left, right) => (
      Math.abs((serviceYear - left) - sourceAge) - Math.abs((serviceYear - right) - sourceAge)
    ))[0];
  const month = Number(match[1]);
  const day = Number(match[2]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    !year || calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day
    || Math.abs((serviceYear - year) - sourceAge) > 1
  ) {
    throw new SimcServiceVisitImportError(
      `Row ${rowNumber} has conflicting Neighbor age and birth-date values. Correct the SIMC export and retry.`,
      'INVALID_SIMC_BIRTH_YEAR',
      rowNumber,
    );
  }
  return buildServiceBirthYearObservation(year, false, serviceYear);
};

interface VisitAccumulator {
  visitId: string;
  firstRowNumber: number;
  rows: SourceRow[];
}

export async function parseSimcServiceVisitCsv(
  input: Readable,
  options: SimcParserOptions,
): Promise<SimcServiceVisitParseSummary> {
  let availableHeaders = new Set<string>();
  const parser = input.pipe(parse({
    bom: true,
    skip_empty_lines: true,
    relax_column_count: false,
    columns: (headers: string[]) => {
      const inspection = inspectCsvHeader(headers.map(quoteHeader).join(','));
      if (inspection.status !== 'detected' || inspection.contract.id !== SIMC_SERVICE_VISIT_CONTRACT_ID) {
        throw new SimcServiceVisitImportError(
          'This staged CSV no longer matches the SIMC service visit contract.',
          'SIMC_SERVICE_VISIT_CONTRACT_MISMATCH',
        );
      }
      availableHeaders = new Set(headers.filter((header) => PROJECTED_HEADERS.has(header)));
      return headers.map((header) => PROJECTED_HEADERS.has(header) ? header : false);
    },
  }));

  const visits = new Map<string, VisitAccumulator>();
  let rawRowCount = 0;
  try {
    for await (const record of parser) {
      rawRowCount += 1;
      const rowNumber = rawRowCount + 1;
      const row = record as SourceRow;
      const visitId = clean(row['Visit ID']);
      if (!visitId || visitId.length > 256) {
        throw new SimcServiceVisitImportError(
          `Row ${rowNumber} has an invalid Visit ID. Export the SIMC service data again and retry.`,
          'INVALID_SIMC_VISIT_ID',
          rowNumber,
        );
      }
      const group = visits.get(visitId) ?? { visitId, firstRowNumber: rowNumber, rows: [] };
      group.rows.push(row);
      visits.set(visitId, group);
      if (options.onProgress && rawRowCount % 5_000 === 0) await options.onProgress(rawRowCount);
    }
  } catch (error) {
    if (error instanceof SimcServiceVisitImportError) throw error;
    throw new SimcServiceVisitImportError(
      `FEED could not parse the SIMC service CSV near row ${rawRowCount + 2}. Export it again and retry.`,
      'MALFORMED_SIMC_SERVICE_CSV',
      rawRowCount + 2,
    );
  }
  if (rawRowCount === 0) {
    throw new SimcServiceVisitImportError('The SIMC service CSV contains no service rows.', 'EMPTY_SIMC_SERVICE_CSV');
  }

  const encounterDrafts: SimcVisitStagingDraft[] = [];
  const memberships: SimcEncounterPersonStagingDraft[] = [];
  const people = new Map<string, { observedAt: string; draft: SimcPersonStagingDraft }>();
  const latestHouseholdProfile = new Map<string, { observedAt: string; sourceRecordKey: string }>();
  const households = new Set<string>();
  const householdDateVisits = new Map<string, number>();
  const dates = new Set<string>();
  const events = new Set<string>();
  const issues: SimcReviewIssueDraft[] = [];
  const demographicCoverage: Partial<Record<ServiceProfileDimension, ResponseCoverage>> = {};
  let rangeStart = '';
  let rangeEnd = '';
  let reportedPeopleCount = 0;
  let visitsWithMemberCountMismatch = 0;
  let netMissingMemberRows = 0;

  const assertInvariant = (rows: SourceRow[], header: string, visitId: string) => {
    const values = new Set(rows.map((row) => clean(row[header])));
    if (values.size !== 1) {
      throw new SimcServiceVisitImportError(
        `Visit ${visitId} has conflicting ${header} values. Correct the SIMC export and retry.`,
        'CONFLICTING_SIMC_VISIT_VALUES',
      );
    }
    return [...values][0];
  };

  for (const visit of visits.values()) {
    const first = visit.rows[0];
    const visitId = visit.visitId;
    const sourceRecordKey = `simc_visit:${visitId}`;
    const visitDate = parseDateTime(assertInvariant(visit.rows, 'Visit Date', visitId), 'Visit Date', visit.firstRowNumber);
    const recorded = parseDateTime(assertInvariant(visit.rows, 'Visit Recorded On', visitId), 'Visit Recorded On', visit.firstRowNumber);
    const anonymous = yes(assertInvariant(visit.rows, 'Anonymous', visitId));
    const householdIdRaw = assertInvariant(visit.rows, 'Household ID', visitId);
    const sourceHouseholdId = anonymous ? null : householdIdRaw;
    if (!anonymous && (!sourceHouseholdId || sourceHouseholdId.length > 256)) {
      throw new SimcServiceVisitImportError(
        `Visit ${visitId} does not have a valid Household ID. Correct the SIMC export and retry.`,
        'INVALID_SIMC_HOUSEHOLD_ID',
      );
    }
    const size = wholeNumber(assertInvariant(visit.rows, 'Household Size', visitId), 'Household Size', visit.firstRowNumber, 1);
    const numberAdults = wholeNumber(assertInvariant(visit.rows, 'Number of Adults', visitId), 'Number of Adults', visit.firstRowNumber);
    const numberChildren = wholeNumber(assertInvariant(visit.rows, 'Number of Children', visitId), 'Number of Children', visit.firstRowNumber);
    const numberSeniors = wholeNumber(assertInvariant(visit.rows, 'Number of Seniors', visitId), 'Number of Seniors', visit.firstRowNumber);
    const numberUnknownAge = wholeNumber(assertInvariant(visit.rows, 'Number of Unknown Age HH Members', visitId), 'Number of Unknown Age HH Members', visit.firstRowNumber);
    if (numberAdults + numberChildren + numberSeniors + numberUnknownAge !== size) {
      throw new SimcServiceVisitImportError(
        `Visit ${visitId} household composition does not equal Household Size. Correct the SIMC export and retry.`,
        'SIMC_COMPOSITION_COUNT_MISMATCH',
      );
    }
    const eventId = assertInvariant(visit.rows, 'Event ID', visitId) || null;
    const memberIds = anonymous ? [] : [...new Set(visit.rows.map((row) => clean(row['Neighbor ID'])).filter(Boolean))];
    const headIds = anonymous ? [] : [...new Set(visit.rows.filter((row) => yes(row['Head of Household'])).map((row) => clean(row['Neighbor ID'])).filter(Boolean))];
    /**
     * A household of one is its own head.
     *
     * SIMC does not force the Head of Household box on a single-member
     * visit, and one such row aborted an entire 3,799-visit import in
     * production (ISSUES.md #76). There is nothing to disambiguate when the
     * household has one member — refusing it discards 3,798 good visits over a
     * box nobody was required to tick.
     *
     * The strictness is still right everywhere else. Zero heads across
     * *several* members is a real ambiguity: the export does not say who the
     * household is recorded under, and guessing would attach demographics to
     * the wrong person. More than one head is a contradiction. Both still fail.
     */
    const headId = anonymous
      ? null
      : headIds.length === 1
        ? headIds[0]
        : headIds.length === 0 && memberIds.length === 1
          ? memberIds[0]
          : null;
    if (!anonymous && headId === null) {
      throw new SimcServiceVisitImportError(
        headIds.length > 1
          ? `Visit ${visitId} identifies ${headIds.length} Heads of Household; it must identify exactly one. `
            + 'Correct the SIMC export and retry.'
          : `Visit ${visitId} has ${memberIds.length} household members and no Head of Household. `
            + 'Correct the SIMC export and retry.',
        'INVALID_SIMC_HOUSEHOLD_HEAD',
      );
    }
    const encounter = validateServiceEncounter({
      source: SIMC_SOURCE,
      sourceRecordKey,
      serviceDate: visitDate.localDate,
      sourceClientId: sourceHouseholdId,
      recordKind: sourceHouseholdId ? 'identified_household_encounter' : 'identity_unavailable_encounter',
      clientVisitStatus: 'unknown',
      reportedHouseholdCount: 1,
      reportedPeopleCount: size,
      sourceEventId: eventId,
      sourceRecordedAt: recorded.localDateTime,
      numberAdults,
      numberChildren,
      numberSeniors,
      numberUnknownAge,
      sourcePersonIds: memberIds,
      headOfHouseholdSourcePersonId: headId,
    });
    const warningCodes: string[] = [];
    const memberDifference = size - memberIds.length;
    if (memberDifference !== 0) {
      visitsWithMemberCountMismatch += 1;
      netMissingMemberRows += memberDifference;
      warningCodes.push('SIMC_MEMBER_COUNT_MISMATCH');
      issues.push({
        sourceRecordKey,
        code: 'SIMC_MEMBER_COUNT_MISMATCH',
        severity: 'warning',
        requiresDecision: false,
        field: 'Neighbor ID',
        safeDetails: {
          serviceDate: visitDate.localDate,
          reportedPeopleCount: size,
          identifiedMemberCount: memberIds.length,
          difference: memberDifference,
        },
      });
    }
    let householdProfile: ServiceClientProfileDraft | null = null;
    if (sourceHouseholdId) {
      households.add(sourceHouseholdId);
      householdProfile = {
        source: SIMC_SOURCE,
        sourceProfileKey: profileKey('simc_household', sourceHouseholdId),
        sourceClientId: sourceHouseholdId,
        observedDate: visitDate.localDate,
        birthYear: null,
        birthYearEstimated: null,
        responseStatus: 'not_provided',
        responses: householdResponses(first, availableHeaders),
      };
      const previous = latestHouseholdProfile.get(sourceHouseholdId);
      if (!previous || recorded.localDateTime >= previous.observedAt) {
        latestHouseholdProfile.set(sourceHouseholdId, {
          observedAt: recorded.localDateTime,
          sourceRecordKey,
        });
      }
    }
    encounterDrafts.push({
      sourceRowNumber: visit.firstRowNumber,
      sourceRecordKey,
      serviceDate: visitDate.localDate,
      sourceHouseholdId,
      sourceEventId: eventId,
      sourceRecordedAt: recorded.localDateTime,
      encounterSnapshotHash: serviceEncounterSnapshotHash(encounter),
      recordKind: encounter.recordKind as SimcVisitStagingDraft['recordKind'],
      reportedHouseholdCount: 1,
      reportedPeopleCount: size,
      numberAdults,
      numberChildren,
      numberSeniors,
      numberUnknownAge,
      sourceProfileKey: householdProfile?.sourceProfileKey ?? null,
      profileSnapshotHash: householdProfile ? serviceClientProfileSnapshotHash(householdProfile) : null,
      profileResponses: householdProfile?.responses ?? [],
      warningCodes,
    });

    for (const personId of memberIds) {
      memberships.push({
        sourceRecordKey,
        sourcePersonId: personId,
        isHeadOfHousehold: personId === headId,
      });
    }

    for (const row of visit.rows) {
      if (anonymous) continue;
      const personId = clean(row['Neighbor ID']);
      if (!personId || personId.length > 256) continue;
      const birth = birthYear(row, visit.firstRowNumber, Number(visitDate.localDate.slice(0, 4)));
      const profile: ServicePersonProfileDraft = {
        source: SIMC_SOURCE,
        sourceProfileKey: profileKey('simc_person', personId),
        sourcePersonId: personId,
        observedDate: visitDate.localDate,
        birthYear: birth.birthYear,
        birthYearEstimated: birth.birthYearEstimated,
        responseStatus: birth.responseStatus,
        responses: personResponses(row),
      };
      const draft: SimcPersonStagingDraft = {
        sourcePersonId: personId,
        sourceProfileKey: profile.sourceProfileKey,
        observedDate: visitDate.localDate,
        profileSnapshotHash: servicePersonProfileSnapshotHash(profile),
        birthYear: profile.birthYear,
        birthYearEstimated: profile.birthYearEstimated,
        birthYearResponseStatus: profile.responseStatus,
        profileResponses: profile.responses,
      };
      const previous = people.get(personId);
      if (!previous || recorded.localDateTime >= previous.observedAt) people.set(personId, { observedAt: recorded.localDateTime, draft });
    }

    const householdDateKey = `${visitDate.localDate}:${sourceHouseholdId ?? `anonymous:${visitId}`}`;
    householdDateVisits.set(householdDateKey, (householdDateVisits.get(householdDateKey) ?? 0) + 1);
    dates.add(visitDate.localDate);
    if (eventId) events.add(eventId);
    rangeStart = !rangeStart || visitDate.localDate < rangeStart ? visitDate.localDate : rangeStart;
    rangeEnd = !rangeEnd || visitDate.localDate > rangeEnd ? visitDate.localDate : rangeEnd;
    reportedPeopleCount += size;
  }

  for (const { draft } of people.values()) {
    for (const response of draft.profileResponses) {
      const coverage = demographicCoverage[response.dimension] ?? { provided: 0, notProvided: 0 };
      if (response.responseStatus === 'provided') coverage.provided += 1;
      else coverage.notProvided += 1;
      demographicCoverage[response.dimension] = coverage;
    }
  }

  // Household attributes repeat on every member and visit. Keep one latest
  // household profile per artifact without manufacturing visit-grain profile
  // revisions; encounters themselves remain complete and independent.
  for (const draft of encounterDrafts) {
    if (
      draft.sourceHouseholdId
      && latestHouseholdProfile.get(draft.sourceHouseholdId)?.sourceRecordKey !== draft.sourceRecordKey
    ) {
      draft.sourceProfileKey = null;
      draft.profileSnapshotHash = null;
      draft.profileResponses = [];
    }
  }

  const repeatedHouseholdDays = [...householdDateVisits.values()].filter((count) => count > 1).length;
  if (repeatedHouseholdDays > 0) {
    issues.push({
      sourceRecordKey: null,
      code: 'SIMC_MULTIPLE_VISITS_SAME_HOUSEHOLD_DAY',
      severity: 'info',
      requiresDecision: false,
      field: 'Visit ID',
      safeDetails: { householdDatePairCount: repeatedHouseholdDays },
    });
  }

  await options.onVisits(encounterDrafts);
  await options.onPeople([...people.values()].map(({ draft }) => draft));
  await options.onMemberships(memberships);
  if (issues.length > 0) await options.onIssues(issues);

  return {
    adapterVersion: SIMC_SERVICE_VISIT_ADAPTER_VERSION,
    rawRowCount,
    visitCount: encounterDrafts.length,
    rangeStart,
    rangeEnd,
    serviceDateCount: dates.size,
    eventCount: events.size,
    identifiedHouseholdCount: households.size,
    identifiedPersonCount: people.size,
    reportedPeopleCount,
    memberRowCount: memberships.length,
    memberCoveragePercent: reportedPeopleCount === 0 ? 0 : Number((memberships.length / reportedPeopleCount * 100).toFixed(2)),
    visitsWithMemberCountMismatch,
    netMissingMemberRows,
    householdDatePairsWithMultipleVisits: repeatedHouseholdDays,
    demographicCoverage,
    qualityIssueCount: issues.length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
  };
}
