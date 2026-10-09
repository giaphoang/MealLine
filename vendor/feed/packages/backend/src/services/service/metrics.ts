// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';
import { ServiceFoundationError } from './foundation';

export const SERVICE_METRIC_VALUE_TYPES = ['count', 'boolean', 'time_of_day'] as const;
export const SERVICE_METRIC_UNITS = ['households', 'people', 'requests', 'items', 'marker'] as const;
export const SERVICE_METRIC_SEMANTIC_ROLES = [
  'served_household_method',
  'unmet_demand',
  'ancillary_service',
  'capacity_marker',
  'informational_custom',
] as const;
export const SERVICE_ENTRY_STATES = ['draft', 'finalized'] as const;
export const SERVICE_PANTRY_STATUSES = ['open', 'closed'] as const;

export type ServiceMetricValueType = typeof SERVICE_METRIC_VALUE_TYPES[number];
export type ServiceMetricUnit = typeof SERVICE_METRIC_UNITS[number];
export type ServiceMetricSemanticRole = typeof SERVICE_METRIC_SEMANTIC_ROLES[number];
export type ServiceEntryState = typeof SERVICE_ENTRY_STATES[number];
export type ServicePantryStatus = typeof SERVICE_PANTRY_STATUSES[number];

export interface ServiceMetricDefinitionDraft {
  metricKey: string;
  displayName: string;
  description: string | null;
  iconName: string;
  valueType: ServiceMetricValueType;
  unit: ServiceMetricUnit;
  semanticRole: ServiceMetricSemanticRole;
  contributesToOperationalTotal: boolean;
  capacityTarget: number | null;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  displayOrder: number;
  isActive: boolean;
}

export interface ServiceMetricObservationDraft {
  source: string;
  sourceRecordKey: string;
  metricKey: string;
  definitionRevision: number;
  serviceDate: string;
  valueType: ServiceMetricValueType;
  countValue: number | null;
  booleanValue: boolean | null;
  timeValue: string | null;
  entryState: ServiceEntryState;
}

export interface ServiceDayStatusDraft {
  serviceDate: string;
  pantryStatus: ServicePantryStatus;
  entryState: ServiceEntryState;
}

const isLocalDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
};

export function validateServiceMetricDefinition(
  definition: ServiceMetricDefinitionDraft,
): ServiceMetricDefinitionDraft {
  const metricKey = definition.metricKey.trim();
  const displayName = definition.displayName.trim().replace(/\s+/g, ' ');
  const description = definition.description?.trim().replace(/\s+/g, ' ') || null;
  const iconName = definition.iconName?.trim() ?? '';

  if (!/^[a-z][a-z0-9_]{0,63}$/.test(metricKey)) {
    throw new ServiceFoundationError(
      'Metric key must start with a lowercase letter and use only lowercase letters, numbers, and underscores.',
      'INVALID_SERVICE_METRIC_KEY',
    );
  }
  if (!displayName || displayName.length > 80) {
    throw new ServiceFoundationError(
      'Metric display name must be between 1 and 80 characters.',
      'INVALID_SERVICE_METRIC_NAME',
    );
  }
  if (description && description.length > 500) {
    throw new ServiceFoundationError(
      'Metric description must be 500 characters or fewer.',
      'INVALID_SERVICE_METRIC_DESCRIPTION',
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(iconName) || iconName.length > 64) {
    throw new ServiceFoundationError(
      'Metric icon must be selected from the FEED icon library.',
      'INVALID_SERVICE_METRIC_ICON',
    );
  }
  if (!SERVICE_METRIC_VALUE_TYPES.includes(definition.valueType)) {
    throw new ServiceFoundationError('Metric value type is not recognized.', 'INVALID_SERVICE_METRIC_VALUE_TYPE');
  }
  if (!SERVICE_METRIC_UNITS.includes(definition.unit)) {
    throw new ServiceFoundationError('Metric unit is not recognized.', 'INVALID_SERVICE_METRIC_UNIT');
  }
  if (!SERVICE_METRIC_SEMANTIC_ROLES.includes(definition.semanticRole)) {
    throw new ServiceFoundationError('Metric semantic role is not recognized.', 'INVALID_SERVICE_METRIC_ROLE');
  }
  if (!Number.isSafeInteger(definition.displayOrder) || definition.displayOrder < 0) {
    throw new ServiceFoundationError(
      'Metric display order must be a non-negative whole number.',
      'INVALID_SERVICE_METRIC_ORDER',
    );
  }
  if (!isLocalDate(definition.effectiveStartDate)) {
    throw new ServiceFoundationError(
      'Metric effective start date must use YYYY-MM-DD.',
      'INVALID_SERVICE_METRIC_DATE',
    );
  }
  if (definition.effectiveEndDate !== null) {
    if (!isLocalDate(definition.effectiveEndDate) || definition.effectiveEndDate < definition.effectiveStartDate) {
      throw new ServiceFoundationError(
        'Metric effective end date must be on or after its start date.',
        'INVALID_SERVICE_METRIC_DATE',
      );
    }
  }
  if (
    definition.capacityTarget !== null
    && (!Number.isSafeInteger(definition.capacityTarget) || definition.capacityTarget < 0)
  ) {
    throw new ServiceFoundationError(
      'Metric capacity target must be a non-negative whole number or unavailable.',
      'INVALID_SERVICE_METRIC_CAPACITY',
    );
  }

  if (definition.valueType === 'count' && definition.unit === 'marker') {
    throw new ServiceFoundationError(
      'A count metric requires a countable unit.',
      'SERVICE_METRIC_TYPE_UNIT_MISMATCH',
    );
  }
  if (definition.valueType !== 'count' && definition.unit !== 'marker') {
    throw new ServiceFoundationError(
      'Boolean and time-of-day metrics use the marker unit.',
      'SERVICE_METRIC_TYPE_UNIT_MISMATCH',
    );
  }
  if (
    definition.semanticRole === 'served_household_method'
    && (definition.valueType !== 'count' || definition.unit !== 'households')
  ) {
    throw new ServiceFoundationError(
      'A served-household method must be a household count.',
      'SERVICE_METRIC_ROLE_MISMATCH',
    );
  }
  if (
    definition.semanticRole === 'capacity_marker'
    && !['boolean', 'time_of_day'].includes(definition.valueType)
  ) {
    throw new ServiceFoundationError(
      'A capacity marker must be boolean or time-of-day.',
      'SERVICE_METRIC_ROLE_MISMATCH',
    );
  }
  if (definition.contributesToOperationalTotal) {
    if (
      definition.semanticRole !== 'served_household_method'
      || definition.valueType !== 'count'
      || definition.unit !== 'households'
    ) {
      throw new ServiceFoundationError(
        'Only served-household count metrics may contribute to the operational household total.',
        'SERVICE_METRIC_TOTAL_MISMATCH',
      );
    }
  }
  if (
    definition.capacityTarget !== null
    && (
      definition.semanticRole !== 'served_household_method'
      || definition.valueType !== 'count'
      || definition.unit !== 'households'
    )
  ) {
    throw new ServiceFoundationError(
      'Capacity targets apply only to served-household count metrics.',
      'SERVICE_METRIC_CAPACITY_MISMATCH',
    );
  }

  return { ...definition, metricKey, displayName, description, iconName };
}

export function validateServiceMetricObservation(
  observation: ServiceMetricObservationDraft,
): ServiceMetricObservationDraft {
  const source = observation.source.trim();
  const sourceRecordKey = observation.sourceRecordKey.trim();
  const metricKey = observation.metricKey.trim();
  if (!source || source.length > 64 || !sourceRecordKey || sourceRecordKey.length > 256) {
    throw new ServiceFoundationError(
      'A metric observation requires a valid source and source record key.',
      'INVALID_SERVICE_METRIC_OBSERVATION_KEY',
    );
  }
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(metricKey)) {
    throw new ServiceFoundationError('Metric key is not valid.', 'INVALID_SERVICE_METRIC_KEY');
  }
  if (!Number.isSafeInteger(observation.definitionRevision) || observation.definitionRevision < 1) {
    throw new ServiceFoundationError(
      'Metric observation requires a positive definition revision.',
      'INVALID_SERVICE_METRIC_DEFINITION_REVISION',
    );
  }
  if (!isLocalDate(observation.serviceDate)) {
    throw new ServiceFoundationError('Metric observation date must use YYYY-MM-DD.', 'INVALID_SERVICE_METRIC_DATE');
  }
  if (!SERVICE_METRIC_VALUE_TYPES.includes(observation.valueType)) {
    throw new ServiceFoundationError('Metric value type is not recognized.', 'INVALID_SERVICE_METRIC_VALUE_TYPE');
  }
  if (!SERVICE_ENTRY_STATES.includes(observation.entryState)) {
    throw new ServiceFoundationError('Metric entry state is not recognized.', 'INVALID_SERVICE_ENTRY_STATE');
  }

  const populated = [
    observation.countValue !== null,
    observation.booleanValue !== null,
    observation.timeValue !== null,
  ].filter(Boolean).length;
  if (populated !== 1) {
    throw new ServiceFoundationError(
      'A metric observation must contain exactly one typed value. No row represents not recorded.',
      'INVALID_SERVICE_METRIC_VALUE',
    );
  }
  if (
    observation.valueType === 'count'
    && (
      observation.countValue === null
      || !Number.isSafeInteger(observation.countValue)
      || observation.countValue < 0
      || observation.booleanValue !== null
      || observation.timeValue !== null
    )
  ) {
    throw new ServiceFoundationError(
      'A count observation requires one non-negative whole-number value.',
      'INVALID_SERVICE_METRIC_VALUE',
    );
  }
  if (
    observation.valueType === 'boolean'
    && (typeof observation.booleanValue !== 'boolean' || observation.countValue !== null || observation.timeValue !== null)
  ) {
    throw new ServiceFoundationError(
      'A boolean observation requires one true/false value.',
      'INVALID_SERVICE_METRIC_VALUE',
    );
  }
  if (
    observation.valueType === 'time_of_day'
    && (
      observation.countValue !== null
      || observation.booleanValue !== null
      || observation.timeValue === null
      || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(observation.timeValue)
    )
  ) {
    throw new ServiceFoundationError(
      'A time-of-day observation requires a 24-hour HH:MM value.',
      'INVALID_SERVICE_METRIC_VALUE',
    );
  }

  return { ...observation, source, sourceRecordKey, metricKey };
}

export function serviceMetricObservationSnapshotHash(
  observation: ServiceMetricObservationDraft,
): string {
  const validated = validateServiceMetricObservation(observation);
  return createHash('sha256').update(JSON.stringify(validated)).digest('hex');
}

export function validateServiceDayStatus(status: ServiceDayStatusDraft): ServiceDayStatusDraft {
  if (!isLocalDate(status.serviceDate)) {
    throw new ServiceFoundationError('Service day must use YYYY-MM-DD.', 'INVALID_SERVICE_DAY_DATE');
  }
  if (!SERVICE_PANTRY_STATUSES.includes(status.pantryStatus)) {
    throw new ServiceFoundationError('Pantry status is not recognized.', 'INVALID_SERVICE_PANTRY_STATUS');
  }
  if (!SERVICE_ENTRY_STATES.includes(status.entryState)) {
    throw new ServiceFoundationError('Service day entry state is not recognized.', 'INVALID_SERVICE_ENTRY_STATE');
  }
  return status;
}
