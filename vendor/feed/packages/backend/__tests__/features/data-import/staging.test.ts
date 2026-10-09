// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { appendFile, mkdtemp, readdir, rm, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { afterEach, describe, expect, test } from 'vitest';
import {
  DataImportStagingError,
  DataImportStagingService,
} from '../../../src/services/data-import';

const tempDirs: string[] = [];
const makeService = async (maxBytes?: number) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'feed-import-staging-'));
  tempDirs.push(directory);
  return { directory, service: new DataImportStagingService(directory, maxBytes) };
};

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('unified data import staging', () => {
  test('streams a recognized CSV to a private server-generated file and hashes all bytes', async () => {
    const { directory, service } = await makeService();
    const csv = [
      'Visit Date,Client ID,Household Size,Recorded At,First Name',
      '45500,L2F-1,3,45500.5,Ignored',
    ].join('\n');

    const artifact = await service.stageRecognizedCsv(Readable.from([
      csv.slice(0, 27),
      csv.slice(27),
    ]));

    expect(artifact.stagedFileKey).toMatch(/^[0-9a-f-]+\.upload$/i);
    expect(artifact.fileHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.fileSizeBytes).toBe(Buffer.byteLength(csv));
    expect(artifact.inspection).toMatchObject({
      status: 'detected',
      contract: { id: 'link2feed_visits_v1', source: 'link2feed', datasetKind: 'visits' },
      recognizedFieldCount: 4,
      ignoredFieldCount: 1,
    });

    const stagingDir = path.join(directory, 'data-import-staging');
    expect((await stat(stagingDir)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(stagingDir, artifact.stagedFileKey))).mode & 0o777).toBe(0o600);
  });

  test('re-hashes and re-detects the staged artifact before activation', async () => {
    const { directory, service } = await makeService();
    const artifact = await service.stageRecognizedCsv(Readable.from([
      'Visit Date,Client ID,Household Size,Recorded At\n45500,L2F-1,3,45500.5',
    ]));

    await expect(service.verifyCsv(
      artifact.stagedFileKey,
      artifact.fileHash,
      'link2feed_visits_v1',
    )).resolves.toMatchObject({ fileHash: artifact.fileHash });

    await appendFile(
      path.join(directory, 'data-import-staging', artifact.stagedFileKey),
      '\n45501,L2F-2,2,45501.5',
    );
    await expect(service.verifyCsv(
      artifact.stagedFileKey,
      artifact.fileHash,
      'link2feed_visits_v1',
    )).rejects.toMatchObject({ code: 'STAGED_DATA_HASH_MISMATCH' });
  });

  test('deletes unknown input and partial oversized input', async () => {
    const { directory, service } = await makeService(64);

    await expect(service.stageRecognizedCsv(Readable.from(['A,B\n1,2']))).rejects.toMatchObject({
      code: 'UNKNOWN_DATA_IMPORT_CONTRACT',
    });
    expect(await readdir(path.join(directory, 'data-import-staging'))).toEqual([]);

    await expect(service.stageCsv(Readable.from(['x'.repeat(65)]))).rejects.toBeInstanceOf(DataImportStagingError);
    expect(await readdir(path.join(directory, 'data-import-staging'))).toEqual([]);
  });

  test('does not accept path traversal as a staged-file key', async () => {
    const { service } = await makeService();
    await expect(service.inspectExistingCsv('../outside.csv')).rejects.toMatchObject({
      code: 'INVALID_STAGED_DATA_KEY',
    });
  });
});
