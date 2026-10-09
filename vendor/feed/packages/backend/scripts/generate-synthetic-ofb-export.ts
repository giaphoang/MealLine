// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Generates a structurally valid unified OFB export of arbitrary size, for
 * throughput benchmarking.
 *
 * Every value is fabricated. No real order, donor, or product record is copied
 * or derived — the agency's real exports live outside this repository and stay
 * there. What is modelled from them is *shape* only: rows per unit, the
 * warehouse-to-pickup ratio, and column formats.
 *
 * Density defaults to the 2025–2026 observed peak, which is the honest basis
 * for a capacity claim: 3,971 rows/year at ~11.5 rows per unit, roughly one
 * warehouse order per 5.4 pickups.
 *
 * Deterministic: a fixed seed means the same arguments always produce a
 * byte-identical file, so a benchmark comparing two Prisma versions is
 * comparing engines rather than datasets.
 *
 * Usage:
 *   # 100-year local benchmark corpus (~397k rows, ~55MB)
 *   npx ts-node scripts/generate-synthetic-ofb-export.ts \
 *     --years=100 --out=/tmp/synthetic-100y.csv
 *
 *   # sub-5MB artifact that fits the production upload cap
 *   npx ts-node scripts/generate-synthetic-ofb-export.ts \
 *     --years=8 --out=/tmp/synthetic-TEST-8y.csv
 *
 * Writes outside the repository by design. Do not commit generated output.
 */

import { createWriteStream } from 'fs';
import { UNIFIED_HEADERS } from '../src/services/procurement/unified';
import { monthNames } from '../src/services/procurement/parsing';

const arg = (name: string, fallback?: string): string => {
  const hit = process.argv.find((v) => v.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (fallback !== undefined) return fallback;
  console.error(`Missing required --${name}=`);
  process.exit(1);
};

/** Observed 2025–2026 density — the highest in the real corpus. */
const ROWS_PER_YEAR = Number(arg('rows-per-year', '3971'));
const ROWS_PER_UNIT = 11.5;
/** Warehouse orders per pickup, from 81:436 in the 2025–2026 export. */
const WAREHOUSE_SHARE = 81 / (81 + 436);

const years = Number(arg('years'));
const outPath = arg('out');
const endYear = Number(arg('end-year', '2026'));

/**
 * Deterministic PRNG (mulberry32). `Math.random()` would make two benchmark
 * runs incomparable, which defeats the purpose.
 */
let seed = Number(arg('seed', '20260729'));
const rand = (): number => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const between = (lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));

// Product codes carry meaning: the first digit fixes the acquisition class
// (see `expectedAcquisitionClass`), and `4xxxx` is the Fresh Alliance catalog
// family. Generating codes that disagree with their class would be rejected as
// a malformed export, so classes are derived rather than chosen.
const WAREHOUSE_PRODUCTS = [
  { code: '00070', klass: 'DONATED' },
  { code: '10240', klass: 'DONATED' },
  { code: '20515', klass: 'DONATED' },
  { code: '30880', klass: 'DONATED' },
  { code: '606194', klass: 'PURCH-DON' },
  { code: '712305', klass: 'PURCH-DON' },
  { code: '80600', klass: 'GOVERNMENT' },
  { code: '91450', klass: 'PURCHASED' },
] as const;

const PICKUP_PRODUCTS = [
  { code: '40000', klass: 'DONATED' },
  { code: '41000', klass: 'DONATED' },
  { code: '42000', klass: 'DONATED' },
  { code: '43000', klass: 'DONATED' },
] as const;

// Fabricated. Any resemblance to a real grocer is incidental and unintended;
// these exist to exercise the donor-identity columns, not to model anyone.
const DONORS = [
  { code: 'SYN001', name: 'Northside Synthetic Grocer' },
  { code: 'SYN002', name: 'Example Market Co-op' },
  { code: 'SYN003', name: 'Placeholder Foods West' },
  { code: 'SYN004', name: 'Testfield Provisions' },
  { code: 'SYN005', name: 'Benchmark Bakery Supply' },
] as const;

const FA_CATEGORIES = [
  'a Produce', 'b Dairy', 'c Meat', 'd Dry Goods', 'e Retail-Wholesale',
] as const;

const DESCRIPTIONS = [
  'Bread, Assorted Loaves -TOTE', 'Produce, Mixed Seasonal -CASE',
  'Dairy, Milk Gallon -CRATE', 'Canned Vegetables -CASE',
  'Rice, Long Grain -SACK', 'Cereal, Assorted -CASE',
] as const;

const pad = (n: number): string => String(n).padStart(2, '0');
/** `M/D/YY`, the exporter's warehouse/pickup date format. */
const shortDate = (d: Date): string =>
  `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`;
/** `M-Mon`; must agree with the row's month or the parser warns PERIOD_MISMATCH. */
const period = (d: Date): string => `${d.getUTCMonth() + 1}-${monthNames[d.getUTCMonth() + 1]}`;
/** `M/D/YYYY h:mm AM/PM` submission stamp. */
const submitted = (d: Date, hour24: number, minute: number): string => {
  const mer = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${h12}:${pad(minute)} ${mer}`;
};
/** `h:mm AM/PM`. Never `12:00 AM` — the exporter uses that as "unknown". */
const clock = (hour24: number, minute: number): string => {
  const mer = hour24 >= 12 ? 'PM' : 'AM';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${h12}:${pad(minute)} ${mer}`;
};
const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;
const dec = (hundredths: number): string => (hundredths / 100).toFixed(2);
/** Quote only when needed; descriptions contain commas. */
const q = (s: string): string => (s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s);

const totalRows = Math.round(years * ROWS_PER_YEAR);
const totalUnits = Math.max(1, Math.round(totalRows / ROWS_PER_UNIT));
const warehouseUnits = Math.max(1, Math.round(totalUnits * WAREHOUSE_SHARE));
const pickupUnits = Math.max(1, totalUnits - warehouseUnits);

const startYear = endYear - years;
const spanMs = Date.UTC(endYear, 6, 22) - Date.UTC(startYear, 0, 1);
const dateAt = (fraction: number): Date =>
  new Date(Date.UTC(startYear, 0, 1) + Math.floor(fraction * spanMs));

const out = createWriteStream(outPath, { encoding: 'utf8' });
const write = (line: string): void => { out.write(line + '\r\n'); };

write(UNIFIED_HEADERS.join(','));

let rowsWritten = 0;

/**
 * Base for fabricated order references. Deliberately far above the real
 * corpus, which spans 300,365–1,174,032 across the agency's exports.
 *
 * This is a data-safety guard, not cosmetics. Orders are keyed by
 * `sourceOrderReference` under the revision/supersede model, so a synthetic
 * reference colliding with a real one would create a new current revision and
 * mark the genuine record superseded. A rollback does repair that — the
 * refresh re-points `isCurrent` at the newest still-active revision — but a
 * benchmark file should never touch real records in the first place.
 *
 * 9,900,000 also makes synthetic rows greppable: every reference starts "99".
 */
let refCounter = Number(arg('ref-base', '9900000'));

// Interleaved chronologically-ish rather than grouped by channel, matching how
// the real exporter emits a mixed ledger. Each unit gets a unique reference so
// no two units collide under the revision/supersede model.
const units: { kind: 'warehouse' | 'pickup'; at: number }[] = [];
for (let i = 0; i < warehouseUnits; i++) units.push({ kind: 'warehouse', at: rand() });
for (let i = 0; i < pickupUnits; i++) units.push({ kind: 'pickup', at: rand() });
units.sort((a, b) => a.at - b.at);

for (const unit of units) {
  const when = dateAt(unit.at);
  const lines = Math.max(1, between(Math.floor(ROWS_PER_UNIT * 0.4), Math.ceil(ROWS_PER_UNIT * 1.6)));

  if (unit.kind === 'warehouse') {
    const ref = String(++refCounter);
    for (let i = 0; i < lines; i++) {
      const product = pick(WAREHOUSE_PRODUCTS);
      const qtyH = between(100, 4000);
      // Donated and government supply genuinely carries no price; only the
      // purchased families do. Keeping price consistent with class avoids
      // generating rows the parser would flag as contradictory.
      const priced = product.klass === 'PURCH-DON' || product.klass === 'PURCHASED';
      const unitCents = priced ? between(50, 900) : 0;
      // Total must equal qty x unit price or the parser records
      // PRICE_TOTAL_MISMATCH; the arithmetic is done in integer cents.
      const totalCents = Math.round((qtyH / 100) * unitCents);
      write([
        '2.0', 'warehouse_order', 'Yes', shortDate(when), period(when), ref,
        product.code, q(pick(DESCRIPTIONS)), product.klass,
        dec(qtyH), dec(between(500, 30000)),
        money(unitCents), money(totalCents), money(0), money(0),
        '', '', '', '', '', '', '', '', '', '', '',
      ].join(','));
      rowsWritten++;
    }
  } else {
    const ref = `${++refCounter}AGPCKUP`;
    const donor = pick(DONORS);
    const pickupId = String(400000 + (refCounter % 90000));
    const hour = between(7, 17);
    const minute = pick([0, 15, 30, 45] as const);
    for (let i = 0; i < lines; i++) {
      const product = pick(PICKUP_PRODUCTS);
      const qtyH = between(100, 8000);
      const weightH = between(500, 20000);
      write([
        '2.0', 'agency_pickup', rand() < 0.85 ? 'Yes' : 'No',
        shortDate(when), period(when), ref,
        product.code, q(pick(DESCRIPTIONS)), product.klass,
        dec(qtyH), dec(weightH),
        '', '', '', '',
        clock(hour, minute), pickupId, String(1800000 + rowsWritten),
        donor.code, q(donor.name), pick(FA_CATEGORIES),
        dec(qtyH), dec(weightH), '',
        submitted(when, hour + 1 > 23 ? 23 : hour + 1, minute),
        // A zero rate means "OFB recorded no valuation" and must stay
        // distinguishable from a real zero-value donation. ~29% of real
        // poundage arrives this way, so the corpus reproduces that.
        rand() < 0.29 ? '0.00' : (between(25, 350) / 100).toFixed(2),
      ].join(','));
      rowsWritten++;
    }
  }
}

out.end(() => {
  console.log(`wrote ${outPath}`);
  console.log(`  years          ${years} (${startYear}-01-01 .. ${endYear}-07-22)`);
  console.log(`  rows           ${rowsWritten}`);
  console.log(`  units          ${totalUnits} (warehouse ${warehouseUnits}, pickups ${pickupUnits})`);
  console.log(`  rows/unit       ${(rowsWritten / totalUnits).toFixed(1)}`);
});
