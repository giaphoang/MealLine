// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// ISSUES.md #67. Import preparation and activation run detached from their HTTP
// requests because a real Link2Feed export takes 167.8s to prepare on the
// production Pi, against a ~100s Cloudflare edge timeout. These cover the
// guarantees that detaching has to keep.

import { describe, expect, test, vi } from 'vitest';
import {
  startDataImportBackgroundTask,
  whenDataImportBackgroundTasksSettle,
} from '../../../src/services/data-import/background';
import {
  validateDataImportJobTransition,
  type DataImportJobState,
} from '../../../src/services/data-import';

const state = (status: string): DataImportJobState => ({
  status,
  processedRows: 0,
  totalRows: null,
  warningCount: 0,
  unresolvedIssueCount: 0,
});

const fallback = {
  fallbackErrorCode: 'DATA_IMPORT_PREPARATION_FAILED',
  fallbackMessage: 'FEED could not validate this data file. No data was imported.',
};

describe('detached import work', () => {
  test('returns before the task finishes, so the request never waits on it', async () => {
    let finished = false;
    let release: (() => void) | undefined;
    const task = () => new Promise<void>((resolve) => {
      release = () => { finished = true; resolve(); };
    });

    startDataImportBackgroundTask('job-1', task, fallback, {} as never);

    // The whole point: control is back here while the work is still running.
    expect(finished).toBe(false);
    release?.();
    await whenDataImportBackgroundTasksSettle();
    expect(finished).toBe(true);
  });

  test('a task that throws is contained and reported, never rethrown at the caller', async () => {
    const onError = vi.fn();
    const client = {
      dataImportJob: { findUnique: vi.fn().mockResolvedValue({ id: 'job-2', status: 'failed' }) },
    };

    startDataImportBackgroundTask(
      'job-2',
      async () => { throw new Error('parser exploded'); },
      { ...fallback, onError },
      client as never,
    );
    await whenDataImportBackgroundTasksSettle();

    expect(onError).toHaveBeenCalledOnce();
    // The task's own handler already recorded a precise failure, so the
    // backstop must not overwrite it with a generic one.
    expect(client.dataImportJob.findUnique).toHaveBeenCalled();
  });

  test('a crash that leaves the job in a background status is failed by the backstop', async () => {
    // Without this a job sits in `preparing` forever and a polling client waits
    // on progress that is never coming.
    const client = {
      dataImportJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-3',
          status: 'preparing',
          processedRows: 45_000,
          totalRows: 79_308,
          warningCount: 0,
          unresolvedIssueCount: 0,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      dataImportJobEvent: {
        findFirst: vi.fn().mockResolvedValue({ sequence: 3 }),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
    };

    startDataImportBackgroundTask(
      'job-3',
      async () => { throw new Error('process fell over'); },
      { ...fallback, onError: () => {} },
      client as never,
    );
    await whenDataImportBackgroundTasksSettle();

    expect(client.dataImportJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'failed',
        errorCode: 'DATA_IMPORT_PREPARATION_FAILED',
      }),
    }));
  });
});

describe('a task that settles nothing', () => {
  // ISSUES.md #71. Detaching preparation moved the initial status from
  // `awaiting_review` to `preparing`, but the Link2Feed branch that ends with
  // unresolved review issues still only recorded progress. Every import that
  // raised a question was stranded: the progress counter ran forever (observed
  // at 51 minutes on a finished import) and every review decision was rejected
  // as "no longer awaiting review". The branch is fixed; this is the net that
  // keeps the whole class of defect from ever looking like that again.
  test('a job left in a background status by a successful task is failed, not stranded', async () => {
    const client = {
      dataImportJob: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'job-4',
          status: 'preparing',
          processedRows: 79_308,
          totalRows: 79_308,
          warningCount: 312,
          unresolvedIssueCount: 13,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      dataImportJobEvent: {
        findFirst: vi.fn().mockResolvedValue({ sequence: 19 }),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(client)),
    };
    const onError = vi.fn();

    // Resolves cleanly, but never moves the job out of `preparing`.
    startDataImportBackgroundTask('job-4', async () => undefined, { ...fallback, onError }, client as never);
    await whenDataImportBackgroundTasksSettle();

    expect(onError).toHaveBeenCalledOnce();
    expect(client.dataImportJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'failed',
        errorCode: 'DATA_IMPORT_DID_NOT_SETTLE',
      }),
    }));
  });

  test('a task that settles the job properly is left alone', async () => {
    const client = {
      dataImportJob: {
        findUnique: vi.fn().mockResolvedValue({ id: 'job-5', status: 'awaiting_review' }),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(),
    };
    const onError = vi.fn();

    startDataImportBackgroundTask('job-5', async () => undefined, { ...fallback, onError }, client as never);
    await whenDataImportBackgroundTasksSettle();

    expect(onError).not.toHaveBeenCalled();
    expect(client.dataImportJob.update).not.toHaveBeenCalled();
  });
});

describe('preparing status', () => {
  test('a staged job moves into preparing rather than straight to review', () => {
    expect(validateDataImportJobTransition(state('inspecting'), {
      status: 'preparing',
      contractId: 'link2feed_visits_v1',
      domain: 'service',
      source: 'link2feed',
      datasetKind: 'visits',
      safeMessage: 'Source detected. Validating the data.',
    })).toMatchObject({ status: 'preparing' });
  });

  test('preparation ends in questions, readiness, or failure', () => {
    expect(validateDataImportJobTransition(state('preparing'), {
      status: 'awaiting_review',
      unresolvedIssueCount: 13,
    })).toMatchObject({ status: 'awaiting_review', unresolvedIssueCount: 13 });

    expect(validateDataImportJobTransition(state('preparing'), { status: 'ready' }))
      .toMatchObject({ status: 'ready' });

    expect(validateDataImportJobTransition(state('preparing'), {
      status: 'failed',
      errorCode: 'DATA_IMPORT_INTERRUPTED',
      errorMessage: 'FEED restarted while this import was being prepared.',
    })).toMatchObject({ status: 'failed' });
  });

  test('resolving the last review issue sends the job back into preparing', () => {
    // Materialization is six large INSERT…SELECT statements — long enough to
    // outlive the request that carried the final decision.
    expect(validateDataImportJobTransition(state('awaiting_review'), {
      status: 'preparing',
      safeMessage: 'Preparing the reviewed Link2Feed data for activation.',
    })).toMatchObject({ status: 'preparing' });
  });

  test('preparing cannot skip straight to completed', () => {
    expect(() => validateDataImportJobTransition(state('preparing'), {
      status: 'completed',
      activationOutcome: 'imported',
    })).toThrow(/cannot move from preparing to completed/);
  });
});
