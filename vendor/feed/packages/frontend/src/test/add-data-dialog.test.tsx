// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AddDataDialog } from '@/components/data-management/add-data/add-data-dialog';
import { SIMC_SERVICE_VISIT_ALLOWED_HEADERS } from '@/components/data-management/add-data/source-contracts';

const link2FeedFixture = readFileSync(
  resolve(process.cwd(), 'src/test/fixtures/add-data/link2feed-visits-with-extra-columns.csv'),
  'utf8',
);

const reviewJob = {
  id: 'clz1234567890123456789012',
  contractId: 'link2feed_visits_v1',
  domain: 'service',
  source: 'link2feed',
  datasetKind: 'visits',
  status: 'ready',
  fileSizeBytes: 716,
  recognizedFieldCount: 23,
  ignoredFieldCount: 4,
  totalRows: 1,
  processedRows: 1,
  warningCount: 0,
  unresolvedIssueCount: 0,
  activationOutcome: null,
  errorCode: null,
  errorMessage: null,
  reviewIssues: [],
  reviewSummary: {
    adapterVersion: 1,
    rowCount: 1,
    rangeStart: '2025-01-10',
    rangeEnd: '2025-01-10',
    identifiedEncounterCount: 1,
    identityUnavailableEncounterCount: 0,
    uniqueIdentifiedClientCount: 1,
    reportedPeopleCount: 2,
    clientVisitStatus: { first: 1, returning: 0, unknown: 0 },
    qualityIssueCount: 0,
    blockingIssueCount: 0,
    warningCount: 0,
    autoResolvedIssueCount: 0,
    unresolvedIssueCount: 0,
    reconciliation: {
      encounters: { new: 1, revised: 0, unchanged: 0 },
      profiles: { new: 1, revised: 0, unchanged: 0, unavailable: 0 },
    },
  },
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Routes fetch by URL and method rather than by call order.
 *
 * Preparation and activation now run detached from their requests, so the
 * dialog also asks whether an import is already in progress when it opens and
 * polls while one is running. Ordered `mockResolvedValueOnce` chains cannot
 * express that — an extra poll would shift every later response by one.
 *
 * `activate` returns only the accepted job; the completed job (with its
 * activation counts) arrives on the next poll, exactly as the server behaves.
 */
const mockImportApi = (options: {
  uploadJob: Record<string, unknown>;
  activatedJob?: Record<string, unknown>;
  activeJob?: Record<string, unknown> | null;
}) => {
  const calls: Array<{ url: string; method: string }> = [];
  let current = options.uploadJob;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push({ url, method });

    if (url.includes('/jobs/active')) {
      return jsonResponse({ job: options.activeJob ?? null });
    }
    if (url.endsWith('/jobs') && method === 'POST') {
      return jsonResponse({ job: current }, 202);
    }
    if (url.includes('/activate') && method === 'POST') {
      current = options.activatedJob ?? current;
      return jsonResponse({ job: current }, 202);
    }
    if (method === 'GET') return jsonResponse({ job: current });
    return jsonResponse({});
  });
  return { spy, calls };
};

const importPosts = (calls: Array<{ url: string; method: string }>) =>
  calls.filter((call) => call.method === 'POST' && call.url.endsWith('/jobs'));

const simcFixture = [
  [...SIMC_SERVICE_VISIT_ALLOWED_HEADERS, 'Neighbor First Name'].join(','),
  [...SIMC_SERVICE_VISIT_ALLOWED_HEADERS.map(() => ''), 'Private'].join(','),
].join('\n');

const trackingFixture = readFileSync(
  resolve(process.cwd(), 'src/test/fixtures/add-data/wth-service-tracking.csv'),
  'utf8',
);

const ofbFixture = readFileSync(
  resolve(process.cwd(), 'src/test/fixtures/add-data/ofb-unified.csv'),
  'utf8',
);

const legacyFixture = [
  'calendar_year,month_num,month,source_canonical,disposition,in_ofb,weight_pounds,source_as_written,fiscal_year,source_file,caveat',
  '2023,1,January,Community donations,received,false,125,Community donations,FY2023,ledger.csv,',
].join('\n');

describe('Add Data workflow', () => {
  test('routes a unified OFB export through the established procurement importer', async () => {
    // The dialog asks whether an import is already running as soon as it
    // opens; the procurement path itself is unchanged.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ job: null }))
      .mockResolvedValueOnce(jsonResponse({
      result: {
        outcome: 'imported',
        rowCount: 1,
        rangeStart: '2026-08-04',
        rangeEnd: '2026-08-04',
        warehouse: {
          outcome: 'imported',
          importId: 21,
          rowCount: 1,
          orderCount: 1,
          skippedOrderCount: 0,
          warningCount: 0,
          rangeStart: '2026-08-04',
          rangeEnd: '2026-08-04',
          warnings: [],
        },
        freshAlliance: null,
      },
    }, 201));
    const onImported = vi.fn();

    render(<AddDataDialog open onOpenChange={() => {}} onImported={onImported} />);
    expect(screen.getByRole('link', { name: 'Download the exporter' }))
      .toHaveAttribute('href', '/downloads/OFB-Order-CSV-Exporter-v2.0.0.zip');
    fireEvent.change(screen.getByLabelText('Choose data file'), {
      target: { files: [new File([ofbFixture], 'ofb-unified.csv', { type: 'text/csv' })] },
    });

    expect(await screen.findByText('OFB unified order export')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));

    expect(await screen.findByText('OFB data imported')).toBeVisible();
    expect(screen.getByText(/1 row · 1 warehouse order · 0 pickups/)).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/procurement/imports'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
    expect(onImported).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  test('routes the WTH historical ledger through its existing sidecar importer', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ job: null }))
      .mockResolvedValueOnce(jsonResponse({
      result: {
        outcome: 'imported',
        importId: 22,
        rowCount: 1,
        monthCount: 1,
        skippedMonthCount: 0,
        totalWeightHundredths: 12500,
        rangeStart: '2023-01-01',
        rangeEnd: '2023-01-01',
        sourceCount: 1,
      },
    }, 201));

    render(<AddDataDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Choose data file'), {
      target: { files: [new File([legacyFixture], 'historical-donations.csv', { type: 'text/csv' })] },
    });

    expect(await screen.findByText('WTH historical community-donation ledger')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));

    expect(await screen.findByText('Historical donations imported')).toBeVisible();
    expect(screen.getByText(/1 month · 125 lb/)).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/procurement/imports/legacy'),
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
    fetchSpy.mockRestore();
  });

  test('keeps Service imports administrator-only without hiding Add Data from staff', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<AddDataDialog open onOpenChange={() => {}} isAdministrator={false} />);

    fireEvent.change(screen.getByLabelText('Choose data file'), {
      target: {
        files: [new File([link2FeedFixture], 'link2feed-visits.csv', { type: 'text/csv' })],
      },
    });
    expect(await screen.findByText('Link2Feed visit export')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText(/Administrator access is required to import Service data/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Validate and Review' })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('allows staff to import canonical LOTTO queue history directly', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
      if (url.includes('/jobs/active')) return jsonResponse({ job: null });
      if (url.includes('/lotto/history-import')) return jsonResponse({
        result: {
          outcome: 'imported', importId: 31, received: 2, inserted: 2,
          unchanged: 0, review: 1,
        },
      });
      return jsonResponse({});
    });
    const onImported = vi.fn();
    const lottoFixture = 'FEED Schema Version,Summary JSON\n1,"{}"';

    render(<AddDataDialog open onOpenChange={() => {}} onImported={onImported} isAdministrator={false} />);
    fireEvent.change(screen.getByLabelText('Choose data file'), {
      target: { files: [new File([lottoFixture], 'lotto-history.csv', { type: 'text/csv' })] },
    });

    expect(await screen.findByText('LOTTO queue history')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('button', { name: 'Import Data' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));

    expect(await screen.findByText('LOTTO history imported')).toBeVisible();
    expect(screen.getByText(/2 sessions synchronized; 1 await staff review/)).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/service/lotto/history-import'),
      expect.objectContaining({ method: 'POST', body: expect.any(File) }),
    );
    expect(onImported).toHaveBeenCalledOnce();
    fetchSpy.mockRestore();
  });

  test('detects locally, reviews the Link2Feed plan, and activates through the unified endpoint', async () => {
    const { spy: fetchSpy, calls } = mockImportApi({
      uploadJob: reviewJob,
      activatedJob: {
        ...reviewJob,
        status: 'completed',
        activationOutcome: 'imported',
        activationSummary: {
          importId: 12,
          encounterRevisionCount: 1,
          profileRevisionCount: 1,
          qualityIssueCount: 0,
        },
      },
    });
    render(<AddDataDialog open onOpenChange={() => {}} />);

    const input = screen.getByLabelText('Choose data file');
    fireEvent.change(input, {
      target: {
        files: [new File([link2FeedFixture], 'link2feed-visits.csv', { type: 'text/csv' })],
      },
    });

    expect(await screen.findByText('Link2Feed visit export')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('4 unrecognized columns will be ignored.')).toBeVisible();
    expect(screen.queryByText(/What FEED will do/)).toBeNull();

    // Source detection is local: opening the dialog only asks whether an import
    // is already in progress, and never uploads to detect.
    expect(importPosts(calls)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Validate and Review' }));
    expect(await screen.findByText('Ready to activate')).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/data-import/jobs'),
      expect.objectContaining({ method: 'POST', body: expect.any(File) }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activate Data' }));
    expect(await screen.findByText('Link2Feed data activated')).toBeVisible();
    expect(screen.getByText(/1 encounter revision and 1 client profile/)).toBeVisible();
    expect(importPosts(calls)).toHaveLength(1);
    fetchSpy.mockRestore();
  });

  // ISSUES.md #67. A 25 MB Link2Feed export takes 167.8s to prepare on the
  // production Pi against a ~100s Cloudflare edge timeout, so preparation runs
  // detached from its request and the dialog polls. Before this, the server knew
  // "45,000 of 79,308" the whole time and had no way to say so.
  test('shows real progress while the server prepares, then the finished review', async () => {
    const preparing = {
      ...reviewJob,
      status: 'preparing',
      totalRows: null,
      processedRows: 0,
      unresolvedIssueCount: 0,
      reviewSummary: null,
    };
    let current: Record<string, unknown> = preparing;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/jobs/active')) return jsonResponse({ job: null });
      if (url.endsWith('/jobs') && method === 'POST') return jsonResponse({ job: current }, 202);
      return jsonResponse({ job: current });
    });

    render(<AddDataDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Choose data file'), {
      target: { files: [new File([link2FeedFixture], 'link2feed-visits.csv', { type: 'text/csv' })] },
    });
    expect(await screen.findByText('Link2Feed visit export')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validate and Review' }));

    // Before any row count exists, elapsed time is the honest signal.
    expect(await screen.findByText(/Reading the data file/)).toBeVisible();
    expect(screen.getByText(/continues on the server/)).toBeVisible();

    // Counted progress, reported by the server rather than invented here.
    current = { ...preparing, processedRows: 45000, totalRows: 79308 };
    expect(await screen.findByText(/Validated 45,000 of 79,308 records/, undefined, { timeout: 4000 }))
      .toBeVisible();

    current = reviewJob;
    expect(await screen.findByText('Ready to activate', undefined, { timeout: 4000 })).toBeVisible();
    fetchSpy.mockRestore();
  });

  test('offers a way back into an import whose browser tab went away', async () => {
    // The 524 case: the Pi kept working, the browser did not. Without this the
    // staged work and its questions are unreachable until the job expires.
    const stranded = {
      ...reviewJob,
      status: 'awaiting_review',
      processedRows: 79308,
      totalRows: 79308,
      unresolvedIssueCount: 13,
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/jobs/active')) return jsonResponse({ job: stranded });
      return jsonResponse({ job: stranded });
    });

    render(<AddDataDialog open onOpenChange={() => {}} />);

    expect(await screen.findByText('An import is already in progress')).toBeVisible();
    expect(screen.getByText(/finished reading 79,308 records and needs 13 decisions/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen that import' }));

    // The stranded job's review is now on screen, and the offer is spent.
    expect(await screen.findByText('Service dates')).toBeVisible();
    expect(screen.queryByText('An import is already in progress')).toBeNull();
    fetchSpy.mockRestore();
  });

  test('reviews SIMC in household, visit, and people language', async () => {
    const simcJob = {
      ...reviewJob,
      id: 'clz1234567890123456789013',
      contractId: 'simc_service_visits_v1',
      source: 'simc',
      recognizedFieldCount: SIMC_SERVICE_VISIT_ALLOWED_HEADERS.length,
      ignoredFieldCount: 1,
      totalRows: 2,
      processedRows: 2,
      warningCount: 1,
      reviewSummary: {
        adapterVersion: 1,
        rawRowCount: 2,
        visitCount: 1,
        rangeStart: '2026-06-02',
        rangeEnd: '2026-06-02',
        serviceDateCount: 1,
        eventCount: 1,
        identifiedHouseholdCount: 1,
        identifiedPersonCount: 1,
        reportedPeopleCount: 2,
        memberRowCount: 1,
        memberCoveragePercent: 50,
        visitsWithMemberCountMismatch: 1,
        netMissingMemberRows: 1,
        householdDatePairsWithMultipleVisits: 0,
        demographicCoverage: {},
        qualityIssueCount: 1,
        warningCount: 1,
        unresolvedIssueCount: 0,
        reconciliation: {
          encounters: { new: 1, revised: 0, unchanged: 0 },
          householdProfiles: { new: 1, revised: 0, unchanged: 0, unavailable: 0 },
          personProfiles: { new: 1, revised: 0, unchanged: 0 },
        },
      },
    };
    const { spy: fetchSpy } = mockImportApi({
      uploadJob: simcJob,
      activatedJob: {
        ...simcJob,
        status: 'completed',
        activationOutcome: 'imported',
        activationSummary: {
          importId: 13,
          encounterRevisionCount: 1,
          profileRevisionCount: 1,
          personProfileRevisionCount: 1,
          encounterPersonCount: 1,
          qualityIssueCount: 1,
        },
      },
    });

    render(<AddDataDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Choose data file'), {
      target: { files: [new File([simcFixture], 'simc-service.csv', { type: 'text/csv' })] },
    });
    expect(await screen.findByText('SIMC service visit export')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validate and Review' }));

    expect(await screen.findByText('Household-member coverage')).toBeVisible();
    expect(screen.getByText(/1 household · 1 identified person · 2 people represented/)).toBeVisible();
    expect(screen.getByText(/formal people totals remain unchanged/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Activate Data' }));
    expect(await screen.findByText('SIMC data activated')).toBeVisible();
    expect(screen.getByText(/1 visit revision, 1 household profile, and 1 person profile/)).toBeVisible();
    fetchSpy.mockRestore();
  });

  test('reviews WTH Tracking as operational detail without replacing formal totals', async () => {
    const trackingJob = {
      ...reviewJob,
      id: 'clz1234567890123456789014',
      contractId: 'wth_service_tracking_v1',
      source: 'wth_tracking',
      datasetKind: 'operational_metrics',
      recognizedFieldCount: 10,
      ignoredFieldCount: 0,
      reviewSummary: {
        adapterVersion: 2,
        rowCount: 1,
        serviceDateCount: 1,
        rangeStart: '2026-08-04',
        rangeEnd: '2026-08-04',
        metricCounts: { shopping_visits: 1 },
        explicitZeroCount: 0,
        regularHouseholdCount: 70,
        emergencyBagCount: 0,
        operationalHouseholdCount: 70,
        turnedAwayHouseholdCount: 0,
        campingGearRequestCount: 0,
        capacityReachedDayCount: 0,
        qualityIssueCount: 0,
        warningCount: 0,
        unresolvedIssueCount: 0,
        reconciliation: { observations: { new: 1, revised: 0, unchanged: 0 } },
        formalReconciliation: {
          overlapDateCount: 1,
          incompleteRegularMethodDateCount: 0,
          exactRegularMatchDateCount: 0,
          formalHouseholdCount: 72,
          regularOperationalHouseholdCount: 70,
          allOperationalHouseholdCount: 70,
          regularDifference: -2,
          allOperationalDifference: -2,
          meanAbsoluteDailyRegularDifference: 2,
        },
      },
    };
    const { spy: fetchSpy } = mockImportApi({
      uploadJob: trackingJob,
      activatedJob: {
        ...trackingJob,
        status: 'completed',
        activationOutcome: 'imported',
        activationSummary: {
          importId: 14,
          encounterRevisionCount: 0,
          profileRevisionCount: 0,
          metricObservationRevisionCount: 1,
          qualityIssueCount: 0,
        },
      },
    });

    render(<AddDataDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText('Choose data file'), {
      target: { files: [new File([trackingFixture], 'wth-tracking.csv', { type: 'text/csv' })] },
    });
    expect(await screen.findByText('WTH service-tracking export')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validate and Review' }));

    expect(await screen.findByText('Metric observations')).toBeVisible();
    expect(screen.getByText(/70 regular-method households/)).toBeVisible();
    expect(screen.getByText(/remain operational detail/)).toBeVisible();
    expect(screen.getByText(/Regular methods are 2 lower overall/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Activate Data' }));
    expect(await screen.findByText('WTH Tracking data activated')).toBeVisible();
    expect(screen.getByText(/1 historical metric observation revision/)).toBeVisible();
    fetchSpy.mockRestore();
  });
});
