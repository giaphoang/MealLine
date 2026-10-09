// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash, randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { chmod, mkdir, open, unlink } from 'fs/promises';
import path from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { STORAGE_PATH } from '../../config/env';
import { inspectCsvHeader, type DataSourceInspection } from './source-contracts';

// The reviewed Link2Feed archive is 16.9 MB. A 64 MB ceiling supports that
// source with headroom for ongoing agencies while keeping disk and parser work
// explicitly bounded. Unlike the 10 MB procurement path, bytes stream to a
// private staging file instead of accumulating in process memory.
//
// MUST be matched by `client_max_body_size` on `location /api/` in
// docker/nginx.conf. nginx sits in front of this check, so a lower value there
// silently wins — and it rejects mid-upload with a 413 the dialog cannot
// render, which presents to the user as a stall rather than an error. The two
// drifted once (nginx 16m against this 64 MB) and made every import above
// 16 MiB impossible in production, including the 16,940,175-byte export this
// ceiling was sized for. Change both together or neither. See ISSUES.md #68.
export const MAX_STAGED_DATA_IMPORT_BYTES = 64 * 1024 * 1024;
export const MAX_STAGED_CSV_HEADER_BYTES = 256 * 1024;
export const DATA_IMPORT_STAGING_TTL_MS = 24 * 60 * 60 * 1000;

export interface StagedCsvArtifact {
  stagedFileKey: string;
  fileHash: string;
  fileSizeBytes: number;
  headerText: string;
  inspection: DataSourceInspection;
}

export class DataImportStagingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DataImportStagingError';
  }
}

const stagedFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.upload$/i;

const firstCsvRecordEnd = (bytes: Buffer): number | null => {
  let inQuotes = false;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === 0x22) {
      if (inQuotes && bytes[index + 1] === 0x22) {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (byte === 0x0a || byte === 0x0d)) {
      if (byte === 0x0d && bytes[index + 1] === 0x0a) return index + 2;
      return index + 1;
    }
  }
  return null;
};

export class DataImportStagingService {
  private readonly stagingDir: string;

  constructor(
    baseDir = path.resolve(process.cwd(), STORAGE_PATH),
    private readonly maxBytes = MAX_STAGED_DATA_IMPORT_BYTES,
  ) {
    this.stagingDir = path.resolve(baseDir, 'data-import-staging');
  }

  private async initialize(): Promise<void> {
    await mkdir(this.stagingDir, { recursive: true, mode: 0o700 });
    // Existing directories retain their mode when mkdir is recursive.
    await chmod(this.stagingDir, 0o700);
  }

  private pathFor(stagedFileKey: string): string {
    if (!stagedFilePattern.test(stagedFileKey)) {
      throw new DataImportStagingError(
        'Staged data key is not valid.',
        'INVALID_STAGED_DATA_KEY',
      );
    }
    const resolved = path.resolve(this.stagingDir, stagedFileKey);
    if (path.dirname(resolved) !== this.stagingDir) {
      throw new DataImportStagingError(
        'Staged data key is outside the import staging directory.',
        'INVALID_STAGED_DATA_KEY',
      );
    }
    return resolved;
  }

  async stageCsv(input: Readable): Promise<StagedCsvArtifact> {
    await this.initialize();
    const stagedFileKey = `${randomUUID()}.upload`;
    const stagedPath = this.pathFor(stagedFileKey);
    const hash = createHash('sha256');
    let fileSizeBytes = 0;
    let headerBytes = Buffer.alloc(0);
    let headerEnd: number | null = null;

    const inspector = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        fileSizeBytes += chunk.length;
        if (fileSizeBytes > this.maxBytes) {
          callback(new DataImportStagingError(
            `Data file exceeds the ${Math.floor(this.maxBytes / 1024 / 1024)} MB import limit.`,
            'DATA_IMPORT_FILE_TOO_LARGE',
          ));
          return;
        }
        hash.update(chunk);
        if (headerEnd === null) {
          const remaining = MAX_STAGED_CSV_HEADER_BYTES + 1 - headerBytes.length;
          if (remaining > 0) headerBytes = Buffer.concat([headerBytes, chunk.subarray(0, remaining)]);
          headerEnd = firstCsvRecordEnd(headerBytes);
          if (
            (headerEnd !== null && headerEnd > MAX_STAGED_CSV_HEADER_BYTES)
            || (headerEnd === null && headerBytes.length > MAX_STAGED_CSV_HEADER_BYTES)
          ) {
            callback(new DataImportStagingError(
              'CSV header exceeds the 256 KB inspection limit.',
              'DATA_IMPORT_HEADER_TOO_LARGE',
            ));
            return;
          }
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(
        input,
        inspector,
        createWriteStream(stagedPath, { flags: 'wx', mode: 0o600 }),
      );
      if (fileSizeBytes === 0) {
        throw new DataImportStagingError('Choose a non-empty CSV file.', 'EMPTY_DATA_IMPORT_FILE');
      }
      const recordBytes = headerBytes.subarray(0, headerEnd ?? headerBytes.length);
      let headerText: string;
      try {
        headerText = new TextDecoder('utf-8', { fatal: true }).decode(recordBytes);
      } catch {
        throw new DataImportStagingError(
          'FEED could not read this CSV header as UTF-8. Export the data again and retry.',
          'INVALID_DATA_HEADER_ENCODING',
        );
      }

      return {
        stagedFileKey,
        fileHash: hash.digest('hex'),
        fileSizeBytes,
        headerText,
        inspection: inspectCsvHeader(headerText),
      };
    } catch (error) {
      await unlink(stagedPath).catch(() => undefined);
      throw error;
    }
  }

  async stageRecognizedCsv(input: Readable): Promise<StagedCsvArtifact> {
    const artifact = await this.stageCsv(input);
    if (artifact.inspection.status !== 'detected') {
      await this.delete(artifact.stagedFileKey);
      throw new DataImportStagingError(
        artifact.inspection.message,
        artifact.inspection.status === 'ambiguous'
          ? 'AMBIGUOUS_DATA_IMPORT_CONTRACT'
          : 'UNKNOWN_DATA_IMPORT_CONTRACT',
      );
    }
    return artifact;
  }

  async verifyCsv(
    stagedFileKey: string,
    expectedHash: string,
    expectedContractId: string,
  ): Promise<StagedCsvArtifact> {
    const artifact = await this.inspectExistingCsv(stagedFileKey);
    if (artifact.fileHash !== expectedHash) {
      throw new DataImportStagingError(
        'The staged data changed after review. Upload the source file again.',
        'STAGED_DATA_HASH_MISMATCH',
      );
    }
    if (
      artifact.inspection.status !== 'detected'
      || artifact.inspection.contract.id !== expectedContractId
    ) {
      throw new DataImportStagingError(
        'The staged data no longer matches the detected source contract.',
        'STAGED_DATA_CONTRACT_MISMATCH',
      );
    }
    return artifact;
  }

  async inspectExistingCsv(stagedFileKey: string): Promise<StagedCsvArtifact> {
    const stagedPath = this.pathFor(stagedFileKey);
    return this.stageLikeExisting(stagedFileKey, stagedPath);
  }

  private async stageLikeExisting(
    stagedFileKey: string,
    stagedPath: string,
  ): Promise<StagedCsvArtifact> {
    const handle = await open(stagedPath, 'r');
    try {
      const stat = await handle.stat();
      if (stat.size > this.maxBytes) {
        throw new DataImportStagingError('Staged data exceeds the import limit.', 'DATA_IMPORT_FILE_TOO_LARGE');
      }
    } finally {
      await handle.close();
    }

    const hash = createHash('sha256');
    let fileSizeBytes = 0;
    let headerBytes = Buffer.alloc(0);
    let headerEnd: number | null = null;
    for await (const chunkValue of createReadStream(stagedPath)) {
      const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue);
      fileSizeBytes += chunk.length;
      hash.update(chunk);
      if (headerEnd === null) {
        const remaining = MAX_STAGED_CSV_HEADER_BYTES + 1 - headerBytes.length;
        if (remaining > 0) headerBytes = Buffer.concat([headerBytes, chunk.subarray(0, remaining)]);
        headerEnd = firstCsvRecordEnd(headerBytes);
        if (
          (headerEnd !== null && headerEnd > MAX_STAGED_CSV_HEADER_BYTES)
          || (headerEnd === null && headerBytes.length > MAX_STAGED_CSV_HEADER_BYTES)
        ) {
          throw new DataImportStagingError('CSV header exceeds the inspection limit.', 'DATA_IMPORT_HEADER_TOO_LARGE');
        }
      }
    }
    let headerText: string;
    try {
      headerText = new TextDecoder('utf-8', { fatal: true }).decode(
        headerBytes.subarray(0, headerEnd ?? headerBytes.length),
      );
    } catch {
      throw new DataImportStagingError(
        'FEED could not read this CSV header as UTF-8.',
        'INVALID_DATA_HEADER_ENCODING',
      );
    }
    return {
      stagedFileKey,
      fileHash: hash.digest('hex'),
      fileSizeBytes,
      headerText,
      inspection: inspectCsvHeader(headerText),
    };
  }

  createReadStream(stagedFileKey: string): Readable {
    return createReadStream(this.pathFor(stagedFileKey));
  }

  async delete(stagedFileKey: string | null): Promise<void> {
    if (!stagedFileKey) return;
    await unlink(this.pathFor(stagedFileKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export const dataImportStagingService = new DataImportStagingService();
