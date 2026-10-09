// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// Link2Feed's NATIVE visit export — as opposed to the pre-serialized form the
// original fixtures were built from — writes ISO dates and terminates every
// data row with a delimiter its header row lacks. Neither shape had test
// coverage, and the adapter could not parse a real export because of it.
// ISSUES.md #70.

import { Readable } from 'stream';
import { describe, expect, test } from 'vitest';
import {
  detectLink2FeedTrailingFillerColumns,
  parseLink2FeedVisitCsv,
  type Link2FeedVisitReviewIssueDraft,
  type Link2FeedVisitStagingDraft,
} from '../../../src/services/service';

const headers = [
  'Visit Date',
  'Client ID',
  'Client First Visit- Personal Tab',
  'Client First Visit-Date',
  'Client Date of Birth',
  'Client Estimated Date of Birth',
  'Client Gender Identity-Labels',
  'Client Gender Identity-Parent Types',
  'Client Ethnicity-Labels',
  'Household Size',
  'Recorded At',
  'Notes',
];

const excelSerial = (date: string): string => String(
  (Date.parse(`${date}T00:00:00.000Z`) - Date.UTC(1899, 11, 30)) / 86_400_000,
);

/** A row in Link2Feed's native ISO encoding. */
const isoRow = (over: Partial<Record<string, string>> = {}): string[] => ([
  over['Visit Date'] ?? '2025-01-10',
  over['Client ID'] ?? 'L2F-100',
  '2025-01-10',
  over['Client First Visit-Date'] ?? '2025-01-10',
  over['Client Date of Birth'] ?? '1980-06-15',
  '0',
  'Female',
  'Female',
  'Hispanic',
  over['Household Size'] ?? '2',
  over['Recorded At'] ?? '2025-01-10 12:00:00',
  'note text',
]);

/** The same visit in the pre-serialized encoding the old fixtures used. */
const serialRow = (): string[] => ([
  excelSerial('2025-01-10'),
  'L2F-100',
  excelSerial('2025-01-10'),
  excelSerial('2025-01-10'),
  excelSerial('1980-06-15'),
  '0',
  'Female',
  'Female',
  'Hispanic',
  '2',
  `${excelSerial('2025-01-10')}.5`,
  'note text',
]);

const build = (rows: string[][], { trailingComma = false } = {}): string => [
  headers.join(','),
  ...rows.map((row) => row.join(',') + (trailingComma ? ',' : '')),
].join('\n');

const parseFixture = async (text: string, trailingFillerColumns = 0) => {
  const rows: Link2FeedVisitStagingDraft[] = [];
  const issues: Link2FeedVisitReviewIssueDraft[] = [];
  const summary = await parseLink2FeedVisitCsv(Readable.from([text]), {
    maxPeoplePerHouseholdWithoutReview: 20,
    batchSize: 50,
    trailingFillerColumns,
    onRows: async (batch) => { rows.push(...batch); },
    onIssues: async (batch) => { issues.push(...batch); },
  });
  return { rows, issues, summary };
};

describe('Link2Feed native ISO date encoding', () => {
  test('parses ISO dates and ISO datetimes from a native export', async () => {
    const result = await parseFixture(build([isoRow()]));

    expect(result.summary.rowCount).toBe(1);
    expect(result.rows[0]).toMatchObject({
      sourceClientId: 'L2F-100',
      serviceDate: '2025-01-10',
      birthYear: 1980,
    });
  });

  test('ISO and pre-serialized encodings of one visit are the same record', async () => {
    const iso = await parseFixture(build([isoRow({ 'Recorded At': '2025-01-10 12:00:00' })]));
    const serial = await parseFixture(build([serialRow()]));

    // Noon is exactly 0.5 of a day, so both encodings describe one instant.
    // The record key is a hash of the canonical serials, so this equality is
    // what keeps a re-export in the other encoding from duplicating history.
    expect(iso.rows[0].sourceRecordKey).toBe(serial.rows[0].sourceRecordKey);
    expect(iso.rows[0].recordedAtSerial).toBe(serial.rows[0].recordedAtSerial);
    expect(iso.rows[0].serviceDate).toBe(serial.rows[0].serviceDate);
  });

  test('preserves ordering across a date boundary so profile selection stays correct', async () => {
    const result = await parseFixture(build([
      isoRow({ 'Visit Date': '2025-01-10', 'Recorded At': '2025-01-10 23:59:59' }),
      isoRow({ 'Visit Date': '2025-01-11', 'Recorded At': '2025-01-11 00:00:01' }),
    ]));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[1].recordedAtSerial).toBeGreaterThan(result.rows[0].recordedAtSerial);
  });

  test('rejects a spreadsheet-reformatted M/D/YY date instead of guessing its century', async () => {
    // A round-trip through a spreadsheet rewrites 2025-01-10 as 1/10/25, which
    // could equally mean 1925. Importing that silently would misdate history,
    // so the adapter refuses and says why.
    await expect(parseFixture(build([isoRow({ 'Visit Date': '1/10/25' })])))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_LINK2FEED_DATE_FORMAT' });
  });

  test('rejects a four-digit slash date too, since field order is still unstated', async () => {
    await expect(parseFixture(build([isoRow({ 'Visit Date': '1/10/2025' })])))
      .rejects.toMatchObject({ code: 'AMBIGUOUS_LINK2FEED_DATE_FORMAT' });
  });

  test('rejects a calendar date that does not exist', async () => {
    await expect(parseFixture(build([isoRow({ 'Visit Date': '2025-02-30' })])))
      .rejects.toMatchObject({ code: 'INVALID_LINK2FEED_DATE' });
  });

  test('rejects an out-of-range clock time', async () => {
    await expect(parseFixture(build([isoRow({ 'Recorded At': '2025-01-10 25:00:00' })])))
      .rejects.toMatchObject({ code: 'INVALID_LINK2FEED_DATE' });
  });
});

describe('Link2Feed trailing filler column', () => {
  test('detects the exporter trailing delimiter', async () => {
    const text = build([isoRow()], { trailingComma: true });
    await expect(detectLink2FeedTrailingFillerColumns(Readable.from([text]))).resolves.toBe(1);
  });

  test('detects none when header and data widths already agree', async () => {
    const text = build([isoRow()]);
    await expect(detectLink2FeedTrailingFillerColumns(Readable.from([text]))).resolves.toBe(0);
  });

  test('parses a native export whose rows carry the trailing delimiter', async () => {
    const text = build([isoRow(), isoRow({ 'Client ID': 'L2F-200' })], { trailingComma: true });
    const filler = await detectLink2FeedTrailingFillerColumns(Readable.from([text]));
    const result = await parseFixture(text, filler);

    expect(result.summary.rowCount).toBe(2);
    expect(result.rows.map((row) => row.sourceClientId)).toEqual(['L2F-100', 'L2F-200']);
  });

  test('the filler changes nothing about the parsed result', async () => {
    const withComma = build([isoRow()], { trailingComma: true });
    const without = build([isoRow()]);
    const a = await parseFixture(withComma, 1);
    const b = await parseFixture(without, 0);

    expect(a.rows[0].sourceRecordKey).toBe(b.rows[0].sourceRecordKey);
    expect(a.rows[0]).toEqual(b.rows[0]);
  });

  test('refuses a surplus field that actually carries data', async () => {
    // The whole reason relax_column_count_more was rejected: a populated
    // surplus means the row is misaligned, and silently dropping it would file
    // client values under the wrong headers.
    const text = [
      headers.join(','),
      isoRow().join(',') + ',UNEXPECTED-VALUE',
    ].join('\n');

    await expect(detectLink2FeedTrailingFillerColumns(Readable.from([text])))
      .rejects.toMatchObject({ code: 'LINK2FEED_ROW_WIDTH_MISMATCH' });
  });

  test('still fails a row that is short, even when filler is declared', async () => {
    const text = [
      headers.join(','),
      isoRow().join(',') + ',',
      isoRow().slice(0, 8).join(','),
    ].join('\n');

    await expect(parseFixture(text, 1))
      .rejects.toMatchObject({ code: 'MALFORMED_LINK2FEED_VISIT_CSV' });
  });

  test('rejects an implausible number of unnamed columns', async () => {
    const text = [
      headers.join(','),
      isoRow().join(',') + ',,,,,,',
    ].join('\n');

    await expect(detectLink2FeedTrailingFillerColumns(Readable.from([text])))
      .rejects.toMatchObject({ code: 'LINK2FEED_ROW_WIDTH_MISMATCH' });
  });
});
