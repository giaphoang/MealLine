// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, upsert } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('../../../src/db', () => ({
  default: { lottoQueueIntegrationConfig: { findUnique, upsert } },
}));
vi.mock('../../../src/services/encryption', () => ({
  encryptApiKey: vi.fn().mockResolvedValue({ encrypted: 'encrypted-token', salt: 'token-salt' }),
  decryptApiKey: vi.fn(),
}));

import { saveLottoIntegrationConfig } from '../../../src/services/service/lotto-queue';

describe('LOTTO connection updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsert.mockResolvedValue({
      baseUrl: 'https://lotto.example.org',
      cursor: 'cursor-30',
      lastSyncedAt: new Date('2026-08-23T18:00:00.000Z'),
      updatedAt: new Date('2026-08-23T18:05:00.000Z'),
    });
  });

  it('preserves cursor and last-sync state when only the token changes', async () => {
    findUnique.mockResolvedValue({
      id: 'singleton',
      baseUrl: 'https://lotto.example.org',
      cursor: 'cursor-30',
    });

    const result = await saveLottoIntegrationConfig(
      'https://lotto.example.org/',
      'replacement-token-value',
      'admin-id',
    );

    expect(result.sourceChanged).toBe(false);
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('cursor');
    expect(upsert.mock.calls[0][0].update).not.toHaveProperty('lastSyncedAt');
  });

  it('clears source-specific progress when the LOTTO URL changes', async () => {
    findUnique.mockResolvedValue({
      id: 'singleton',
      baseUrl: 'https://old-lotto.example.org',
      cursor: 'cursor-30',
    });

    const result = await saveLottoIntegrationConfig(
      'https://lotto.example.org',
      'replacement-token-value',
      'admin-id',
    );

    expect(result.sourceChanged).toBe(true);
    expect(upsert.mock.calls[0][0].update).toMatchObject({
      cursor: null,
      lastSyncedAt: null,
    });
  });
});
