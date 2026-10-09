// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import JSZip from 'jszip';
import { WTH_SERVICE_TRACKING_HEADERS } from '../data-import/source-contracts';
import {
  WTH_TRACKING_SCHEMA_VERSION,
  wthTrackingMetricForSourceLabel,
} from './adapters/wth-tracking';

export const WTH_TRACKING_EXPORT_HEADERS = WTH_SERVICE_TRACKING_HEADERS;

type Weekday = 'tuesday' | 'wednesday' | 'thursday';
type CellValue = string | number | boolean | null;

interface WorkbookCell {
  ref: string;
  row: number;
  column: number;
  value: CellValue;
  hasFormula: boolean;
}

interface WorkbookSheet {
  name: string;
  cells: Map<string, WorkbookCell>;
}

interface MetricContract {
  metricKey: string;
  valueType: 'count' | 'time_of_day';
  unit: 'households' | 'requests' | 'marker';
  semanticRole: 'served_household_method' | 'unmet_demand' | 'ancillary_service' | 'capacity_marker';
}

export interface WthTrackingExportRow {
  schemaVersion: typeof WTH_TRACKING_SCHEMA_VERSION;
  serviceDate: string;
  metricKey: string;
  metricLabel: string;
  value: string;
  valueType: MetricContract['valueType'];
  unit: MetricContract['unit'];
  semanticRole: MetricContract['semanticRole'];
  sourceSheet: string;
  sourceCell: string;
}

export interface WthTrackingExportSummary {
  worksheetCount: number;
  observationCount: number;
  excludedFormulaMetricCellCount: number;
  explicitZeroCount: number;
  closedDayMarkerCount: number;
  rangeStart: string;
  rangeEnd: string;
  metricCounts: Record<string, number>;
}

const normalize = (value: unknown): string => String(value ?? '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('en-US');

const metricContractForLabel = (label: string): MetricContract | null => {
  const match = wthTrackingMetricForSourceLabel(label);
  return match ? {
    metricKey: match.metricKey,
    valueType: match.contract.valueType,
    unit: match.contract.unit,
    semanticRole: match.contract.semanticRole,
  } : null;
};

const decodeXml = (value: string): string => value
  .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&');

const attribute = (attributes: string, name: string): string | null => {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes);
  return match ? decodeXml(match[1]) : null;
};

const columnIndex = (ref: string): number => {
  const letters = /^[A-Z]+/.exec(ref)?.[0];
  if (!letters) throw new Error(`Invalid workbook cell reference: ${ref}`);
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
};

const columnLetters = (index: number): string => {
  let value = index;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const richText = (xml: string): string => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
  .map((match) => decodeXml(match[1]))
  .join('');

const parseSharedStrings = (xml: string | null): string[] => {
  if (!xml) return [];
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((match) => richText(match[1]));
};

const parseSheetCells = (xml: string, sharedStrings: readonly string[]): Map<string, WorkbookCell> => {
  const cells = new Map<string, WorkbookCell>();
  for (const match of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const ref = attribute(match[1], 'r');
    if (!ref) continue;
    const row = Number(/\d+$/.exec(ref)?.[0]);
    const type = attribute(match[1], 't');
    const body = match[2] ?? '';
    const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? null;
    let value: CellValue = null;
    if (type === 's' && raw !== null) value = sharedStrings[Number(raw)] ?? '';
    else if (type === 'inlineStr') value = richText(body);
    else if (type === 'str' && raw !== null) value = decodeXml(raw);
    else if (type === 'b' && raw !== null) value = raw === '1';
    else if (raw !== null && raw !== '') {
      const numeric = Number(raw);
      value = Number.isFinite(numeric) ? numeric : decodeXml(raw);
    }
    cells.set(ref, {
      ref,
      row,
      column: columnIndex(ref),
      value,
      hasFormula: /<f(?:\s[^>]*)?>/.test(body),
    });
  }
  return cells;
};

const xmlFile = async (zip: JSZip, path: string): Promise<string> => {
  const file = zip.file(path);
  if (!file) throw new Error(`Tracking workbook is missing ${path}.`);
  return file.async('string');
};

async function readWorkbook(buffer: Buffer): Promise<WorkbookSheet[]> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await xmlFile(zip, 'xl/workbook.xml');
  const relsXml = await xmlFile(zip, 'xl/_rels/workbook.xml.rels');
  const sharedStrings = parseSharedStrings(
    zip.file('xl/sharedStrings.xml') ? await xmlFile(zip, 'xl/sharedStrings.xml') : null,
  );
  const relationships = new Map<string, string>();
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>(?:<\/Relationship>)?/g)) {
    const id = attribute(match[1], 'Id');
    const target = attribute(match[1], 'Target');
    if (id && target) relationships.set(id, target.replace(/^\//, ''));
  }
  const sheets: WorkbookSheet[] = [];
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>(?:<\/sheet>)?/g)) {
    const name = attribute(match[1], 'name');
    const relationshipId = attribute(match[1], 'r:id');
    const target = relationshipId ? relationships.get(relationshipId) : null;
    if (!name || !target) continue;
    const path = target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`;
    sheets.push({ name, cells: parseSheetCells(await xmlFile(zip, path), sharedStrings) });
  }
  return sheets;
}

const parseSheetMonth = (name: string): { year: number; month: number } => {
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(name.trim());
  if (!match) throw new Error(`Tracking worksheet "${name}" does not use the expected Month YYYY name.`);
  const month = new Date(`${match[1]} 1, 2000`).getMonth() + 1;
  if (!Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new Error(`Tracking worksheet "${name}" has an unrecognized month.`);
  }
  return { year: Number(match[2]), month };
};

const localDateForServiceWeek = (
  year: number,
  month: number,
  week: number,
  weekday: Weekday,
): string => {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstDayOfWeek = firstDay.getUTCDay();
  // A Tracking row is a Tuesday-Thursday service block, not the nth instance
  // of each weekday. When a month begins Wednesday or Thursday, its first row
  // starts in the prior month; when it begins Friday-Monday, the first row
  // starts on the following Tuesday.
  const firstTuesdayOffset = firstDayOfWeek >= 2 && firstDayOfWeek <= 4
    ? 2 - firstDayOfWeek
    : (2 - firstDayOfWeek + 7) % 7;
  const weekdayOffset = weekday === 'tuesday' ? 0 : weekday === 'wednesday' ? 1 : 2;
  const day = 1 + firstTuesdayOffset + (week - 1) * 7 + weekdayOffset;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
};

const timeValue = (value: CellValue, source: string): string => {
  if (typeof value === 'number') {
    const minutes = Math.round(value * 24 * 60);
    if (value < 0 || value >= 1 || minutes > 1439) throw new Error(`${source} has an invalid capacity time.`);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value ?? '').trim());
  if (!match) throw new Error(`${source} has an invalid capacity time.`);
  const sourceHour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLocaleUpperCase('en-US');
  const hour = meridiem === 'PM' && sourceHour < 12
    ? sourceHour + 12
    : meridiem === 'AM' && sourceHour === 12 ? 0 : sourceHour;
  if (minute > 59 || hour > 23 || (meridiem && (sourceHour < 1 || sourceHour > 12))) {
    throw new Error(`${source} has an invalid capacity time.`);
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const countValue = (value: CellValue, source: string): string => {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error(`${source} has an invalid count.`);
  return String(numeric);
};

const csvValue = (value: string): string => /[",\r\n]/.test(value)
  ? `"${value.replace(/"/g, '""')}"`
  : value;

const rowsToCsv = (rows: readonly WthTrackingExportRow[]): string => {
  const body = rows.map((row) => [
    row.schemaVersion,
    row.serviceDate,
    row.metricKey,
    row.metricLabel,
    row.value,
    row.valueType,
    row.unit,
    row.semanticRole,
    row.sourceSheet,
    row.sourceCell,
  ].map(csvValue).join(','));
  return `${WTH_TRACKING_EXPORT_HEADERS.join(',')}\n${body.join('\n')}\n`;
};

export async function exportWthTrackingWorkbook(buffer: Buffer): Promise<{
  csv: string;
  rows: WthTrackingExportRow[];
  summary: WthTrackingExportSummary;
}> {
  const sheets = await readWorkbook(buffer);
  const rows: WthTrackingExportRow[] = [];
  let excludedFormulaMetricCellCount = 0;
  let explicitZeroCount = 0;
  const closedDates = new Set<string>();
  const invalidCells: string[] = [];

  for (const sheet of sheets) {
    const { year, month } = parseSheetMonth(sheet.name);
    const allCells = [...sheet.cells.values()];
    const headerRow = allCells.find((cell) => normalize(cell.value) === 'calendar dates')?.row;
    if (!headerRow) throw new Error(`Tracking worksheet "${sheet.name}" has no Calendar Dates header.`);
    const dayRow = headerRow - 1;
    const maxColumn = Math.max(...allCells.map((cell) => cell.column));
    const weekdays = new Map<number, Weekday>();
    let activeWeekday: Weekday | null = null;
    for (let column = 1; column <= maxColumn; column += 1) {
      const label = normalize(sheet.cells.get(`${columnLetters(column)}${dayRow}`)?.value);
      if (label === 'tuesday' || label === 'wednesday' || label === 'thursday') activeWeekday = label;
      if (activeWeekday) weekdays.set(column, activeWeekday);
    }
    const metricColumns = new Map<number, { label: string; contract: MetricContract; weekday: Weekday }>();
    for (let column = 1; column <= maxColumn; column += 1) {
      const label = String(sheet.cells.get(`${columnLetters(column)}${headerRow}`)?.value ?? '').trim().replace(/\s+/g, ' ');
      const contract = metricContractForLabel(label);
      const weekday = weekdays.get(column);
      if (contract && weekday) metricColumns.set(column, { label, contract, weekday });
    }
    for (let rowNumber = headerRow + 1; rowNumber <= headerRow + 6; rowNumber += 1) {
      const weekCell = sheet.cells.get(`A${rowNumber}`)?.value;
      const week = typeof weekCell === 'number' ? weekCell : Number(String(weekCell ?? '').trim());
      if (!Number.isSafeInteger(week) || week < 1 || week > 6) continue;
      for (const [column, metric] of metricColumns) {
        const ref = `${columnLetters(column)}${rowNumber}`;
        const cell = sheet.cells.get(ref);
        if (!cell || cell.value === null || String(cell.value).trim() === '') continue;
        // Tracking's formula-generated zeroes represent blank/future cells, not
        // entered service. Only direct metric evidence crosses this boundary.
        if (cell.hasFormula) {
          excludedFormulaMetricCellCount += 1;
          continue;
        }
        const text = normalize(cell.value);
        const serviceDate = localDateForServiceWeek(year, month, week, metric.weekday);
        if (text.includes('closed')) {
          closedDates.add(serviceDate);
          continue;
        }
        if (['n/a', 'na', 'not available', '-'].includes(text)) continue;
        let value: string;
        try {
          value = metric.contract.valueType === 'count'
            ? countValue(cell.value, `${sheet.name}!${ref}`)
            : timeValue(cell.value, `${sheet.name}!${ref}`);
        } catch {
          invalidCells.push(`${sheet.name}!${ref} (${metric.label}: ${String(cell.value)})`);
          continue;
        }
        if (value === '0') explicitZeroCount += 1;
        rows.push({
          schemaVersion: WTH_TRACKING_SCHEMA_VERSION,
          serviceDate,
          metricKey: metric.contract.metricKey,
          metricLabel: metric.label,
          value,
          valueType: metric.contract.valueType,
          unit: metric.contract.unit,
          semanticRole: metric.contract.semanticRole,
          sourceSheet: sheet.name,
          sourceCell: ref,
        });
      }
    }
  }
  rows.sort((left, right) => (
    left.serviceDate.localeCompare(right.serviceDate)
    || left.metricKey.localeCompare(right.metricKey)
    || left.sourceCell.localeCompare(right.sourceCell)
  ));
  if (invalidCells.length > 0) {
    throw new Error(
      `Tracking workbook contains ${invalidCells.length} invalid metric value${invalidCells.length === 1 ? '' : 's'}: ${invalidCells.join('; ')}. Correct the source workbook before exporting.`,
    );
  }
  const identities = new Map<string, WthTrackingExportRow>();
  for (const row of rows) {
    const identity = `${row.serviceDate}:${row.metricKey}`;
    const existing = identities.get(identity);
    if (existing) {
      throw new Error(
        `Tracking export has more than one ${row.metricLabel} value for ${row.serviceDate}: `
        + `${existing.sourceSheet}!${existing.sourceCell} and ${row.sourceSheet}!${row.sourceCell}.`,
      );
    }
    identities.set(identity, row);
  }
  if (rows.length === 0) throw new Error('Tracking workbook did not contain any recognized metric observations.');
  const metricCounts: Record<string, number> = {};
  for (const row of rows) metricCounts[row.metricKey] = (metricCounts[row.metricKey] ?? 0) + 1;
  return {
    csv: rowsToCsv(rows),
    rows,
    summary: {
      worksheetCount: sheets.length,
      observationCount: rows.length,
      excludedFormulaMetricCellCount,
      explicitZeroCount,
      closedDayMarkerCount: closedDates.size,
      rangeStart: rows[0].serviceDate,
      rangeEnd: rows[rows.length - 1].serviceDate,
      metricCounts,
    },
  };
}
