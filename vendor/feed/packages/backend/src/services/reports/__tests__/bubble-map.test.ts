// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { describe, expect, test } from 'vitest';
import { bubbleMapSvg, rankedKeySvg, type MapPoint } from '../analytics-print';
import { CLIENTS_GEOGRAPHY, cardCsv } from '../analytics-cards';

const point = (label: string, latitude: number, longitude: number, value: number): MapPoint =>
  ({ label, latitude, longitude, value });

// Real Portland-area centroids, so the geometry is checked against distances a
// person can sanity-check rather than invented numbers.
const NW_PORTLAND = point('97209', 45.5326, -122.6836, 1897);
const BEAVERTON = point('97005', 45.4871, -122.8037, 300);
const GRESHAM = point('97030', 45.5065, -122.4310, 200);
const HONOLULU = point('96814', 21.2969, -157.8460, 1);

describe('bubbleMapSvg', () => {
  test('centres on the most frequent postal code, not the mean', () => {
    const svg = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM], 900, 420);
    const circles = [...svg.matchAll(/data-postal-code="[^"]*" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/g)];
    const biggest = circles.reduce((top, c) => (Number(c[3]) > Number(top[3]) ? c : top), circles[0]);

    // The busiest code sits at the centre of the frame.
    expect(Number(biggest[1])).toBeCloseTo(450, 0);
    expect(Number(biggest[2])).toBeCloseTo(210, 0);
  });

  test('a distant outlier does not zoom the local picture out', () => {
    const near = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM], 900, 420);
    const withHawaii = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM, HONOLULU], 900, 420);
    const scaleOf = (svg: string) => Number(/>(\d+) mi</.exec(svg)?.[1]);

    // Same scale bar: one household in Hawaii must not redraw the metro.
    expect(scaleOf(withHawaii)).toBe(scaleOf(near));
    // And it is accounted for rather than silently dropped.
    expect(withHawaii).toContain('outside this view');
  });

  test('bubbles scale by area, so twice the households is not four times the circle', () => {
    const svg = bubbleMapSvg([point('A', 45.52, -122.68, 400), point('B', 45.53, -122.66, 100)], 900, 420);
    // Only the bubbles: place-name dots are circles too.
    const radii = [...svg.matchAll(/data-postal-code="[^"]*"[^>]*r="([\d.]+)"/g)].map(m => Number(m[1]));
    const [big, small] = [Math.max(...radii), Math.min(...radii)];

    // Radius carries a +3 floor, so compare the scaled part: 4x the value is 2x the scaled radius.
    expect((big - 3) / (small - 3)).toBeCloseTo(2, 1);
  });

  test('says so rather than drawing an empty frame when nothing can be placed', () => {
    expect(bubbleMapSvg([])).toContain('No postal code could be placed');
  });

  test('is deterministic — the same input prints the same picture', () => {
    const once = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM]);
    const twice = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM]);
    expect(once).toBe(twice);
  });
});

describe('CLIENTS_GEOGRAPHY export contract', () => {
  const analytics = {
    geography: {
      postalCodes: [
        { postalCode: '97209', clients: 1897, latitude: 45.5326, longitude: -122.6836 },
        { postalCode: '97005', clients: 300, latitude: 45.4871, longitude: -122.8037 },
        { postalCode: '00000', clients: 5, latitude: null, longitude: null },
      ],
      noFixedAddress: 418, noFixedAddressAsked: true, clientsWithoutPostalCode: 133,
    },
  };

  test('prints a map when coordinates are present', () => {
    const data = CLIENTS_GEOGRAPHY.data(analytics);
    expect(data.map).toHaveLength(2); // the unplaceable code is not on the map
    expect(CLIENTS_GEOGRAPHY.print!(data)).toContain('<circle');
  });

  test('the CSV carries postal codes and counts, and no coordinates', () => {
    const csv = cardCsv(CLIENTS_GEOGRAPHY.data(analytics), 'raw');

    expect(csv).toContain('postal code');
    expect(csv).toContain('97209,1897');
    // The whole point: a user's export is postal codes, never latitude/longitude.
    expect(csv).not.toContain('45.5326');
    expect(csv).not.toContain('-122.6836');
    expect(csv.toLowerCase()).not.toContain('latitude');
  });

  test('falls back to the ranked list when no code can be placed', () => {
    const data = CLIENTS_GEOGRAPHY.data({
      geography: { postalCodes: [{ postalCode: '00000', clients: 5, latitude: null, longitude: null }] },
    });
    const svg = CLIENTS_GEOGRAPHY.print!(data);
    expect(svg).toContain('<rect');   // hBarSvg
    expect(svg).not.toContain('<circle');
  });
});

describe('basemap', () => {
  test('draws county outlines under the bubbles at metro zoom', () => {
    const svg = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM], 900, 420);
    expect(svg).toContain('<path');           // land is drawn
    expect(svg.indexOf('<path')).toBeLessThan(svg.indexOf('<circle')); // and underneath
  });

  test('falls back to state outlines when the frame is too wide for counties', () => {
    // Coast to coast. Nearly all 3,231 counties would intersect this frame, so
    // a path count nowhere near that is the proof it switched to states.
    // Counting paths rather than comparing to the local view on purpose: states
    // carry many rings each (islands, coastline), so the wide view has *more*
    // shapes than one metro's counties, just far coarser ones.
    const wide = bubbleMapSvg(
      [point('W', 45.5, -122.6, 100), point('E', 40.7, -74.0, 100)],
      900, 420, 1,
    );
    expect((wide.match(/<path/g) ?? []).length).toBeLessThan(1000);
    expect(wide).toContain('<circle');
  });

  test('land never escapes the frame', () => {
    const svg = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM], 900, 420);
    expect(svg).toContain('clipPath');
  });
});

describe('place names', () => {
  test('names the cities a reader would recognise', () => {
    const svg = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM], 900, 420);
    // Outlines alone were "a map aesthetic with nothing identifying in it".
    expect(svg).toContain('PORTLAND');
    expect(svg).toContain('GeoNames');   // CC-BY attribution travels with them
  });

  test('rejects labels that would collide rather than piling them up', () => {
    const svg = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM], 900, 420);
    const drawn = [...svg.matchAll(/data-place="([^"]*)"/g)].map(m => m[1]);
    // 84 US places sit in this frame; only the ones that fit are drawn.
    expect(drawn.length).toBeGreaterThan(2);
    expect(drawn.length).toBeLessThanOrEqual(8);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  test('grades by population, so the big places read first', () => {
    const svg = bubbleMapSvg([NW_PORTLAND, BEAVERTON, GRESHAM], 900, 420);
    expect(svg).toMatch(/data-place="Portland"[^>]*font-size="12"/);
  });
});

describe('ranked key', () => {
  const analytics = {
    geography: {
      postalCodes: [
        { postalCode: '97209', clients: 500, latitude: 45.5326, longitude: -122.6836 },
        { postalCode: '97005', clients: 300, latitude: 45.4871, longitude: -122.8037 },
        // No map location, but still a real place households named.
        { postalCode: '00000', clients: 200, latitude: null, longitude: null },
      ],
      noFixedAddress: 0, noFixedAddressAsked: false, clientsWithoutPostalCode: 0,
    },
  };

  test('prints the map and the key together', () => {
    const svg = CLIENTS_GEOGRAPHY.print!(CLIENTS_GEOGRAPHY.data(analytics));
    expect((svg.match(/<svg/g) ?? []).length).toBe(2);
    expect(svg).toContain('Top 10 postal codes');
  });

  test('ranks every postal code, including ones that cannot be drawn', () => {
    const svg = CLIENTS_GEOGRAPHY.print!(CLIENTS_GEOGRAPHY.data(analytics));
    // Dropping it would make the key disagree with the CSV about the top ten.
    expect(svg).toContain('00000');
  });

  test('states the denominator its shares are computed against', () => {
    const svg = CLIENTS_GEOGRAPHY.print!(CLIENTS_GEOGRAPHY.data(analytics));
    expect(svg).toContain('Share of the 1,000 households that gave a postal code');
    expect(svg).toContain('50.0%');  // 500 of 1,000
  });

  test('the key is omitted when there is nothing to rank', () => {
    expect(rankedKeySvg([], 0, 'households')).toBe('');
  });
});
