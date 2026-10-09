// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  serviceQualityIssueStatus,
  validateServiceQualityDecision,
  validateServiceQualityIssue,
} from '../../../src/services/service';

describe('Service quality evidence', () => {
  test('persists only an explicit safe-detail vocabulary', () => {
    expect(validateServiceQualityIssue({
      source: 'link2feed',
      sourceRecordKey: 'visit:hash:78122',
      code: 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT',
      severity: 'warning',
      field: 'Household Size',
      safeDetails: {
        rowNumber: 78122,
        serviceDate: '2025-11-24',
        sourceField: 'Household Size',
        observedCount: 264,
        expectedMaximum: 20,
      },
    })).toMatchObject({ source: 'link2feed', severity: 'warning' });

    expect(() => validateServiceQualityIssue({
      source: 'link2feed',
      sourceRecordKey: null,
      code: 'UNAPPROVED_DETAIL',
      severity: 'warning',
      field: null,
      safeDetails: { rawNote: 'must never persist' } as never,
    })).toThrow(/not approved for persistence/i);
  });

  test('derives status from append-only operator decisions', () => {
    const resolved = validateServiceQualityDecision({
      revision: 1,
      action: 'resolve',
      reason: 'Staff confirmed the observation was a special-event clicker count.',
    });
    const reopened = validateServiceQualityDecision({
      revision: 2,
      action: 'reopen',
      reason: 'Reopened for source review.',
    });

    expect(serviceQualityIssueStatus([])).toBe('open');
    expect(serviceQualityIssueStatus([resolved])).toBe('resolved');
    expect(serviceQualityIssueStatus([resolved, reopened])).toBe('open');
  });

  test('requires an auditable reason for every operator decision', () => {
    expect(() => validateServiceQualityDecision({
      revision: 1,
      action: 'dismiss',
      reason: '   ',
    })).toThrow(/reason/i);
  });
});
