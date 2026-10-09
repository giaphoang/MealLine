// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { ServiceFoundationError } from './foundation';

export const SERVICE_QUALITY_SEVERITIES = ['info', 'warning', 'blocking'] as const;
export const SERVICE_QUALITY_DECISIONS = ['resolve', 'dismiss', 'reopen'] as const;
export const SERVICE_QUALITY_SAFE_DETAIL_KEYS = [
  'rowNumber',
  'serviceDate',
  'sourceField',
  'observedCount',
  'expectedMaximum',
  'occurrenceCount',
  'contractId',
  'recordKind',
  'explanationCode',
  'reportedPeopleCount',
  'identifiedMemberCount',
  'difference',
  'householdDatePairCount',
] as const;

export type ServiceQualitySeverity = typeof SERVICE_QUALITY_SEVERITIES[number];
export type ServiceQualityDecisionAction = typeof SERVICE_QUALITY_DECISIONS[number];
export type ServiceQualitySafeDetailKey = typeof SERVICE_QUALITY_SAFE_DETAIL_KEYS[number];
export type ServiceQualitySafeDetails = Partial<Record<
  ServiceQualitySafeDetailKey,
  string | number | boolean | null
>>;

export interface ServiceQualityIssueDraft {
  source: string;
  sourceRecordKey: string | null;
  code: string;
  severity: ServiceQualitySeverity;
  field: string | null;
  safeDetails: ServiceQualitySafeDetails;
}

export interface ServiceQualityIssueDecisionDraft {
  revision: number;
  action: ServiceQualityDecisionAction;
  reason: string;
}

export function validateServiceQualityIssue(
  draft: ServiceQualityIssueDraft,
): ServiceQualityIssueDraft {
  const source = draft.source.trim();
  const sourceRecordKey = draft.sourceRecordKey?.trim() || null;
  const code = draft.code.trim();
  const field = draft.field?.trim() || null;

  if (!source || source.length > 64) {
    throw new ServiceFoundationError('Quality issue source is not valid.', 'INVALID_SERVICE_QUALITY_SOURCE');
  }
  if (sourceRecordKey && sourceRecordKey.length > 256) {
    throw new ServiceFoundationError('Quality issue record key is too long.', 'INVALID_SERVICE_QUALITY_RECORD_KEY');
  }
  if (!/^[A-Z][A-Z0-9_]{2,95}$/.test(code)) {
    throw new ServiceFoundationError(
      'Quality issue code must use uppercase letters, numbers, and underscores.',
      'INVALID_SERVICE_QUALITY_CODE',
    );
  }
  if (!SERVICE_QUALITY_SEVERITIES.includes(draft.severity)) {
    throw new ServiceFoundationError('Quality issue severity is not recognized.', 'INVALID_SERVICE_QUALITY_SEVERITY');
  }
  if (field && (!/^[A-Za-z][A-Za-z0-9_ -]{0,79}$/.test(field))) {
    throw new ServiceFoundationError('Quality issue field is not valid.', 'INVALID_SERVICE_QUALITY_FIELD');
  }

  for (const [key, value] of Object.entries(draft.safeDetails)) {
    if (!SERVICE_QUALITY_SAFE_DETAIL_KEYS.includes(key as ServiceQualitySafeDetailKey)) {
      throw new ServiceFoundationError(
        `Quality issue detail ${key} is not approved for persistence.`,
        'UNSAFE_SERVICE_QUALITY_DETAIL',
      );
    }
    if (typeof value === 'string' && value.length > 128) {
      throw new ServiceFoundationError(
        `Quality issue detail ${key} is too long.`,
        'UNSAFE_SERVICE_QUALITY_DETAIL',
      );
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new ServiceFoundationError(
        `Quality issue detail ${key} must be finite.`,
        'UNSAFE_SERVICE_QUALITY_DETAIL',
      );
    }
  }

  return { ...draft, source, sourceRecordKey, code, field };
}

export function validateServiceQualityDecision(
  draft: ServiceQualityIssueDecisionDraft,
): ServiceQualityIssueDecisionDraft {
  const reason = draft.reason.trim().replace(/\s+/g, ' ');
  if (!Number.isSafeInteger(draft.revision) || draft.revision < 1) {
    throw new ServiceFoundationError(
      'Quality issue decision revision must be a positive whole number.',
      'INVALID_SERVICE_QUALITY_DECISION_REVISION',
    );
  }
  if (!SERVICE_QUALITY_DECISIONS.includes(draft.action)) {
    throw new ServiceFoundationError(
      'Quality issue decision is not recognized.',
      'INVALID_SERVICE_QUALITY_DECISION',
    );
  }
  if (!reason || reason.length > 500) {
    throw new ServiceFoundationError(
      'Quality issue decision reason must be between 1 and 500 characters.',
      'INVALID_SERVICE_QUALITY_DECISION_REASON',
    );
  }
  return { ...draft, reason };
}

export function serviceQualityIssueStatus(
  decisions: readonly ServiceQualityIssueDecisionDraft[],
): 'open' | 'resolved' | 'dismissed' {
  const latest = [...decisions].sort((left, right) => right.revision - left.revision)[0];
  if (!latest || latest.action === 'reopen') return 'open';
  return latest.action === 'resolve' ? 'resolved' : 'dismissed';
}
