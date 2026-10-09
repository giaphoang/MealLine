// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';

export const FORMAL_SERVICE_SOURCES = ['link2feed', 'simc'] as const;
export const SERVICE_DATASET_KINDS = [
  'visits',
  'clients',
  'formal_aggregates',
  'operational_metrics',
] as const;
export const SERVICE_RECORD_KINDS = [
  'identified_household_encounter',
  'identity_unavailable_encounter',
  'special_event_people_aggregate',
  'formal_source_aggregate',
] as const;
export const SERVICE_RESOLUTION_ACTIONS = ['apply', 'revoke'] as const;
export const SERVICE_CLIENT_VISIT_STATUSES = ['first', 'returning', 'unknown'] as const;

export type FormalServiceSource = typeof FORMAL_SERVICE_SOURCES[number];
export type ServiceDatasetKind = typeof SERVICE_DATASET_KINDS[number];
export type ServiceRecordKind = typeof SERVICE_RECORD_KINDS[number];
export type ServiceResolutionAction = typeof SERVICE_RESOLUTION_ACTIONS[number];
export type ServiceClientVisitStatus = typeof SERVICE_CLIENT_VISIT_STATUSES[number];

export interface ServiceEncounterDraft {
  source: string;
  sourceRecordKey: string;
  serviceDate: string;
  sourceClientId: string | null;
  recordKind: ServiceRecordKind;
  clientVisitStatus: ServiceClientVisitStatus;
  reportedHouseholdCount: number | null;
  reportedPeopleCount: number | null;
  sourceEventId?: string | null;
  sourceRecordedAt?: string | null;
  numberAdults?: number | null;
  numberChildren?: number | null;
  numberSeniors?: number | null;
  numberUnknownAge?: number | null;
  sourcePersonIds?: string[];
  headOfHouseholdSourcePersonId?: string | null;
}

export interface ServiceSourceResolutionDraft {
  source: string;
  sourceRecordKey: string;
  revision: number;
  action: ServiceResolutionAction;
  recordKind: ServiceRecordKind | null;
  reportedHouseholdCount: number | null;
  reportedPeopleCount: number | null;
  eventLabel: string | null;
  reason: string;
}

export interface ResolvedServiceEncounter extends ServiceEncounterDraft {
  eventLabel: string | null;
  resolutionApplied: boolean;
  resolutionRevision: number | null;
}

export interface ServiceEncounterReviewPolicy {
  /**
   * Review threshold for an observation still interpreted as one household.
   * The adapter never chooses this threshold and never changes the record kind;
   * it is an organization/source policy that can evolve independently.
   */
  maxPeoplePerHouseholdWithoutReview: number;
}

export interface ServiceEncounterReviewIssue {
  code: 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT';
  field: 'reportedPeopleCount';
  value: number;
  message: string;
}

export class ServiceFoundationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ServiceFoundationError';
  }
}

const isLocalDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const assertNullableCount = (name: string, value: number | null): void => {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new ServiceFoundationError(
      `${name} must be a non-negative whole number or unavailable.`,
      'INVALID_SERVICE_COUNT',
      { field: name, value },
    );
  }
};

export function validateServiceEncounter(
  observation: ServiceEncounterDraft,
): ServiceEncounterDraft {
  const source = observation.source.trim();
  const sourceRecordKey = observation.sourceRecordKey.trim();
  const sourceClientId = observation.sourceClientId?.trim() || null;

  if (!source || source.length > 64) {
    throw new ServiceFoundationError(
      'Service source must be between 1 and 64 characters.',
      'INVALID_SERVICE_SOURCE',
    );
  }
  if (!sourceRecordKey || sourceRecordKey.length > 256) {
    throw new ServiceFoundationError(
      'Service source record key must be between 1 and 256 characters.',
      'INVALID_SERVICE_RECORD_KEY',
    );
  }
  if (sourceClientId && sourceClientId.length > 256) {
    throw new ServiceFoundationError(
      'A source-scoped client id must be 256 characters or fewer.',
      'INVALID_SERVICE_CLIENT_ID',
    );
  }
  if (!SERVICE_RECORD_KINDS.includes(observation.recordKind)) {
    throw new ServiceFoundationError(
      'Service record kind is not recognized.',
      'INVALID_SERVICE_RECORD_KIND',
      { recordKind: observation.recordKind },
    );
  }
  if (!SERVICE_CLIENT_VISIT_STATUSES.includes(observation.clientVisitStatus)) {
    throw new ServiceFoundationError(
      'Client visit status is not recognized.',
      'INVALID_SERVICE_CLIENT_VISIT_STATUS',
      { clientVisitStatus: observation.clientVisitStatus },
    );
  }
  if (!isLocalDate(observation.serviceDate)) {
    throw new ServiceFoundationError(
      'Service date must be a real calendar date in YYYY-MM-DD form.',
      'INVALID_SERVICE_DATE',
    );
  }

  assertNullableCount('reportedHouseholdCount', observation.reportedHouseholdCount);
  assertNullableCount('reportedPeopleCount', observation.reportedPeopleCount);
  const sourceEventId = observation.sourceEventId?.trim() || null;
  const sourceRecordedAt = observation.sourceRecordedAt?.trim() || null;
  if (sourceEventId && sourceEventId.length > 256) {
    throw new ServiceFoundationError(
      'A source event id must be 256 characters or fewer.',
      'INVALID_SERVICE_EVENT_ID',
    );
  }
  if (sourceRecordedAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(sourceRecordedAt)) {
    throw new ServiceFoundationError(
      'A source-recorded time must use local YYYY-MM-DDTHH:mm:ss form.',
      'INVALID_SERVICE_RECORDED_AT',
    );
  }
  const composition = [
    observation.numberAdults ?? null,
    observation.numberChildren ?? null,
    observation.numberSeniors ?? null,
    observation.numberUnknownAge ?? null,
  ];
  composition.forEach((value, index) => assertNullableCount(
    ['numberAdults', 'numberChildren', 'numberSeniors', 'numberUnknownAge'][index],
    value,
  ));
  const compositionAvailable = composition.some((value) => value !== null);
  if (compositionAvailable && composition.some((value) => value === null)) {
    throw new ServiceFoundationError(
      'Household composition must supply every age-group count together.',
      'INCOMPLETE_SERVICE_COMPOSITION',
    );
  }
  if (
    compositionAvailable
    && observation.reportedPeopleCount !== null
    && composition.reduce<number>((sum, value) => sum + (value ?? 0), 0) !== observation.reportedPeopleCount
  ) {
    throw new ServiceFoundationError(
      'Household composition must equal the reported people count.',
      'SERVICE_COMPOSITION_COUNT_MISMATCH',
    );
  }
  const sourcePersonIds = [...new Set((observation.sourcePersonIds ?? []).map((value) => value.trim()))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  if (sourcePersonIds.some((value) => value.length > 256)) {
    throw new ServiceFoundationError(
      'A source person id must be 256 characters or fewer.',
      'INVALID_SERVICE_PERSON_ID',
    );
  }
  const headOfHouseholdSourcePersonId = observation.headOfHouseholdSourcePersonId?.trim() || null;
  if (headOfHouseholdSourcePersonId && !sourcePersonIds.includes(headOfHouseholdSourcePersonId)) {
    throw new ServiceFoundationError(
      'The head of household must be one of the encounter people.',
      'INVALID_SERVICE_HOUSEHOLD_HEAD',
    );
  }

  if (observation.recordKind === 'identified_household_encounter') {
    if (!sourceClientId) {
      throw new ServiceFoundationError(
        'An identified household encounter requires a source-scoped client id.',
        'IDENTIFIED_ENCOUNTER_WITHOUT_CLIENT',
      );
    }
    if (observation.reportedHouseholdCount !== 1) {
      throw new ServiceFoundationError(
        'An identified household encounter represents exactly one household encounter.',
        'INVALID_ENCOUNTER_HOUSEHOLD_COUNT',
      );
    }
  }

  if (observation.recordKind === 'identity_unavailable_encounter') {
    if (sourceClientId) {
      throw new ServiceFoundationError(
        'An identity-unavailable encounter cannot carry a source client id.',
        'ANONYMOUS_ENCOUNTER_WITH_CLIENT',
      );
    }
    if (observation.reportedHouseholdCount !== 1) {
      throw new ServiceFoundationError(
        'An identity-unavailable encounter represents exactly one household encounter.',
        'INVALID_ENCOUNTER_HOUSEHOLD_COUNT',
      );
    }
  }

  if (observation.recordKind === 'special_event_people_aggregate') {
    if (sourceClientId) {
      throw new ServiceFoundationError(
        'A special-event people aggregate cannot carry a source client id.',
        'AGGREGATE_WITH_CLIENT',
      );
    }
    if (observation.reportedHouseholdCount !== null) {
      throw new ServiceFoundationError(
        'A special-event people aggregate does not establish a household count.',
        'SPECIAL_EVENT_WITH_HOUSEHOLD_COUNT',
      );
    }
    if (observation.reportedPeopleCount === null || observation.reportedPeopleCount < 1) {
      throw new ServiceFoundationError(
        'A special-event people aggregate requires a positive reported-people count.',
        'SPECIAL_EVENT_WITHOUT_PEOPLE_COUNT',
      );
    }
    if (observation.clientVisitStatus !== 'unknown') {
      throw new ServiceFoundationError(
        'A special-event aggregate cannot establish client visit status.',
        'AGGREGATE_WITH_CLIENT_VISIT_STATUS',
      );
    }
  }

  if (observation.recordKind === 'formal_source_aggregate') {
    if (sourceClientId) {
      throw new ServiceFoundationError(
        'A formal source aggregate cannot carry a source client id.',
        'AGGREGATE_WITH_CLIENT',
      );
    }
    if (
      observation.reportedHouseholdCount === null
      && observation.reportedPeopleCount === null
    ) {
      throw new ServiceFoundationError(
        'A formal source aggregate must report a household or people measure.',
        'EMPTY_FORMAL_AGGREGATE',
      );
    }
    if (observation.clientVisitStatus !== 'unknown') {
      throw new ServiceFoundationError(
        'A formal source aggregate cannot establish client visit status.',
        'AGGREGATE_WITH_CLIENT_VISIT_STATUS',
      );
    }
  }

  const normalized: ServiceEncounterDraft = {
    ...observation,
    source,
    sourceRecordKey,
    sourceClientId,
  };
  const hasExtendedInput = 'sourceEventId' in observation
    || 'sourceRecordedAt' in observation
    || 'numberAdults' in observation
    || 'numberChildren' in observation
    || 'numberSeniors' in observation
    || 'numberUnknownAge' in observation
    || 'sourcePersonIds' in observation
    || 'headOfHouseholdSourcePersonId' in observation;
  if (!hasExtendedInput) return normalized;
  return {
    ...normalized,
    sourceEventId,
    sourceRecordedAt,
    numberAdults: composition[0],
    numberChildren: composition[1],
    numberSeniors: composition[2],
    numberUnknownAge: composition[3],
    sourcePersonIds,
    headOfHouseholdSourcePersonId,
  };
}

export function serviceEncounterSnapshotHash(observation: ServiceEncounterDraft): string {
  const validated = validateServiceEncounter(observation);
  const canonical: Record<string, unknown> = {
    source: validated.source,
    sourceRecordKey: validated.sourceRecordKey,
    serviceDate: validated.serviceDate,
    sourceClientId: validated.sourceClientId,
    recordKind: validated.recordKind,
    clientVisitStatus: validated.clientVisitStatus,
    reportedHouseholdCount: validated.reportedHouseholdCount,
    reportedPeopleCount: validated.reportedPeopleCount,
  };
  const hasExtendedEvidence = validated.sourceEventId != null
    || validated.sourceRecordedAt != null
    || validated.numberAdults != null
    || (validated.sourcePersonIds?.length ?? 0) > 0
    || validated.headOfHouseholdSourcePersonId != null;
  if (hasExtendedEvidence) {
    canonical.sourceEventId = validated.sourceEventId ?? null;
    canonical.sourceRecordedAt = validated.sourceRecordedAt ?? null;
    canonical.numberAdults = validated.numberAdults ?? null;
    canonical.numberChildren = validated.numberChildren ?? null;
    canonical.numberSeniors = validated.numberSeniors ?? null;
    canonical.numberUnknownAge = validated.numberUnknownAge ?? null;
    canonical.sourcePersonIds = validated.sourcePersonIds ?? [];
    canonical.headOfHouseholdSourcePersonId = validated.headOfHouseholdSourcePersonId ?? null;
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function validateServiceSourceResolution(
  resolution: ServiceSourceResolutionDraft,
): ServiceSourceResolutionDraft {
  const source = resolution.source.trim();
  const sourceRecordKey = resolution.sourceRecordKey.trim();
  const reason = resolution.reason.trim();
  const eventLabel = resolution.eventLabel?.trim() || null;

  if (!source || source.length > 64 || !sourceRecordKey || sourceRecordKey.length > 256) {
    throw new ServiceFoundationError(
      'A source resolution requires a valid source and source record key.',
      'INVALID_SERVICE_RESOLUTION_TARGET',
    );
  }
  if (!Number.isSafeInteger(resolution.revision) || resolution.revision < 1) {
    throw new ServiceFoundationError(
      'A source resolution revision must be a positive whole number.',
      'INVALID_SERVICE_RESOLUTION_REVISION',
    );
  }
  if (!SERVICE_RESOLUTION_ACTIONS.includes(resolution.action)) {
    throw new ServiceFoundationError(
      'Service resolution action is not recognized.',
      'INVALID_SERVICE_RESOLUTION_ACTION',
      { action: resolution.action },
    );
  }
  if (resolution.recordKind && !SERVICE_RECORD_KINDS.includes(resolution.recordKind)) {
    throw new ServiceFoundationError(
      'Service resolution record kind is not recognized.',
      'INVALID_SERVICE_RECORD_KIND',
      { recordKind: resolution.recordKind },
    );
  }
  if (!reason || reason.length > 1000) {
    throw new ServiceFoundationError(
      'A source resolution requires a reason of 1 to 1000 characters.',
      'INVALID_SERVICE_RESOLUTION_REASON',
    );
  }
  if (eventLabel && eventLabel.length > 200) {
    throw new ServiceFoundationError(
      'A source resolution event label must be 200 characters or fewer.',
      'INVALID_SERVICE_RESOLUTION_LABEL',
    );
  }
  if (resolution.action === 'apply' && !resolution.recordKind) {
    throw new ServiceFoundationError(
      'An applied source resolution requires a record kind.',
      'SERVICE_RESOLUTION_KIND_REQUIRED',
    );
  }
  if (
    resolution.action === 'revoke'
    && (
      resolution.recordKind !== null
      || resolution.reportedHouseholdCount !== null
      || resolution.reportedPeopleCount !== null
      || eventLabel !== null
    )
  ) {
    throw new ServiceFoundationError(
      'A revoked source resolution cannot carry replacement values.',
      'SERVICE_RESOLUTION_REVOKE_VALUES',
    );
  }

  assertNullableCount('reportedHouseholdCount', resolution.reportedHouseholdCount);
  assertNullableCount('reportedPeopleCount', resolution.reportedPeopleCount);

  return {
    ...resolution,
    source,
    sourceRecordKey,
    reason,
    eventLabel,
  };
}

export function applyServiceSourceResolution(
  observation: ServiceEncounterDraft,
  resolution: ServiceSourceResolutionDraft | null,
): ResolvedServiceEncounter {
  const validatedObservation = validateServiceEncounter(observation);
  if (!resolution) {
    return {
      ...validatedObservation,
      eventLabel: null,
      resolutionApplied: false,
      resolutionRevision: null,
    };
  }

  const validatedResolution = validateServiceSourceResolution(resolution);
  if (
    validatedResolution.source !== validatedObservation.source
    || validatedResolution.sourceRecordKey !== validatedObservation.sourceRecordKey
  ) {
    throw new ServiceFoundationError(
      'A source resolution can only be applied to its exact source observation.',
      'SERVICE_RESOLUTION_TARGET_MISMATCH',
    );
  }
  if (validatedResolution.action === 'revoke') {
    return {
      ...validatedObservation,
      eventLabel: null,
      resolutionApplied: false,
      resolutionRevision: validatedResolution.revision,
    };
  }

  const resolved = validateServiceEncounter({
    ...validatedObservation,
    recordKind: validatedResolution.recordKind as ServiceRecordKind,
    reportedHouseholdCount: validatedResolution.reportedHouseholdCount,
    reportedPeopleCount: validatedResolution.reportedPeopleCount,
  });
  return {
    ...resolved,
    eventLabel: validatedResolution.eventLabel,
    resolutionApplied: true,
    resolutionRevision: validatedResolution.revision,
  };
}

export function reviewServiceEncounter(
  observation: ServiceEncounterDraft,
  policy: ServiceEncounterReviewPolicy,
): ServiceEncounterReviewIssue[] {
  const validated = validateServiceEncounter(observation);
  if (
    !Number.isSafeInteger(policy.maxPeoplePerHouseholdWithoutReview)
    || policy.maxPeoplePerHouseholdWithoutReview < 1
  ) {
    throw new ServiceFoundationError(
      'The service review threshold must be a positive whole number.',
      'INVALID_SERVICE_REVIEW_POLICY',
    );
  }

  const isHouseholdEncounter = validated.recordKind === 'identified_household_encounter'
    || validated.recordKind === 'identity_unavailable_encounter';
  if (
    isHouseholdEncounter
    && validated.reportedPeopleCount !== null
    && validated.reportedPeopleCount > policy.maxPeoplePerHouseholdWithoutReview
  ) {
    return [{
      code: 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT',
      field: 'reportedPeopleCount',
      value: validated.reportedPeopleCount,
      message:
        `This household encounter reports ${validated.reportedPeopleCount} people, above the configured review threshold of ${policy.maxPeoplePerHouseholdWithoutReview}. Review its source meaning before using it in household-size analysis.`,
    }];
  }

  return [];
}
