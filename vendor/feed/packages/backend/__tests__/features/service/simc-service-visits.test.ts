// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { Readable } from 'stream';
import { describe, expect, test } from 'vitest';
import {
  parseSimcServiceVisitCsv,
  type SimcEncounterPersonStagingDraft,
  type SimcPersonStagingDraft,
  type SimcReviewIssueDraft,
  type SimcVisitStagingDraft,
} from '../../../src/services/service';

const headers = [
  'Household ID', 'Anonymous', 'Household City', 'Household County',
  'Household FIPS', 'Household ST', 'Household Zip', 'No Fixed Address',
  'Household Living Situation', 'Household Size', 'Additional Notes',
  'Head of Household', 'Number of Adults', 'Number of Children',
  'Number of Seniors', 'Number of Unknown Age HH Members',
  'Preferred Language(s)', 'SNAP Participation', 'Proxy', 'Neighbor ID',
  'Neighbor Date of Birth', 'Neighbor Age', 'Neighbor Gender Identity',
  'Neighbor Race or Ethnicity', 'Event ID', 'Visit ID', 'Visit Date',
  'Visit Recorded On', 'Primary Service(s)', 'First Name',
];

const cell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
const csv = (rows: string[][]) => [headers, ...rows].map((row) => row.map(cell).join(',')).join('\n');

const row = (overrides: Record<string, string> = {}) => headers.map((header) => ({
  'Household ID': 'HH-1', Anonymous: 'No', 'Household City': 'Portland',
  'Household County': 'MULTNOMAH', 'Household FIPS': '41051',
  'Household ST': 'OR', 'Household Zip': '97205', 'No Fixed Address': 'No',
  'Household Living Situation': "Don't Know / Prefer not to answer",
  'Household Size': '2', 'Additional Notes': 'SECRET-NOTE-SENTINEL',
  'Head of Household': 'No', 'Number of Adults': '2', 'Number of Children': '0',
  'Number of Seniors': '0', 'Number of Unknown Age HH Members': '0',
  'Preferred Language(s)': 'Spanish (Language Translation Needed)',
  'SNAP Participation': "Don't Know / Prefer not to answer", Proxy: 'No',
  'Neighbor ID': 'PERSON-2', 'Neighbor Date of Birth': '1/2/1990',
  'Neighbor Age': '36', 'Neighbor Gender Identity': "Don't Know / Prefer not to answer",
  'Neighbor Race or Ethnicity': 'Asian', 'Event ID': 'EVENT-1',
  'Visit ID': 'VISIT-1', 'Visit Date': '6/2/26 11:07',
  'Visit Recorded On': '6/2/26 11:08', 'Primary Service(s)': 'Food Pantry - TEFAP',
  'First Name': 'PII-NAME-SENTINEL',
  ...overrides,
})[header] ?? '');

const parseFixture = async (text: string) => {
  const visits: SimcVisitStagingDraft[] = [];
  const people: SimcPersonStagingDraft[] = [];
  const memberships: SimcEncounterPersonStagingDraft[] = [];
  const issues: SimcReviewIssueDraft[] = [];
  const summary = await parseSimcServiceVisitCsv(Readable.from([text]), {
    onVisits: async (batch) => { visits.push(...batch); },
    onPeople: async (batch) => { people.push(...batch); },
    onMemberships: async (batch) => { memberships.push(...batch); },
    onIssues: async (batch) => { issues.push(...batch); },
  });
  return { visits, people, memberships, issues, summary };
};

describe('SIMC service visit adapter', () => {
  test('groups member rows into one visit and never retains Notes, DOB, or extra PII', async () => {
    const result = await parseFixture(csv([
      row({ 'Neighbor ID': 'PERSON-1', 'Head of Household': 'Yes', 'Neighbor Date of Birth': '4/5/1980', 'Neighbor Age': '46', 'Neighbor Gender Identity': 'Female' }),
      row(),
    ]));

    expect(result.summary).toMatchObject({
      rawRowCount: 2,
      visitCount: 1,
      identifiedHouseholdCount: 1,
      identifiedPersonCount: 2,
      reportedPeopleCount: 2,
      memberCoveragePercent: 100,
      visitsWithMemberCountMismatch: 0,
    });
    expect(result.visits).toHaveLength(1);
    expect(result.memberships).toHaveLength(2);
    expect(result.people).toHaveLength(2);
    expect(result.people.find((person) => person.sourcePersonId === 'PERSON-1')).toMatchObject({
      birthYear: 1980,
      birthYearResponseStatus: 'provided',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('SECRET-NOTE-SENTINEL');
    expect(serialized).not.toContain('PII-NAME-SENTINEL');
    expect(serialized).not.toContain('4/5/1980');
  });

  test('uses household size for people and reports incomplete member coverage without blocking', async () => {
    const result = await parseFixture(csv([
      row({ 'Neighbor ID': 'PERSON-1', 'Head of Household': 'Yes' }),
    ]));

    expect(result.summary).toMatchObject({
      visitCount: 1,
      reportedPeopleCount: 2,
      memberRowCount: 1,
      memberCoveragePercent: 50,
      visitsWithMemberCountMismatch: 1,
      netMissingMemberRows: 1,
      warningCount: 1,
    });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'SIMC_MEMBER_COUNT_MISMATCH', requiresDecision: false }),
    ]));
  });

  test('normalizes nonparticipation and separates language translation need', async () => {
    const result = await parseFixture(csv([
      row({ 'Neighbor ID': 'PERSON-1', 'Head of Household': 'Yes' }),
      row(),
    ]));
    const household = result.visits[0].profileResponses;
    expect(household).toEqual(expect.arrayContaining([
      { dimension: 'housing_stability', responseStatus: 'not_provided', values: [] },
      { dimension: 'snap_participation', responseStatus: 'not_provided', values: [] },
      { dimension: 'household_languages', responseStatus: 'provided', values: ['Spanish'] },
      { dimension: 'translation_needed', responseStatus: 'provided', values: ['Yes'] },
    ]));
    expect(result.people.find((person) => person.sourcePersonId === 'PERSON-2')?.profileResponses)
      .toEqual(expect.arrayContaining([
        { dimension: 'gender_identity', responseStatus: 'not_provided', values: [] },
        { dimension: 'race_or_ethnicity', responseStatus: 'provided', values: ['Asian'] },
      ]));
  });
});

describe('answer labels that contain a comma of their own', () => {
  /**
   * SIMC joins multiple answers with a comma and has four category names that
   * contain one. A naive split shredded them: "Hispanic, Latino, or Spanish"
   * became "Hispanic", "Latino" and "or Spanish", three separate answers, and
   * a race breakdown built on that reported "or Spanish" as a race.
   *
   * The delimiter cannot be changed, because "Asian, Chinese" really is two
   * answers. These pin both halves of that distinction.
   */
  const raceOf = async (raw: string) => {
    const result = await parseFixture(csv([
      row({ 'Head of Household': 'Yes', 'Neighbor Race or Ethnicity': raw }),
    ]));
    const response = result.people[0].profileResponses
      .find((r) => r.dimension === 'race_or_ethnicity');
    return response?.values ?? [];
  };

  test('keeps a comma-bearing label whole', async () => {
    expect(await raceOf('Hispanic, Latino, or Spanish')).toEqual(['Hispanic, Latino, or Spanish']);
  });

  test('still splits a genuine list of two answers', async () => {
    expect(await raceOf('Asian, Chinese')).toEqual(['Asian', 'Chinese']);
  });

  test('handles a comma-bearing label beside another answer', async () => {
    expect(await raceOf('Hispanic, Latino, or Spanish, White'))
      .toEqual(['Hispanic, Latino, or Spanish', 'White']);
    expect(await raceOf('American Indian or Alaska Native, Hispanic, Latino, or Spanish'))
      .toEqual(['American Indian or Alaska Native', 'Hispanic, Latino, or Spanish']);
  });

  test('protects the living-situation sentence, which also carries a comma', async () => {
    const sentence = 'I have a place to live today, but I am worried about losing it in the future';
    const result = await parseFixture(csv([
      row({ 'Head of Household': 'Yes', 'Household Living Situation': sentence }),
    ]));
    const response = result.visits[0].profileResponses
      .find((r) => r.dimension === 'housing_stability');
    expect(response?.values).toEqual([sentence]);
  });
  /**
   * ISSUES.md #76. One row of a 3,799-visit production export aborted the whole
   * import: a household of one whose single member had the Head of Household
   * box left unticked. Three shapes, three answers.
   */
  describe('Head of Household', () => {
    test('a one-member visit is its own head, ticked or not', async () => {
      const result = await parseFixture(csv([
        row({
          'Neighbor ID': 'PERSON-1', 'Head of Household': 'No',
          'Household Size': '1', 'Number of Adults': '1',
        }),
      ]));

      expect(result.visits).toHaveLength(1);
      expect(result.memberships).toEqual([
        expect.objectContaining({ sourcePersonId: 'PERSON-1', isHeadOfHousehold: true }),
      ]);
    });

    test('several members and no head is still refused', async () => {
      await expect(parseFixture(csv([
        row({ 'Neighbor ID': 'PERSON-1', 'Head of Household': 'No' }),
        row({ 'Neighbor ID': 'PERSON-2', 'Head of Household': 'No' }),
      ]))).rejects.toThrow(/2 household members and no Head of Household/);
    });

    test('more than one head is still refused', async () => {
      await expect(parseFixture(csv([
        row({ 'Neighbor ID': 'PERSON-1', 'Head of Household': 'Yes' }),
        row({ 'Neighbor ID': 'PERSON-2', 'Head of Household': 'Yes' }),
      ]))).rejects.toThrow(/identifies 2 Heads of Household/);
    });
  });
});
