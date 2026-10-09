// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { ServiceFoundationError } from './foundation';

export const SERVICE_CAPACITY_UNITS = ['households', 'people', 'requests', 'items'] as const;
export type ServiceCapacityUnit = typeof SERVICE_CAPACITY_UNITS[number];

export interface ServiceCapacityTargetDraft {
  targetKey: string;
  displayName: string;
  unit: ServiceCapacityUnit;
  targetValue: number;
  metricKey: string | null;
  displayOrder: number;
}

export interface ServiceCapacityPlanRevisionDraft {
  planKey: string;
  revision: number;
  displayName: string;
  description: string | null;
  timezone: string;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  isActive: boolean;
  targets: ServiceCapacityTargetDraft[];
}

const isLocalDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

const isIanaTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const normalizeKey = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(normalized)) {
    throw new ServiceFoundationError(
      `${label} must start with a lowercase letter and use only lowercase letters, numbers, and underscores.`,
      'INVALID_SERVICE_CAPACITY_KEY',
    );
  }
  return normalized;
};

export function validateServiceCapacityPlanRevision(
  draft: ServiceCapacityPlanRevisionDraft,
): ServiceCapacityPlanRevisionDraft {
  const planKey = normalizeKey(draft.planKey, 'Capacity plan key');
  const displayName = draft.displayName.trim().replace(/\s+/g, ' ');
  const description = draft.description?.trim().replace(/\s+/g, ' ') || null;
  const timezone = draft.timezone.trim();

  if (!Number.isSafeInteger(draft.revision) || draft.revision < 1) {
    throw new ServiceFoundationError(
      'Capacity plan revision must be a positive whole number.',
      'INVALID_SERVICE_CAPACITY_REVISION',
    );
  }
  if (!displayName || displayName.length > 80) {
    throw new ServiceFoundationError(
      'Capacity plan name must be between 1 and 80 characters.',
      'INVALID_SERVICE_CAPACITY_NAME',
    );
  }
  if (description && description.length > 500) {
    throw new ServiceFoundationError(
      'Capacity plan description must be 500 characters or fewer.',
      'INVALID_SERVICE_CAPACITY_DESCRIPTION',
    );
  }
  if (!isIanaTimezone(timezone)) {
    throw new ServiceFoundationError(
      'Capacity plan timezone must be a recognized IANA timezone.',
      'INVALID_SERVICE_CAPACITY_TIMEZONE',
    );
  }
  if (!isLocalDate(draft.effectiveStartDate)) {
    throw new ServiceFoundationError(
      'Capacity plan effective start date must use YYYY-MM-DD.',
      'INVALID_SERVICE_CAPACITY_DATE',
    );
  }
  if (
    draft.effectiveEndDate !== null
    && (!isLocalDate(draft.effectiveEndDate) || draft.effectiveEndDate < draft.effectiveStartDate)
  ) {
    throw new ServiceFoundationError(
      'Capacity plan effective end date must be on or after its start date.',
      'INVALID_SERVICE_CAPACITY_DATE',
    );
  }
  if (draft.targets.length === 0 || draft.targets.length > 100) {
    throw new ServiceFoundationError(
      'Capacity plan must define between 1 and 100 targets.',
      'INVALID_SERVICE_CAPACITY_TARGETS',
    );
  }

  const seenKeys = new Set<string>();
  const targets = draft.targets.map((target) => {
    const targetKey = normalizeKey(target.targetKey, 'Capacity target key');
    const targetDisplayName = target.displayName.trim().replace(/\s+/g, ' ');
    const metricKey = target.metricKey === null
      ? null
      : normalizeKey(target.metricKey, 'Capacity metric key');

    if (seenKeys.has(targetKey)) {
      throw new ServiceFoundationError(
        `Capacity target key ${targetKey} appears more than once.`,
        'DUPLICATE_SERVICE_CAPACITY_TARGET',
      );
    }
    seenKeys.add(targetKey);
    if (!targetDisplayName || targetDisplayName.length > 80) {
      throw new ServiceFoundationError(
        'Capacity target name must be between 1 and 80 characters.',
        'INVALID_SERVICE_CAPACITY_TARGET_NAME',
      );
    }
    if (!SERVICE_CAPACITY_UNITS.includes(target.unit)) {
      throw new ServiceFoundationError(
        'Capacity target unit is not recognized.',
        'INVALID_SERVICE_CAPACITY_UNIT',
      );
    }
    if (!Number.isSafeInteger(target.targetValue) || target.targetValue < 1) {
      throw new ServiceFoundationError(
        'Capacity target must be a positive whole number.',
        'INVALID_SERVICE_CAPACITY_VALUE',
      );
    }
    if (!Number.isSafeInteger(target.displayOrder) || target.displayOrder < 0) {
      throw new ServiceFoundationError(
        'Capacity target display order must be a non-negative whole number.',
        'INVALID_SERVICE_CAPACITY_ORDER',
      );
    }

    return { ...target, targetKey, displayName: targetDisplayName, metricKey };
  });

  return {
    ...draft,
    planKey,
    displayName,
    description,
    timezone,
    targets,
  };
}

export function capacityPlanForServiceDate<T extends Pick<
  ServiceCapacityPlanRevisionDraft,
  'effectiveStartDate' | 'effectiveEndDate' | 'revision'
>>(
  serviceDate: string,
  revisions: readonly T[],
): T | null {
  if (!isLocalDate(serviceDate)) {
    throw new ServiceFoundationError(
      'Service date must use YYYY-MM-DD.',
      'INVALID_SERVICE_CAPACITY_DATE',
    );
  }
  return revisions
    .filter((revision) => (
      revision.effectiveStartDate <= serviceDate
      && (revision.effectiveEndDate === null || revision.effectiveEndDate >= serviceDate)
    ))
    .sort((left, right) => (
      right.effectiveStartDate.localeCompare(left.effectiveStartDate)
      || right.revision - left.revision
    ))[0] ?? null;
}
