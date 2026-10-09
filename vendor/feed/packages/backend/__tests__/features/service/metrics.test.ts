// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  placeServiceMetricAtPosition,
  serviceMetricObservationSnapshotHash,
  validateServiceDayStatus,
  validateServiceMetricDefinition,
  validateServiceMetricObservation,
  summarizeOperationalTotal,
  type ServiceMetricDefinitionDraft,
  type ServiceMetricObservationDraft,
} from '../../../src/services/service';

const shoppingVisits: ServiceMetricDefinitionDraft = {
  metricKey: 'shopping_visits',
  displayName: 'Pantry Shopping Visits',
  description: 'Households that shop in the pantry.',
  iconName: 'shopping-basket',
  valueType: 'count',
  unit: 'households',
  semanticRole: 'served_household_method',
  contributesToOperationalTotal: true,
  capacityTarget: 75,
  effectiveStartDate: '2025-11-01',
  effectiveEndDate: null,
  displayOrder: 10,
  isActive: true,
};

const countObservation: ServiceMetricObservationDraft = {
  source: 'feed_service_log',
  sourceRecordKey: '2026-08-10:shopping_visits',
  metricKey: 'shopping_visits',
  definitionRevision: 2,
  serviceDate: '2026-08-10',
  valueType: 'count',
  countValue: 0,
  booleanValue: null,
  timeValue: null,
  entryState: 'draft',
};

describe('Service operational metric contract', () => {
  test('places metrics at ordinal positions without duplicate ordering', () => {
    expect(placeServiceMetricAtPosition([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3]);
    expect(placeServiceMetricAtPosition([1, 2, 3], 4, 2)).toEqual([1, 4, 2, 3]);
  });

  test('rejects a stale ordinal position instead of guessing', () => {
    expect(() => placeServiceMetricAtPosition([1, 2, 3], 2, 4)).toThrow(/positions changed/i);
    expect(() => placeServiceMetricAtPosition([1, 2, 3], 4, 5)).toThrow(/positions changed/i);
  });

  test('counts explicit zero as recorded while keeping blank out of denominator coverage', () => {
    expect(summarizeOperationalTotal([
      { contributesToOperationalTotal: true, observation: { countValue: 0 } },
      { contributesToOperationalTotal: true, observation: { countValue: 12 } },
      { contributesToOperationalTotal: true, observation: null },
      { contributesToOperationalTotal: false, observation: { countValue: 99 } },
    ])).toEqual({
      value: 12,
      recordedMetricCount: 2,
      expectedMetricCount: 3,
      complete: false,
    });
  });
  test('accepts a served-household method and its effective capacity target', () => {
    expect(validateServiceMetricDefinition(shoppingVisits)).toEqual(shoppingVisits);
  });

  test('requires a normalized FEED icon-library name', () => {
    expect(() => validateServiceMetricDefinition({
      ...shoppingVisits,
      iconName: 'Shopping Basket',
    })).toThrow(/selected from the FEED icon library/i);
  });

  test('keeps Emergency Bags served but outside the regular capacity target', () => {
    expect(validateServiceMetricDefinition({
      ...shoppingVisits,
      metricKey: 'emergency_bags',
      displayName: 'Emergency Bags',
      capacityTarget: null,
      displayOrder: 40,
    })).toMatchObject({
      contributesToOperationalTotal: true,
      capacityTarget: null,
    });
  });

  test('keeps Turned Away outside the operational served total', () => {
    expect(validateServiceMetricDefinition({
      ...shoppingVisits,
      metricKey: 'turned_away',
      displayName: 'Turned Away',
      semanticRole: 'unmet_demand',
      contributesToOperationalTotal: false,
      capacityTarget: null,
    })).toMatchObject({
      semanticRole: 'unmet_demand',
      contributesToOperationalTotal: false,
    });
  });

  test('accepts the time capacity was reached as a time marker', () => {
    expect(validateServiceMetricDefinition({
      ...shoppingVisits,
      metricKey: 'capacity_reached_at',
      displayName: 'Time Capacity Was Reached',
      valueType: 'time_of_day',
      unit: 'marker',
      semanticRole: 'capacity_marker',
      contributesToOperationalTotal: false,
      capacityTarget: null,
    })).toMatchObject({ valueType: 'time_of_day', unit: 'marker' });
  });

  test('refuses to add unlike metrics to the served-household total', () => {
    expect(() => validateServiceMetricDefinition({
      ...shoppingVisits,
      metricKey: 'camping_gear_requests',
      displayName: 'Camping Gear Requests',
      unit: 'requests',
      semanticRole: 'ancillary_service',
      contributesToOperationalTotal: true,
      capacityTarget: null,
    })).toThrow(/only served-household count metrics/i);
  });

  test('represents explicit zero with a row while blank remains no row', () => {
    expect(validateServiceMetricObservation(countObservation).countValue).toBe(0);
    expect(() => validateServiceMetricObservation({
      ...countObservation,
      countValue: null,
    })).toThrow(/No row represents not recorded/i);
  });

  test('enforces exactly one value matching the configured type', () => {
    expect(() => validateServiceMetricObservation({
      ...countObservation,
      booleanValue: false,
    })).toThrow(/exactly one typed value/i);

    expect(validateServiceMetricObservation({
      ...countObservation,
      sourceRecordKey: '2026-08-10:capacity_reached_at',
      metricKey: 'capacity_reached_at',
      valueType: 'time_of_day',
      countValue: null,
      timeValue: '13:42',
    }).timeValue).toBe('13:42');
  });

  test('rejects invalid time markers instead of guessing AM or PM', () => {
    expect(() => validateServiceMetricObservation({
      ...countObservation,
      valueType: 'time_of_day',
      countValue: null,
      timeValue: '1:42 PM',
    })).toThrow(/24-hour HH:MM/i);
  });

  test('hashes normalized source identity and preserves entry state', () => {
    expect(serviceMetricObservationSnapshotHash({
      ...countObservation,
      source: ' feed_service_log ',
      sourceRecordKey: ' 2026-08-10:shopping_visits ',
    })).toBe(serviceMetricObservationSnapshotHash(countObservation));

    expect(serviceMetricObservationSnapshotHash({
      ...countObservation,
      entryState: 'finalized',
    })).not.toBe(serviceMetricObservationSnapshotHash(countObservation));
  });

  test('keeps pantry open/closed separate from draft/finalized workflow state', () => {
    expect(validateServiceDayStatus({
      serviceDate: '2026-08-10',
      pantryStatus: 'closed',
      entryState: 'finalized',
    })).toEqual({
      serviceDate: '2026-08-10',
      pantryStatus: 'closed',
      entryState: 'finalized',
    });
  });
});
