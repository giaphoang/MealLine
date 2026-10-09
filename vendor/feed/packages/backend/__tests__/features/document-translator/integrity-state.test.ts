// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import { documentIntegrityStateChange } from '../../../src/services/document/integrity-state';

describe('document integrity state transitions', () => {
  test('marks a newly missing file once while preserving unrelated metadata', () => {
    expect(documentIntegrityStateChange(
      { source: 'upload' },
      false,
      '2026-08-13T10:00:00.000Z',
    )).toEqual({
      transition: 'missing',
      metadata: {
        source: 'upload',
        integrityIssue: true,
        lastCheckAt: '2026-08-13T10:00:00.000Z',
      },
    });
  });

  test('does not rewrite or report an already-recorded missing state', () => {
    expect(documentIntegrityStateChange({
      integrityIssue: true,
      lastCheckAt: '2026-08-12T10:00:00.000Z',
    }, false, '2026-08-13T10:00:00.000Z')).toBeNull();
  });

  test('clears the issue only when the file becomes available again', () => {
    expect(documentIntegrityStateChange(
      { integrityIssue: true, lastCheckAt: '2026-08-12T10:00:00.000Z' },
      true,
      '2026-08-13T10:00:00.000Z',
    )).toEqual({
      transition: 'restored',
      metadata: {
        integrityIssue: false,
        lastCheckAt: '2026-08-13T10:00:00.000Z',
      },
    });
  });

  test('does nothing when an available file is already healthy', () => {
    expect(documentIntegrityStateChange(null, true)).toBeNull();
    expect(documentIntegrityStateChange({ integrityIssue: false }, true)).toBeNull();
  });
});
