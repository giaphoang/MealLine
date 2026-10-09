// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  buildServiceBirthYearObservation,
  buildServiceProfileResponse,
  serviceClientProfileSnapshotHash,
  validateServiceClientProfile,
  type ServiceClientProfileDraft,
} from '../../../src/services/service';

const birthYear = buildServiceBirthYearObservation(1984, false, 2025);
const baseProfile: ServiceClientProfileDraft = {
  source: 'link2feed',
  sourceProfileKey: 'visit:2025-05-01:123:profile',
  sourceClientId: '123',
  observedDate: '2025-05-01',
  ...birthYear,
  responses: [],
};

describe('Service client profiles and demographic participation', () => {
  test.each([
    [[]],
    [['']],
    [['Declined']],
    [['Prefer not to answer']],
    [["Don't know"]],
    [['Unknown']],
    [['did_not_ask']],
    [['Didn\'t Ask']],
    [['declined_to_answer']],
    [['prefer_not_to_answer']],
    [['Undisclosed']],
  ])('collapses non-answer variants to not provided: %j', (values) => {
    expect(buildServiceProfileResponse('ethnicity', values)).toEqual({
      dimension: 'ethnicity',
      responseStatus: 'not_provided',
      values: [],
    });
  });

  test('keeps substantive answers and drops accompanying non-answer labels', () => {
    expect(buildServiceProfileResponse('gender_identity', [
      'Woman',
      'Prefer not to answer',
      ' woman ',
    ])).toEqual({
      dimension: 'gender_identity',
      responseStatus: 'provided',
      values: ['Woman'],
    });
  });

  test('stores only birth year and whether the source marked it estimated', () => {
    expect(buildServiceBirthYearObservation(1984, false, 2025)).toEqual({
      birthYear: 1984,
      birthYearEstimated: false,
      responseStatus: 'provided',
    });
    expect(buildServiceBirthYearObservation(null, null, 2025)).toEqual({
      birthYear: null,
      birthYearEstimated: null,
      responseStatus: 'not_provided',
    });
  });

  test('rejects an impossible birth year instead of manufacturing an age', () => {
    expect(() => buildServiceBirthYearObservation(2026, false, 2025))
      .toThrow(/between 1850 and 2025/i);
  });

  test('distinguishes a missing source question from client non-participation', () => {
    const profile = validateServiceClientProfile({
      ...baseProfile,
      responses: [buildServiceProfileResponse('gender_identity', ['Woman'])],
    });

    expect(profile.responses).toHaveLength(1);
    expect(profile.responses.some((response) => response.dimension === 'ethnicity')).toBe(false);
  });

  test('requires one canonical response row per included dimension', () => {
    const response = buildServiceProfileResponse('ethnicity', ['Latine']);
    expect(() => validateServiceClientProfile({
      ...baseProfile,
      responses: [response, response],
    })).toThrow(/same dimension twice/i);
  });

  test('requires a source-scoped client id but never matches it across sources', () => {
    expect(() => validateServiceClientProfile({
      ...baseProfile,
      sourceClientId: ' ',
    })).toThrow(/source-scoped client id/i);

    expect(validateServiceClientProfile({
      ...baseProfile,
      source: 'simc',
    })).toMatchObject({ source: 'simc', sourceClientId: '123' });
  });

  test('hashes response meaning independently of dimension and multi-select order', () => {
    const first = {
      ...baseProfile,
      responses: [
        buildServiceProfileResponse('ethnicity', ['Latine', 'Indigenous']),
        buildServiceProfileResponse('dietary_considerations', ['Halal']),
      ],
    };
    const reordered = {
      ...baseProfile,
      responses: [
        buildServiceProfileResponse('dietary_considerations', ['Halal']),
        buildServiceProfileResponse('ethnicity', ['Indigenous', 'Latine']),
      ],
    };

    expect(serviceClientProfileSnapshotHash(reordered))
      .toBe(serviceClientProfileSnapshotHash(first));
  });
});
