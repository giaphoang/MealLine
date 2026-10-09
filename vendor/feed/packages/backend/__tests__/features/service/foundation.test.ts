// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  applyServiceSourceResolution,
  reviewServiceEncounter,
  serviceEncounterSnapshotHash,
  validateServiceEncounter,
  validateServiceSourceResolution,
  type ServiceEncounterDraft,
  type ServiceSourceResolutionDraft,
} from '../../../src/services/service';

const ordinaryAnonymousEncounter: ServiceEncounterDraft = {
  source: 'link2feed',
  sourceRecordKey: 'visit:2025-11-24:row-78122',
  serviceDate: '2025-11-24',
  sourceClientId: null,
  recordKind: 'identity_unavailable_encounter',
  clientVisitStatus: 'unknown',
  reportedHouseholdCount: 1,
  reportedPeopleCount: 264,
};

const thanksgivingResolution: ServiceSourceResolutionDraft = {
  source: 'link2feed',
  sourceRecordKey: 'visit:2025-11-24:row-78122',
  revision: 1,
  action: 'apply',
  recordKind: 'special_event_people_aggregate',
  reportedHouseholdCount: null,
  reportedPeopleCount: 264,
  eventLabel: 'WTH Thanksgiving outdoor market',
  reason: 'Staff confirmed this was the outdoor-market clicker tally.',
};

describe('Service canonical foundation', () => {
  test('keeps identified and identity-unavailable encounters distinct', () => {
    expect(validateServiceEncounter({
      ...ordinaryAnonymousEncounter,
      sourceClientId: 'L2F-123',
      recordKind: 'identified_household_encounter',
      reportedPeopleCount: 3,
    })).toMatchObject({
      sourceClientId: 'L2F-123',
      recordKind: 'identified_household_encounter',
      reportedHouseholdCount: 1,
      reportedPeopleCount: 3,
    });

    expect(validateServiceEncounter({
      ...ordinaryAnonymousEncounter,
      reportedPeopleCount: 2,
    })).toMatchObject({
      sourceClientId: null,
      recordKind: 'identity_unavailable_encounter',
    });
  });

  test('does not allow an identified encounter without a source-scoped client id', () => {
    expect(() => validateServiceEncounter({
      ...ordinaryAnonymousEncounter,
      recordKind: 'identified_household_encounter',
      reportedPeopleCount: 2,
    })).toThrow(/requires a source-scoped client id/i);
  });

  test('surfaces a configurable outlier for review without capping or reclassifying it', () => {
    const issues = reviewServiceEncounter(ordinaryAnonymousEncounter, {
      maxPeoplePerHouseholdWithoutReview: 20,
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT',
        value: 264,
      }),
    ]);
    expect(ordinaryAnonymousEncounter).toMatchObject({
      recordKind: 'identity_unavailable_encounter',
      reportedHouseholdCount: 1,
      reportedPeopleCount: 264,
    });
  });

  test('resolves the known Thanksgiving tally as people served, not household size', () => {
    const resolved = applyServiceSourceResolution(
      ordinaryAnonymousEncounter,
      thanksgivingResolution,
    );

    expect(resolved).toEqual({
      ...ordinaryAnonymousEncounter,
      recordKind: 'special_event_people_aggregate',
      reportedHouseholdCount: null,
      reportedPeopleCount: 264,
      eventLabel: 'WTH Thanksgiving outdoor market',
      resolutionApplied: true,
      resolutionRevision: 1,
    });
    expect(reviewServiceEncounter(resolved, {
      maxPeoplePerHouseholdWithoutReview: 20,
    })).toEqual([]);
  });

  test('keeps the resolution generic and tied to the exact source observation', () => {
    expect(() => applyServiceSourceResolution(
      { ...ordinaryAnonymousEncounter, sourceRecordKey: 'another-record' },
      thanksgivingResolution,
    )).toThrow(/exact source observation/i);
  });

  test('uses an append-only revocation to restore source meaning', () => {
    const revoked = applyServiceSourceResolution(ordinaryAnonymousEncounter, {
      source: ordinaryAnonymousEncounter.source,
      sourceRecordKey: ordinaryAnonymousEncounter.sourceRecordKey,
      revision: 2,
      action: 'revoke',
      recordKind: null,
      reportedHouseholdCount: null,
      reportedPeopleCount: null,
      eventLabel: null,
      reason: 'Correction removed after source re-review.',
    });

    expect(revoked).toMatchObject({
      recordKind: 'identity_unavailable_encounter',
      reportedHouseholdCount: 1,
      reportedPeopleCount: 264,
      resolutionApplied: false,
      resolutionRevision: 2,
    });
  });

  test('requires replacement values to form a valid resolved record', () => {
    expect(() => applyServiceSourceResolution(ordinaryAnonymousEncounter, {
      ...thanksgivingResolution,
      reportedHouseholdCount: 1,
    })).toThrow(/does not establish a household count/i);

    expect(() => validateServiceSourceResolution({
      ...thanksgivingResolution,
      action: 'revoke',
    })).toThrow(/cannot carry replacement values/i);
  });

  test('hashes canonical source meaning rather than surrounding whitespace', () => {
    const canonicalHash = serviceEncounterSnapshotHash({
      ...ordinaryAnonymousEncounter,
      reportedPeopleCount: 3,
    });
    const whitespaceHash = serviceEncounterSnapshotHash({
      ...ordinaryAnonymousEncounter,
      source: ' link2feed ',
      sourceRecordKey: ' visit:2025-11-24:row-78122 ',
      reportedPeopleCount: 3,
    });

    expect(whitespaceHash).toBe(canonicalHash);
  });
});
