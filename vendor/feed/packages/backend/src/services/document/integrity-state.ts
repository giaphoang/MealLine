// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

export type DocumentIntegrityTransition = 'missing' | 'restored';

export interface DocumentIntegrityStateChange {
  transition: DocumentIntegrityTransition;
  metadata: Record<string, unknown>;
}

const metadataRecord = (metadata: unknown): Record<string, unknown> => (
  metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)
    ? { ...metadata as Record<string, unknown> }
    : {}
);

/**
 * Returns metadata only when the stored integrity state actually changes.
 * Routine document reads must not rewrite the same missing-file state on every
 * check, because that changes updatedAt and floods the backend log.
 */
export function documentIntegrityStateChange(
  metadata: unknown,
  fileExists: boolean,
  checkedAt = new Date().toISOString(),
): DocumentIntegrityStateChange | null {
  const currentMetadata = metadataRecord(metadata);
  const isMarkedMissing = currentMetadata.integrityIssue === true;
  const shouldBeMarkedMissing = !fileExists;

  if (isMarkedMissing === shouldBeMarkedMissing) return null;

  return {
    transition: shouldBeMarkedMissing ? 'missing' : 'restored',
    metadata: {
      ...currentMetadata,
      integrityIssue: shouldBeMarkedMissing,
      lastCheckAt: checkedAt,
    },
  };
}
