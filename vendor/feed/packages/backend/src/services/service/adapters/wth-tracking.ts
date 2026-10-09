// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { CsvError, parse } from 'csv-parse';
import type { Readable } from 'stream';
import { inspectCsvHeader } from '../../data-import/source-contracts';

export const WTH_TRACKING_CONTRACT_ID = 'wth_service_tracking_v1';
export const WTH_TRACKING_SOURCE = 'wth_tracking';
export const WTH_TRACKING_ADAPTER_VERSION = 2;
export const WTH_TRACKING_SCHEMA_VERSION = 'wth-service-tracking/1.0';

type ValueType = 'count' | 'time_of_day';
type Unit = 'households' | 'requests' | 'marker';
type SemanticRole = 'served_household_method' | 'unmet_demand' | 'ancillary_service' | 'capacity_marker';

interface MetricContract {
  valueType: ValueType;
  unit: Unit;
  semanticRole: SemanticRole;
  labels: readonly string[];
  labelPatterns?: readonly RegExp[];
}

export const WTH_TRACKING_METRIC_CONTRACTS: Readonly<Record<string, MetricContract>> = {
  shopping_visits: {
    valueType: 'count', unit: 'households', semanticRole: 'served_household_method',
    labels: ['Visits', 'Shopping Visits', 'Pantry Shopping Visits'],
    labelPatterns: [/^.+\s+shopping visits$/i],
  },
  long_lists: {
    valueType: 'count', unit: 'households', semanticRole: 'served_household_method',
    labels: ['Lists', 'Long Lists'],
  },
  premade_bags: {
    valueType: 'count', unit: 'households', semanticRole: 'served_household_method',
    labels: ['Premade Bag', 'Premade Bags'],
  },
  emergency_bags: {
    valueType: 'count', unit: 'households', semanticRole: 'served_household_method',
    labels: ['Emergency Bags'],
  },
  turned_away: {
    valueType: 'count', unit: 'households', semanticRole: 'unmet_demand',
    labels: ['Turned Away'],
  },
  camping_gear_requests: {
    valueType: 'count', unit: 'requests', semanticRole: 'ancillary_service',
    labels: ['Camping Gear Requests'],
  },
  capacity_reached_time: {
    valueType: 'time_of_day', unit: 'marker', semanticRole: 'capacity_marker',
    labels: ['Time Capacity Was Reached'],
  },
};

export const wthTrackingMetricForSourceLabel = (sourceLabel: string): {
  metricKey: string;
  contract: MetricContract;
} | null => {
  const cleanedLabel = clean(sourceLabel);
  const normalizedLabel = normalized(cleanedLabel);
  for (const [metricKey, contract] of Object.entries(WTH_TRACKING_METRIC_CONTRACTS)) {
    if (
      contract.labels.some((label) => normalized(label) === normalizedLabel)
      || contract.labelPatterns?.some((pattern) => pattern.test(cleanedLabel))
    ) return { metricKey, contract };
  }
  return null;
};

export interface WthTrackingStagingDraft {
  sourceRowNumber: number;
  sourceRecordKey: string;
  serviceDate: string;
  metricKey: string;
  sourceMetricLabel: string;
  valueType: ValueType;
  countValue: number | null;
  booleanValue: null;
  timeValue: string | null;
  sourceSheet: string;
  sourceCell: string;
  warningCodes: string[];
}

export interface WthTrackingParseSummary {
  adapterVersion: number;
  rowCount: number;
  serviceDateCount: number;
  rangeStart: string;
  rangeEnd: string;
  metricCounts: Record<string, number>;
  explicitZeroCount: number;
  regularHouseholdCount: number;
  emergencyBagCount: number;
  operationalHouseholdCount: number;
  turnedAwayHouseholdCount: number;
  campingGearRequestCount: number;
  capacityReachedDayCount: number;
  qualityIssueCount: number;
  warningCount: number;
}

export interface WthTrackingParserOptions {
  batchSize?: number;
  onRows: (rows: WthTrackingStagingDraft[]) => Promise<void>;
  onProgress?: (processedRows: number) => Promise<void>;
}

export class WthTrackingImportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly rowNumber?: number,
  ) {
    super(message);
    this.name = 'WthTrackingImportError';
  }
}

const clean = (value: string | undefined): string => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalized = (value: string): string => clean(value).toLocaleLowerCase('en-US');

const localDate = (value: string, rowNumber: number): string => {
  const text = clean(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new WthTrackingImportError(
    `Row ${rowNumber} has an invalid Service Date. Re-run the WTH Tracking exporter and retry.`,
    'INVALID_WTH_TRACKING_DATE',
    rowNumber,
  );
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== text) throw new WthTrackingImportError(
    `Row ${rowNumber} has an invalid Service Date. Re-run the WTH Tracking exporter and retry.`,
    'INVALID_WTH_TRACKING_DATE',
    rowNumber,
  );
  return text;
};

const parsedValue = (raw: string, contract: MetricContract, rowNumber: number) => {
  const value = clean(raw);
  if (contract.valueType === 'count') {
    const count = Number(value);
    if (!value || !Number.isSafeInteger(count) || count < 0) throw new WthTrackingImportError(
      `Row ${rowNumber} has an invalid count. Re-run the WTH Tracking exporter and retry.`,
      'INVALID_WTH_TRACKING_VALUE',
      rowNumber,
    );
    return { countValue: count, booleanValue: null, timeValue: null } as const;
  }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new WthTrackingImportError(
    `Row ${rowNumber} has an invalid time. Re-run the WTH Tracking exporter and retry.`,
    'INVALID_WTH_TRACKING_VALUE',
    rowNumber,
  );
  return { countValue: null, booleanValue: null, timeValue: value } as const;
};

export const wthTrackingSourceRecordKey = (serviceDate: string, metricKey: string): string => (
  `wth_tracking:${serviceDate}:${metricKey}`
);

export async function parseWthTrackingCsv(
  input: Readable,
  options: WthTrackingParserOptions,
): Promise<WthTrackingParseSummary> {
  const batchSize = options.batchSize ?? 500;
  let headers: string[] = [];
  const parser = input.pipe(parse({
    bom: true,
    columns: (inputHeaders: string[]) => {
      headers = inputHeaders.map(clean);
      const inspection = inspectCsvHeader(headers.map((header) => `"${header.replace(/"/g, '""')}"`).join(','));
      if (inspection.status !== 'detected' || inspection.contract.id !== WTH_TRACKING_CONTRACT_ID) {
        throw new WthTrackingImportError(
          'This file no longer matches the WTH Tracking export contract. Re-run the exporter and retry.',
          'INVALID_WTH_TRACKING_CONTRACT',
        );
      }
      return headers;
    },
    skip_empty_lines: true,
    relax_column_count: false,
    trim: false,
  }));

  let rowNumber = 1;
  let processedRows = 0;
  let explicitZeroCount = 0;
  let regularHouseholdCount = 0;
  let emergencyBagCount = 0;
  let turnedAwayHouseholdCount = 0;
  let campingGearRequestCount = 0;
  let capacityReachedDayCount = 0;
  const dates = new Set<string>();
  const identities = new Set<string>();
  const metricCounts: Record<string, number> = {};
  const batch: WthTrackingStagingDraft[] = [];

  try {
    for await (const source of parser as AsyncIterable<Record<string, string>>) {
      rowNumber += 1;
      const schemaVersion = clean(source['FEED Schema Version']);
      if (schemaVersion !== WTH_TRACKING_SCHEMA_VERSION) throw new WthTrackingImportError(
        `Row ${rowNumber} uses an unsupported FEED Schema Version. Re-run the current WTH Tracking exporter.`,
        'UNSUPPORTED_WTH_TRACKING_SCHEMA',
        rowNumber,
      );
      const serviceDate = localDate(source['Service Date'], rowNumber);
      const metricKey = clean(source['Metric Key']);
      const contract = WTH_TRACKING_METRIC_CONTRACTS[metricKey];
      if (!contract) throw new WthTrackingImportError(
        `Row ${rowNumber} has an unrecognized Metric Key. Re-run the WTH Tracking exporter and retry.`,
        'INVALID_WTH_TRACKING_METRIC',
        rowNumber,
      );
      const sourceMetricLabel = clean(source['Metric Label']);
      if (wthTrackingMetricForSourceLabel(sourceMetricLabel)?.metricKey !== metricKey) {
        throw new WthTrackingImportError(
          `Row ${rowNumber} has a metric label that does not match ${metricKey}. Correct the export and retry.`,
          'INVALID_WTH_TRACKING_METRIC_LABEL',
          rowNumber,
        );
      }
      if (
        clean(source['Value Type']) !== contract.valueType
        || clean(source.Unit) !== contract.unit
        || clean(source['Semantic Role']) !== contract.semanticRole
      ) throw new WthTrackingImportError(
        `Row ${rowNumber} changes the approved type, unit, or role for ${sourceMetricLabel}. Correct the export and retry.`,
        'INVALID_WTH_TRACKING_METRIC_CONTRACT',
        rowNumber,
      );
      const sourceSheet = clean(source['Source Sheet']);
      const sourceCell = clean(source['Source Cell']).toLocaleUpperCase('en-US');
      if (!/^[A-Za-z]+\s+\d{4}$/.test(sourceSheet) || !/^[A-Z]{1,3}[1-9]\d*$/.test(sourceCell)) {
        throw new WthTrackingImportError(
          `Row ${rowNumber} has invalid workbook provenance. Re-run the WTH Tracking exporter and retry.`,
          'INVALID_WTH_TRACKING_PROVENANCE',
          rowNumber,
        );
      }
      const sourceRecordKey = wthTrackingSourceRecordKey(serviceDate, metricKey);
      if (identities.has(sourceRecordKey)) throw new WthTrackingImportError(
        `Row ${rowNumber} duplicates ${sourceMetricLabel} for ${serviceDate}. Correct the workbook and re-export it.`,
        'DUPLICATE_WTH_TRACKING_OBSERVATION',
        rowNumber,
      );
      identities.add(sourceRecordKey);
      const value = parsedValue(source.Value, contract, rowNumber);
      if (value.countValue === 0) explicitZeroCount += 1;
      if (['shopping_visits', 'long_lists', 'premade_bags'].includes(metricKey)) regularHouseholdCount += value.countValue ?? 0;
      if (metricKey === 'emergency_bags') emergencyBagCount += value.countValue ?? 0;
      if (metricKey === 'turned_away') turnedAwayHouseholdCount += value.countValue ?? 0;
      if (metricKey === 'camping_gear_requests') campingGearRequestCount += value.countValue ?? 0;
      if (metricKey === 'capacity_reached_time') capacityReachedDayCount += 1;
      dates.add(serviceDate);
      metricCounts[metricKey] = (metricCounts[metricKey] ?? 0) + 1;
      batch.push({
        sourceRowNumber: rowNumber,
        sourceRecordKey,
        serviceDate,
        metricKey,
        sourceMetricLabel,
        valueType: contract.valueType,
        ...value,
        sourceSheet,
        sourceCell,
        warningCodes: [],
      });
      processedRows += 1;
      if (batch.length >= batchSize) {
        await options.onRows(batch.splice(0));
        if (options.onProgress) await options.onProgress(processedRows);
      }
    }
    if (batch.length > 0) await options.onRows(batch.splice(0));
    if (options.onProgress) await options.onProgress(processedRows);
  } catch (error) {
    if (error instanceof WthTrackingImportError) throw error;
    if (error instanceof CsvError) {
      throw new WthTrackingImportError(
        `FEED could not read row ${rowNumber} of this WTH Tracking export. Re-run the exporter and retry.`,
        'INVALID_WTH_TRACKING_CSV',
        rowNumber,
      );
    }
    // onRows/onProgress belong to the ingestion workflow. Preserve their
    // configuration or persistence errors instead of misreporting them as a
    // malformed CSV row at the next batch boundary.
    throw error;
  }

  if (headers.length === 0 || processedRows === 0 || dates.size === 0) throw new WthTrackingImportError(
    'This WTH Tracking export contains no metric observations. Re-run the exporter and retry.',
    'EMPTY_WTH_TRACKING_EXPORT',
  );
  const orderedDates = [...dates].sort();
  return {
    adapterVersion: WTH_TRACKING_ADAPTER_VERSION,
    rowCount: processedRows,
    serviceDateCount: dates.size,
    rangeStart: orderedDates[0],
    rangeEnd: orderedDates[orderedDates.length - 1],
    metricCounts,
    explicitZeroCount,
    regularHouseholdCount,
    emergencyBagCount,
    operationalHouseholdCount: regularHouseholdCount + emergencyBagCount,
    turnedAwayHouseholdCount,
    campingGearRequestCount,
    capacityReachedDayCount,
    qualityIssueCount: 0,
    warningCount: 0,
  };
}
