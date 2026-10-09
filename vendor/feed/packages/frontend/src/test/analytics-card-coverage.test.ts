// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Every card on the Analytics lenses must be exportable.
 *
 * Nothing enforced this, and eight cards shipped that a user could see but not
 * put in a report — Recurring Availability, Operational Pressure, and six on
 * Procurement. They were not broken; they were simply never wrapped, and the
 * only way to notice was to enter selection mode and count what wiggled.
 *
 * So this reads the lens components as source and checks two things: that every
 * `<CardTitle>` sits inside a `SelectableBlock`, and that every `cardId` names a
 * card the server can actually render. Source text rather than a render,
 * because a rendered test only covers the data conditions the fixture happens
 * to produce — and half these cards only appear under a particular channel
 * filter or when legacy data exists.
 */

const LENS_FILES = [
  ['components', 'operational-reports', 'index.tsx'],
  ['components', 'analytics', 'index.tsx'],
  ['components', 'analytics', 'donor-analytics.tsx'],
  ['components', 'analytics', 'community-analytics.tsx'],
  ['components', 'analytics', 'service-analytics.tsx'],
  ['components', 'analytics', 'client-analytics.tsx'],
];

/**
 * Cards that are deliberately not exportable, and why.
 *
 * An empty state is not a card: there is nothing to put in a report, and
 * offering it would produce a page saying only that no data matched. Keep this
 * list short and justified — it is the escape hatch that makes the check above
 * honest rather than the place unregistered cards go to hide.
 */
const NOT_EXPORTABLE: { title: string; reason: string }[] = [
  {
    title: 'Grocery Partners',
    reason:
      'Empty state shown instead of the partner cards when no Agency Pickups observations match.',
  },
  {
    title: 'No client records in this range',
    reason:
      'Empty state shown instead of the Clients cards when no intake records fall in the range.',
  },
  {
    title: 'No service records in this range',
    reason:
      'Empty state shown instead of the Service cards when no intake or Service Log records fall in the range.',
  },
];

const readSource = (parts: string[]) =>
  readFileSync(join(__dirname, '..', ...parts), 'utf8');

const backendSource = () =>
  readFileSync(
    join(__dirname, '..', '..', '..', 'backend', 'src', 'services', 'reports', 'analytics-cards.ts'),
    'utf8'
  );

/** Card ids the server will render — the registry array, not every declaration. */
const registeredIds = (): string[] => {
  const source = backendSource();
  const array = /export const ANALYTICS_CARDS: AnalyticsCard\[\] = \[([\s\S]*?)\n\];/.exec(source);
  if (!array) throw new Error('ANALYTICS_CARDS array not found — has it been renamed?');
  const names = [...array[1].matchAll(/^\s*([A-Z_][A-Z0-9_]*),/gm)].map(m => m[1]);
  return names.map(name => {
    // Two declaration shapes. Most cards are written out in full; the four
    // Clients breakdowns share a factory, because ethnicity, gender identity
    // and housing type differ only in which answers they hold and four
    // near-copies would drift apart. Both forms put the id first.
    const literal = new RegExp(
      `export const ${name}: AnalyticsCard = \\{\\s*\\n\\s*id: '([^']+)'`
    ).exec(source);
    if (literal) return literal[1];

    const factory = new RegExp(
      `export const ${name} = \\w+\\(\\s*\\n?\\s*'([^']+)'`
    ).exec(source);
    if (factory) return factory[1];

    throw new Error(`No id found for registered card ${name}.`);
  });
};

/**
 * Walks a component's source and reports each `<CardTitle>` with whether a
 * `SelectableBlock` was open at that point.
 *
 * A scan rather than a parse: these files nest cards inside conditionals and
 * fragments, and the only question being asked is which titles fall between an
 * opening and closing tag.
 */
const cardTitles = (source: string): { title: string; cardId: string | null }[] => {
  const token = /<SelectableBlock|<\/SelectableBlock>|cardId="([^"]+)"|<CardTitle>([^<]*)</g;
  const open: string[] = [];
  const found: { title: string; cardId: string | null }[] = [];

  for (const match of source.matchAll(token)) {
    if (match[0] === '<SelectableBlock') open.push('');
    else if (match[0] === '</SelectableBlock>') open.pop();
    else if (match[1] !== undefined && open.length > 0) open[open.length - 1] = match[1];
    else if (match[2] !== undefined) {
      const title = match[2].trim();
      // `<CardTitle>{title}</CardTitle>` is a shared card *component* taking
      // its heading as a prop, not a card with a literal name. Its callers
      // pass a literal `cardId`, which the registry check below still sees, so
      // skipping it here loses no coverage.
      if (/^\{\w+\}$/.test(title)) continue;
      found.push({ title, cardId: open[open.length - 1] ?? null });
    }
  }
  return found;
};

describe('Analytics card export coverage', () => {
  const exempt = new Set(NOT_EXPORTABLE.map(entry => entry.title));

  for (const parts of LENS_FILES) {
    it(`${parts[parts.length - 2]}/${parts[parts.length - 1]}: every card is selectable`, () => {
      const unwrapped = cardTitles(readSource(parts))
        .filter(card => card.cardId === null && !exempt.has(card.title))
        .map(card => card.title);

      expect(
        unwrapped,
        'These cards render on an Analytics lens but are not wrapped in a ' +
          'SelectableBlock, so a user can see them and cannot export them. ' +
          'Wrap each one and register a matching card in the backend registry ' +
          '(analytics-cards.ts), or add it to NOT_EXPORTABLE with a reason.'
      ).toEqual([]);
    });
  }

  it('every selectable card names a card the server can render', () => {
    const registered = new Set(registeredIds());
    const orphans = LENS_FILES.flatMap(parts =>
      cardTitles(readSource(parts))
        .filter(card => card.cardId !== null && !registered.has(card.cardId))
        .map(card => `${card.title} (${card.cardId})`)
    );

    expect(
      orphans,
      'These cards can be selected but have no entry in ANALYTICS_CARDS. ' +
        'Selecting one produces a report that silently omits it.'
    ).toEqual([]);
  });

  it('every registered card still has a home on screen', () => {
    // The converse check, and the one that guards the guard: if a lens file is
    // renamed out of LENS_FILES, or a card is deleted from the page but left in
    // the registry, its id stops appearing in any source here and this fails.
    //
    // Matched against raw `cardId` occurrences rather than the CardTitle scan
    // above, because the four table cards head themselves with `DetailHeader`
    // instead of `<CardTitle>` and would otherwise look absent.
    const wrapped = new Set(
      LENS_FILES.flatMap(parts => [
        ...readSource(parts).matchAll(/cardId="([^"]+)"/g),
      ].map(match => match[1]))
    );

    const homeless = registeredIds().filter(id => !wrapped.has(id));

    expect(
      homeless,
      'These cards are in ANALYTICS_CARDS but nothing on an Analytics lens ' +
        'selects them. Either the card was removed from the page and should ' +
        'leave the registry, or a lens file is missing from LENS_FILES.'
    ).toEqual([]);
  });
});
