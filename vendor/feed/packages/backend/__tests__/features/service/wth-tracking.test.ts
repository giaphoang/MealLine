// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Readable } from 'stream';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';
import {
  calculateWthTrackingFormalReconciliation,
  exportWthTrackingWorkbook,
  parseWthTrackingCsv,
  selectEffectiveWthMetricRevision,
  WTH_TRACKING_EXPORT_HEADERS,
  WthTrackingImportError,
  type WthTrackingStagingDraft,
} from '../../../src/services/service';

const inlineCell = (ref: string, value: string) => (
  `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`
);

const workbook = async (
  metricCells: string,
  options: { sheetName?: string; week?: number } = {},
): Promise<Buffer> => {
  const sheetName = options.sheetName ?? 'August 2026';
  const week = options.week ?? 1;
  const zip = new JSZip();
  zip.file('xl/workbook.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets>`,
    '</workbook>',
  ].join(''));
  zip.file('xl/_rels/workbook.xml.rels', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>',
    '</Relationships>',
  ].join(''));
  zip.file('xl/worksheets/sheet1.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<worksheet><sheetData>',
    `<row r="1">${inlineCell('B1', 'Tuesday')}${inlineCell('E1', 'Wednesday')}</row>`,
    `<row r="2">${inlineCell('A2', 'Calendar Dates')}${inlineCell('B2', 'Visits')}${inlineCell('C2', 'Total')}${inlineCell('D2', 'Notes')}${inlineCell('E2', 'Lists')}</row>`,
    `<row r="3">${inlineCell('A3', String(week))}${metricCells}</row>`,
    '</sheetData></worksheet>',
  ].join(''));
  return zip.generateAsync({ type: 'nodebuffer' });
};

const cell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const csv = (rows: string[][]) => [WTH_TRACKING_EXPORT_HEADERS, ...rows]
  .map((row) => row.map(cell).join(','))
  .join('\n');

const row = (overrides: Record<string, string> = {}) => {
  const source: Record<string, string> = {
    'FEED Schema Version': 'wth-service-tracking/1.0',
    'Service Date': '2026-08-04',
    'Metric Key': 'shopping_visits',
    'Metric Label': 'Pantry Shopping Visits',
    Value: '70',
    'Value Type': 'count',
    Unit: 'households',
    'Semantic Role': 'served_household_method',
    'Source Sheet': 'August 2026',
    'Source Cell': 'C3',
    ...overrides,
  };
  return WTH_TRACKING_EXPORT_HEADERS.map((header) => source[header]);
};

const parseFixture = async (text: string) => {
  const rows: WthTrackingStagingDraft[] = [];
  const summary = await parseWthTrackingCsv(Readable.from([text]), {
    onRows: async (batch) => { rows.push(...batch); },
  });
  return { rows, summary };
};

describe('WTH Tracking long-form adapter', () => {
  test('never turns a partial regular-method day into zero during formal reconciliation', () => {
    const result = calculateWthTrackingFormalReconciliation([
      { serviceDate: '2026-08-04', metricKey: 'shopping_visits', countValue: 70 },
      { serviceDate: '2026-08-04', metricKey: 'emergency_bags', countValue: 5 },
      { serviceDate: '2026-08-05', metricKey: 'shopping_visits', countValue: 60 },
      { serviceDate: '2026-08-05', metricKey: 'long_lists', countValue: 10 },
      { serviceDate: '2026-08-05', metricKey: 'premade_bags', countValue: 20 },
    ], [
      { source: 'simc', serviceDate: '2026-08-04', reportedHouseholdCount: 72 },
      { source: 'simc', serviceDate: '2026-08-05', reportedHouseholdCount: 90 },
    ]);

    expect(result).toMatchObject({
      overlapDateCount: 1,
      incompleteRegularMethodDateCount: 1,
      exactRegularMatchDateCount: 1,
      formalHouseholdCount: 90,
      regularOperationalHouseholdCount: 90,
      regularDifference: 0,
    });
  });

  test('exports only directly entered metrics and excludes Total, Notes, and formula zeroes', async () => {
    const source = await workbook([
      '<c r="B3"><v>0</v></c>',
      '<c r="C3"><f>SUM(B3)</f><v>999</v></c>',
      inlineCell('D3', 'staff note'),
      '<c r="E3"><f>IF(TRUE,0,0)</f><v>0</v></c>',
    ].join(''));
    const result = await exportWthTrackingWorkbook(source);

    expect(result.summary).toMatchObject({
      worksheetCount: 1,
      observationCount: 1,
      excludedFormulaMetricCellCount: 1,
      explicitZeroCount: 1,
      rangeStart: '2026-08-04',
      rangeEnd: '2026-08-04',
    });
    expect(result.rows).toEqual([
      expect.objectContaining({
        serviceDate: '2026-08-04', metricKey: 'shopping_visits',
        value: '0', sourceSheet: 'August 2026', sourceCell: 'B3',
      }),
    ]);
    expect(result.csv).not.toContain('staff note');
    expect(result.csv).not.toContain(',Total,');
  });

  test('maps week rows to Tuesday-Thursday service blocks rather than nth weekdays', async () => {
    const source = await workbook(inlineCell('B3', '65'), {
      sheetName: 'November 2023',
      week: 5,
    });
    const result = await exportWthTrackingWorkbook(source);

    expect(result.rows).toEqual([
      expect.objectContaining({
        serviceDate: '2023-11-28',
        metricKey: 'shopping_visits',
        sourceSheet: 'November 2023',
        sourceCell: 'B3',
      }),
    ]);
  });

  test('blocks invalid direct values with their exact workbook location', async () => {
    const source = await workbook(`${inlineCell('B3', '14-16')}${inlineCell('E3', '12')}`);
    await expect(exportWthTrackingWorkbook(source)).rejects.toThrow(
      'August 2026!B3 (Visits: 14-16)',
    );
  });

  test('preserves direct observations, explicit zero, time, and workbook provenance', async () => {
    const result = await parseFixture(csv([
      row({ 'Metric Label': 'East Wing Shopping Visits' }),
      row({
        'Metric Key': 'emergency_bags', 'Metric Label': 'Emergency Bags',
        Value: '0', 'Source Cell': 'H3',
      }),
      row({
        'Metric Key': 'capacity_reached_time', 'Metric Label': 'Time Capacity Was Reached',
        Value: '13:30', 'Value Type': 'time_of_day', Unit: 'marker',
        'Semantic Role': 'capacity_marker', 'Source Cell': 'G3',
      }),
    ]));

    expect(result.summary).toMatchObject({
      rowCount: 3,
      serviceDateCount: 1,
      regularHouseholdCount: 70,
      emergencyBagCount: 0,
      operationalHouseholdCount: 70,
      explicitZeroCount: 1,
      capacityReachedDayCount: 1,
    });
    expect(result.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metricKey: 'shopping_visits', countValue: 70,
        sourceMetricLabel: 'East Wing Shopping Visits',
      }),
      expect.objectContaining({
        metricKey: 'emergency_bags', countValue: 0,
        sourceSheet: 'August 2026', sourceCell: 'H3',
      }),
      expect.objectContaining({
        metricKey: 'capacity_reached_time', timeValue: '13:30',
      }),
    ]));
  });

  test('keeps approved source labels independent from the configured display alias', () => {
    const revision = {
      id: 1,
      revision: 1,
      displayName: 'Visits',
      valueType: 'count',
      unit: 'households',
      semanticRole: 'served_household_method',
      isActive: true,
      effectiveStartDate: '2023-10-17',
      effectiveEndDate: '2025-10-31',
    };

    expect(selectEffectiveWthMetricRevision([revision], {
      serviceDate: '2024-11-05',
      metricKey: 'shopping_visits',
      sourceMetricLabel: 'East Wing Shopping Visits',
    })).toBe(revision);
  });

  test('does not disguise staging callback failures as malformed CSV rows', async () => {
    const failure = new Error('staging write failed');
    await expect(parseWthTrackingCsv(Readable.from([csv([row()])]), {
      batchSize: 1,
      onRows: async () => { throw failure; },
    })).rejects.toBe(failure);
  });

  test('rejects duplicate metric/day observations instead of choosing row order', async () => {
    await expect(parseFixture(csv([row(), row({ 'Source Cell': 'J3' })])))
      .rejects.toMatchObject({
        code: 'DUPLICATE_WTH_TRACKING_OBSERVATION',
        rowNumber: 3,
      } satisfies Partial<WthTrackingImportError>);
  });

  test('rejects a changed metric contract and unsupported schema version', async () => {
    await expect(parseFixture(csv([row({ Unit: 'people' })])))
      .rejects.toMatchObject({ code: 'INVALID_WTH_TRACKING_METRIC_CONTRACT' });
    await expect(parseFixture(csv([row({ 'FEED Schema Version': 'wth-service-tracking/2.0' })])))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_WTH_TRACKING_SCHEMA' });
  });
});
