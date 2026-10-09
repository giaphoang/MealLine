// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import {
  selectCurrentMetricObservationRevisionIds,
  selectCurrentServiceRevisionIds,
} from '../../../src/services/service';

describe('Service import rollback and restore projection', () => {
  test('selects the newest active candidate in each source-scoped identity', () => {
    expect(selectCurrentServiceRevisionIds([
      { id: 1, source: 'link2feed', key: 'visit:1', revision: 1 },
      { id: 2, source: 'link2feed', key: 'visit:1', revision: 2 },
      { id: 3, source: 'link2feed', key: 'visit:2', revision: 1 },
      { id: 4, source: 'simc', key: 'visit:1', revision: 1 },
    ])).toEqual([2, 3, 4]);
  });

  test('never merges identical record keys across formal source namespaces', () => {
    const winners = selectCurrentServiceRevisionIds([
      { id: 10, source: 'link2feed', key: '123', revision: 2 },
      { id: 11, source: 'simc', key: '123', revision: 1 },
    ]);
    expect(winners).toEqual([10, 11]);
  });

  test('projects one operational observation per metric and date', () => {
    expect(selectCurrentMetricObservationRevisionIds([
      { id: 20, metricId: 7, serviceDate: '2026-08-04', source: 'wth_tracking', revision: 1 },
      { id: 21, metricId: 7, serviceDate: '2026-08-04', source: 'wth_tracking', revision: 2 },
      { id: 22, metricId: 8, serviceDate: '2026-08-04', source: 'wth_tracking', revision: 1 },
    ])).toEqual([21, 22]);
  });

  test('keeps a later native correction authoritative over an imported seed or restore', () => {
    expect(selectCurrentMetricObservationRevisionIds([
      { id: 30, metricId: 7, serviceDate: '2026-08-04', source: 'wth_tracking', revision: 8 },
      { id: 31, metricId: 7, serviceDate: '2026-08-04', source: 'feed_service_log', revision: 2 },
    ])).toEqual([31]);
  });
});
