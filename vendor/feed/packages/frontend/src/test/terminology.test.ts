// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, it } from 'vitest';
import {
  createTerminologyPhraseBook,
  DEFAULT_TERMINOLOGY,
  formatTerminology,
} from '@/contexts/TerminologyContext';

const CUSTOM = {
  pantrySingular: 'community market',
  pantryPlural: 'community markets',
  clientSingular: 'neighbor',
  clientPlural: 'neighbors',
  departmentName: 'Community Care',
  active: true,
};

describe('organization terminology', () => {
  it('formats complete placeholders for explicit singular and plural terms', () => {
    expect(formatTerminology('{Pantry}: one {client}; many {clients}', CUSTOM))
      .toBe('Community market: one neighbor; many neighbors');
    expect(createTerminologyPhraseBook(CUSTOM).pantryServiceDays)
      .toBe('community market service days');
  });

  it('soft-deactivates custom terms without deleting them', () => {
    expect(formatTerminology('Daily {pantry} work', { ...CUSTOM, active: false }))
      .toBe('Daily food pantry work');
    expect(DEFAULT_TERMINOLOGY.clientPlural).toBe('clients');
  });

  it('does not expose protected analytic counting nouns as placeholders', () => {
    expect(formatTerminology('{household} · {visit} · {personServed}', CUSTOM))
      .toBe('{household} · {visit} · {personServed}');
  });
});
