// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';
import { ServiceFoundationError } from './foundation';

export const SERVICE_PROFILE_RESPONSE_STATUSES = ['provided', 'not_provided'] as const;
export const SERVICE_PROFILE_DIMENSIONS = [
  'gender_identity',
  'gender_identity_parent_type',
  'ethnicity',
  'disability',
  'self_identifies_as',
  'city',
  'county',
  'state',
  'postal_code',
  'housing_type',
  'household_languages',
  'primary_income_source',
  'dietary_considerations',
  'social_assistance',
  'race_or_ethnicity',
  'county_fips',
  'no_fixed_address',
  'housing_stability',
  'snap_participation',
  'government_programs',
  'employment',
  'food_insecurity',
  'military_status',
  'translation_needed',
] as const;

export type ServiceProfileResponseStatus = typeof SERVICE_PROFILE_RESPONSE_STATUSES[number];
export type ServiceProfileDimension = typeof SERVICE_PROFILE_DIMENSIONS[number];

/**
 * What each question is called when a person reads it.
 *
 * Kept beside the canonical list so a dimension cannot appear on screen or in
 * a report under a raw column name. The wording is the question as asked, not
 * the field as stored: staff recognize "Languages spoken at home", not
 * `household_languages`.
 */
export const SERVICE_PROFILE_DIMENSION_LABELS: Record<ServiceProfileDimension, string> = {
  gender_identity: 'Gender identity',
  gender_identity_parent_type: 'Gender identity (grouped)',
  ethnicity: 'Ethnicity',
  disability: 'Disability',
  self_identifies_as: 'Self-identifies as',
  city: 'City',
  county: 'County',
  state: 'State',
  postal_code: 'Postal code',
  housing_type: 'Housing type',
  household_languages: 'Languages spoken at home',
  primary_income_source: 'Primary income source',
  dietary_considerations: 'Dietary considerations',
  social_assistance: 'Social assistance',
  race_or_ethnicity: 'Race or ethnicity',
  county_fips: 'County (FIPS)',
  no_fixed_address: 'No fixed address',
  housing_stability: 'Housing stability',
  snap_participation: 'SNAP participation',
  government_programs: 'Government programs',
  employment: 'Employment',
  food_insecurity: 'Food insecurity',
  military_status: 'Military status',
  translation_needed: 'Translation needed',
};

/** Falls back to the raw key rather than hiding a dimension nobody labelled. */
export const serviceProfileDimensionLabel = (dimension: string): string =>
  SERVICE_PROFILE_DIMENSION_LABELS[dimension as ServiceProfileDimension] ?? dimension;

export interface ServiceProfileResponse {
  dimension: ServiceProfileDimension;
  responseStatus: ServiceProfileResponseStatus;
  values: string[];
}

export interface ServiceBirthYearObservation {
  birthYear: number | null;
  birthYearEstimated: boolean | null;
  responseStatus: ServiceProfileResponseStatus;
}

export interface ServiceClientProfileDraft extends ServiceBirthYearObservation {
  source: string;
  sourceProfileKey: string;
  sourceClientId: string;
  observedDate: string | null;
  responses: ServiceProfileResponse[];
}

export interface ServicePersonProfileDraft extends ServiceBirthYearObservation {
  source: string;
  sourceProfileKey: string;
  sourcePersonId: string;
  observedDate: string | null;
  responses: ServiceProfileResponse[];
}

// Source labels may vary in punctuation/case, but they have the same analytical
// outcome: the client did not provide a usable answer. We do not persist or
// report a speculative reason for that non-participation.
const NON_ANSWER_LABELS = new Set([
  'declined',
  'decline to answer',
  'declined to answer',
  'prefer not to answer',
  'prefers not to answer',
  "don't know",
  'dont know',
  'do not know',
  'unknown',
  'did not ask',
  "didn't ask",
  'undisclosed',
  'not provided',
  'no answer',
  'n/a',
  'na',
  '/',
  "don't know / prefer not to answer",
  'dont know / prefer not to answer',
  'do not know / prefer not to answer',
  "don't know / prefer not to answer / don't know / prefer not to answer",
]);

const cleanValue = (value: string): string => value.trim().replace(/\s+/g, ' ');
const comparisonKey = (value: string): string => cleanValue(value)
  .replace(/[_-]+/g, ' ')
  .toLocaleLowerCase('en-US');

const assertDimension = (dimension: ServiceProfileDimension): void => {
  if (!SERVICE_PROFILE_DIMENSIONS.includes(dimension)) {
    throw new ServiceFoundationError(
      'Service profile dimension is not recognized.',
      'INVALID_SERVICE_PROFILE_DIMENSION',
      { dimension },
    );
  }
};

/**
 * Normalize one question that was present in the source artifact. No response
 * row should be created when the source contract did not contain that question;
 * absent question coverage is unavailable, not client non-participation.
 */
export function buildServiceProfileResponse(
  dimension: ServiceProfileDimension,
  sourceValues: readonly (string | null | undefined)[],
): ServiceProfileResponse {
  assertDimension(dimension);
  const substantive: string[] = [];
  const seen = new Set<string>();

  for (const sourceValue of sourceValues) {
    if (sourceValue == null) continue;
    const cleaned = cleanValue(sourceValue);
    const key = comparisonKey(cleaned);
    if (!cleaned || NON_ANSWER_LABELS.has(key) || seen.has(key)) continue;
    if (cleaned.length > 200) {
      throw new ServiceFoundationError(
        'A Service profile response value must be 200 characters or fewer.',
        'INVALID_SERVICE_PROFILE_VALUE',
        { dimension },
      );
    }
    seen.add(key);
    substantive.push(cleaned);
  }

  return {
    dimension,
    responseStatus: substantive.length > 0 ? 'provided' : 'not_provided',
    values: substantive,
  };
}

export function buildServiceBirthYearObservation(
  birthYear: number | null,
  estimated: boolean | null,
  referenceYear: number,
): ServiceBirthYearObservation {
  if (!Number.isSafeInteger(referenceYear) || referenceYear < 1850) {
    throw new ServiceFoundationError(
      'Birth-year validation requires a valid reference year.',
      'INVALID_SERVICE_BIRTH_YEAR_REFERENCE',
    );
  }
  if (birthYear === null) {
    return {
      birthYear: null,
      birthYearEstimated: null,
      responseStatus: 'not_provided',
    };
  }
  if (!Number.isSafeInteger(birthYear) || birthYear < 1850 || birthYear > referenceYear) {
    throw new ServiceFoundationError(
      `Birth year must be between 1850 and ${referenceYear}.`,
      'INVALID_SERVICE_BIRTH_YEAR',
      { birthYear, referenceYear },
    );
  }
  if (typeof estimated !== 'boolean') {
    throw new ServiceFoundationError(
      'A provided birth year must state whether it was estimated.',
      'SERVICE_BIRTH_YEAR_ESTIMATE_REQUIRED',
    );
  }
  return {
    birthYear,
    birthYearEstimated: estimated,
    responseStatus: 'provided',
  };
}

const isLocalDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

export function validateServiceClientProfile(
  profile: ServiceClientProfileDraft,
): ServiceClientProfileDraft {
  const source = profile.source.trim();
  const sourceProfileKey = profile.sourceProfileKey.trim();
  const sourceClientId = profile.sourceClientId.trim();
  if (!source || source.length > 64 || !sourceProfileKey || sourceProfileKey.length > 256) {
    throw new ServiceFoundationError(
      'A Service client profile requires a valid source and source profile key.',
      'INVALID_SERVICE_PROFILE_KEY',
    );
  }
  if (!sourceClientId || sourceClientId.length > 256) {
    throw new ServiceFoundationError(
      'A Service client profile requires a source-scoped client id.',
      'INVALID_SERVICE_PROFILE_CLIENT',
    );
  }
  if (profile.observedDate !== null && !isLocalDate(profile.observedDate)) {
    throw new ServiceFoundationError(
      'Profile observation date must be a real calendar date in YYYY-MM-DD form.',
      'INVALID_SERVICE_PROFILE_DATE',
    );
  }
  if (!SERVICE_PROFILE_RESPONSE_STATUSES.includes(profile.responseStatus)) {
    throw new ServiceFoundationError(
      'Birth-year response status is not recognized.',
      'INVALID_SERVICE_PROFILE_RESPONSE_STATUS',
    );
  }
  if (profile.responseStatus === 'not_provided') {
    if (profile.birthYear !== null || profile.birthYearEstimated !== null) {
      throw new ServiceFoundationError(
        'A birth year marked not provided cannot retain a value.',
        'SERVICE_BIRTH_YEAR_STATUS_MISMATCH',
      );
    }
  } else if (profile.birthYear === null || typeof profile.birthYearEstimated !== 'boolean') {
    throw new ServiceFoundationError(
      'A provided birth year requires a year and estimated status.',
      'SERVICE_BIRTH_YEAR_STATUS_MISMATCH',
    );
  } else {
    const referenceYear = profile.observedDate
      ? Number(profile.observedDate.slice(0, 4))
      : new Date().getUTCFullYear();
    buildServiceBirthYearObservation(
      profile.birthYear,
      profile.birthYearEstimated,
      referenceYear,
    );
  }

  const dimensions = new Set<ServiceProfileDimension>();
  const responses = profile.responses.map((response) => {
    assertDimension(response.dimension);
    if (dimensions.has(response.dimension)) {
      throw new ServiceFoundationError(
        'A Service client profile cannot contain the same dimension twice.',
        'DUPLICATE_SERVICE_PROFILE_DIMENSION',
        { dimension: response.dimension },
      );
    }
    dimensions.add(response.dimension);
    if (!SERVICE_PROFILE_RESPONSE_STATUSES.includes(response.responseStatus)) {
      throw new ServiceFoundationError(
        'Service profile response status is not recognized.',
        'INVALID_SERVICE_PROFILE_RESPONSE_STATUS',
      );
    }
    const rebuilt = buildServiceProfileResponse(response.dimension, response.values);
    if (
      rebuilt.responseStatus !== response.responseStatus
      || rebuilt.values.length !== response.values.length
    ) {
      throw new ServiceFoundationError(
        'Service profile response values do not match their participation status.',
        'SERVICE_PROFILE_STATUS_MISMATCH',
        { dimension: response.dimension },
      );
    }
    return rebuilt;
  });

  return {
    ...profile,
    source,
    sourceProfileKey,
    sourceClientId,
    responses,
  };
}

export function serviceClientProfileSnapshotHash(profile: ServiceClientProfileDraft): string {
  const validated = validateServiceClientProfile(profile);
  const canonical = {
    source: validated.source,
    sourceProfileKey: validated.sourceProfileKey,
    sourceClientId: validated.sourceClientId,
    observedDate: validated.observedDate,
    birthYear: validated.birthYear,
    birthYearEstimated: validated.birthYearEstimated,
    responseStatus: validated.responseStatus,
    responses: [...validated.responses]
      .map((response) => ({
        ...response,
        values: [...response.values].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.dimension.localeCompare(right.dimension)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function validateServicePersonProfile(
  profile: ServicePersonProfileDraft,
): ServicePersonProfileDraft {
  const sourcePersonId = profile.sourcePersonId.trim();
  if (!sourcePersonId || sourcePersonId.length > 256) {
    throw new ServiceFoundationError(
      'A Service person profile requires a source-scoped person id.',
      'INVALID_SERVICE_PROFILE_PERSON',
    );
  }
  const validated = validateServiceClientProfile({
    ...profile,
    sourceClientId: sourcePersonId,
  });
  return {
    source: validated.source,
    sourceProfileKey: validated.sourceProfileKey,
    sourcePersonId,
    observedDate: validated.observedDate,
    birthYear: validated.birthYear,
    birthYearEstimated: validated.birthYearEstimated,
    responseStatus: validated.responseStatus,
    responses: validated.responses,
  };
}

export function servicePersonProfileSnapshotHash(profile: ServicePersonProfileDraft): string {
  const validated = validateServicePersonProfile(profile);
  const canonical = {
    source: validated.source,
    sourceProfileKey: validated.sourceProfileKey,
    sourcePersonId: validated.sourcePersonId,
    observedDate: validated.observedDate,
    birthYear: validated.birthYear,
    birthYearEstimated: validated.birthYearEstimated,
    responseStatus: validated.responseStatus,
    responses: [...validated.responses]
      .map((response) => ({
        ...response,
        values: [...response.values].sort((left, right) => left.localeCompare(right)),
      }))
      .sort((left, right) => left.dimension.localeCompare(right.dimension)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
