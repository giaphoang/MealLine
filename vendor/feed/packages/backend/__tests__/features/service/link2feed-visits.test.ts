// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Readable } from 'stream';
import { describe, expect, test } from 'vitest';
import {
  parseLink2FeedVisitCsv,
  type Link2FeedVisitReviewIssueDraft,
  type Link2FeedVisitStagingDraft,
} from '../../../src/services/service';

const excelSerial = (date: string): string => String(
  (Date.parse(`${date}T00:00:00.000Z`) - Date.UTC(1899, 11, 30)) / 86_400_000,
);

const csvCell = (value: string): string => (
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
);

const csv = (headers: string[], rows: string[][]): string => [
  headers.map(csvCell).join(','),
  ...rows.map((row) => row.map(csvCell).join(',')),
].join('\n');

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
  'First Name',
];

const parseFixture = async (text: string) => {
  const rows: Link2FeedVisitStagingDraft[] = [];
  const issues: Link2FeedVisitReviewIssueDraft[] = [];
  const summary = await parseLink2FeedVisitCsv(Readable.from([text]), {
    maxPeoplePerHouseholdWithoutReview: 20,
    batchSize: 2,
    onRows: async (batch) => { rows.push(...batch); },
    onIssues: async (batch) => { issues.push(...batch); },
  });
  return { rows, issues, summary };
};

describe('Link2Feed visit adapter', () => {
  test('projects only approved fields and never retains Notes, full DOB, or extra PII', async () => {
    const firstDate = excelSerial('2025-01-10');
    const result = await parseFixture(csv(headers, [
      [
        firstDate,
        'L2F-100',
        firstDate,
        firstDate,
        excelSerial('1980-06-15'),
        '0',
        'Female',
        'Female',
        'declined_to_answer',
        '2',
        `${firstDate}.5`,
        'SECRET-NOTE-SENTINEL',
        'PII-NAME-SENTINEL',
      ],
    ]));

    expect(result.summary).toMatchObject({
      rowCount: 1,
      identifiedEncounterCount: 1,
      identityUnavailableEncounterCount: 0,
      reportedPeopleCount: 2,
      clientVisitStatus: { first: 1, returning: 0, unknown: 0 },
    });
    expect(result.rows[0]).toMatchObject({
      sourceClientId: 'L2F-100',
      serviceDate: '2025-01-10',
      sourceProfileKey: expect.stringMatching(/^l2f_client:[a-f0-9]{64}$/),
      birthYear: 1980,
      birthYearEstimated: false,
      birthYearResponseStatus: 'provided',
    });
    expect(result.rows[0].profileResponses).toEqual(expect.arrayContaining([
      { dimension: 'gender_identity', responseStatus: 'provided', values: ['Female'] },
      { dimension: 'gender_identity_parent_type', responseStatus: 'provided', values: ['Female'] },
      { dimension: 'ethnicity', responseStatus: 'not_provided', values: [] },
    ]));
    expect(JSON.stringify(result.rows)).not.toContain('SECRET-NOTE-SENTINEL');
    expect(JSON.stringify(result.rows)).not.toContain('PII-NAME-SENTINEL');
    expect(JSON.stringify(result.rows)).not.toContain(excelSerial('1980-06-15'));
  });

  test('keeps anonymous coverage and surfaces a large count without reclassifying it', async () => {
    const visitDate = excelSerial('2025-11-24');
    const result = await parseFixture(csv(headers, [
      [visitDate, '', 'Unknown', 'Unknown', '', '0', '', '', '', '264', `${Number(visitDate) + 1}.67403`, '', ''],
    ]));

    expect(result.rows[0]).toMatchObject({
      sourceClientId: null,
      recordKind: 'identity_unavailable_encounter',
      reportedHouseholdCount: 1,
      reportedPeopleCount: 264,
      profileSnapshotHash: null,
      profileResponses: [],
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'UNUSUALLY_LARGE_REPORTED_PEOPLE_COUNT',
        severity: 'warning',
        safeDetails: expect.objectContaining({ observedCount: 264 }),
      }),
    ]);
  });

  test('drops non-answer tokens from mixed multi-select responses', async () => {
    const firstDate = excelSerial('2024-01-01');
    const visitDate = excelSerial('2025-01-01');
    const result = await parseFixture(csv(headers, [[
      visitDate,
      'L2F-200',
      firstDate,
      firstDate,
      excelSerial('1990-01-01'),
      '1',
      'Non-binary,Prefer Not to Answer',
      'None of These',
      'White,do_not_know',
      '1',
      `${visitDate}.25`,
      '',
      '',
    ]]));

    expect(result.rows[0].clientVisitStatus).toBe('returning');
    expect(result.rows[0].profileResponses).toEqual(expect.arrayContaining([
      { dimension: 'gender_identity', responseStatus: 'provided', values: ['Non-binary'] },
      { dimension: 'ethnicity', responseStatus: 'provided', values: ['White'] },
    ]));
  });

  test('uses one stable client-profile identity and cannot manufacture a parent-type response', async () => {
    const firstDate = excelSerial('2024-01-01');
    const laterDate = excelSerial('2025-01-01');
    const result = await parseFixture(csv(headers, [
      [
        firstDate, 'L2F-250', firstDate, firstDate, excelSerial('1990-01-01'), '0',
        'did_not_ask', 'None of These', '', '1', `${firstDate}.1`, '', '',
      ],
      [
        laterDate, 'L2F-250', firstDate, firstDate, excelSerial('1990-01-01'), '0',
        'Female', 'Woman', '', '1', `${laterDate}.1`, '', '',
      ],
    ]));

    expect(result.rows[0].sourceProfileKey).toBe(result.rows[1].sourceProfileKey);
    expect(result.rows[0].profileResponses).toEqual(expect.arrayContaining([
      { dimension: 'gender_identity', responseStatus: 'not_provided', values: [] },
      { dimension: 'gender_identity_parent_type', responseStatus: 'not_provided', values: [] },
    ]));
    expect(result.summary.latestClientDemographicCoverage.gender_identity).toEqual({
      provided: 1,
      notProvided: 0,
    });
  });

  test('makes a duplicate source identity blocking instead of silently relying on row order', async () => {
    const visitDate = excelSerial('2025-01-01');
    const row = [
      visitDate, 'L2F-300', visitDate, visitDate, excelSerial('1985-01-01'), '0',
      'Male', 'Male', 'White', '1', `${visitDate}.5`, '', '',
    ];
    const result = await parseFixture(csv(headers, [row, row]));

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].sourceRecordKey).not.toBe(result.rows[1].sourceRecordKey);
    expect(result.summary.blockingIssueCount).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_LINK2FEED_VISIT_IDENTITY', severity: 'blocking' }),
    ]));
  });
});
