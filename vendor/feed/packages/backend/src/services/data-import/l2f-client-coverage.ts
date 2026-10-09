// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * Does a set of per-year Link2Feed client exports cover more clients than the
 * single all-time export did?
 *
 * The all-time file was reviewed in August 2026 and not activated: it held
 * 6,460 rows against the 9,596 Link2Feed clients FEED stores, and 3,344 of
 * those clients carry ids below the file's lowest, so they could not appear in
 * it at all. That looked like a recency bias in how the export was produced
 * rather than a limit of the data, which is the hypothesis this measures — if
 * each calendar year's export carries the clients active that year, the union
 * should reach back past the all-time file's floor.
 *
 * The arithmetic lives here, apart from the file reading, so it can be tested
 * against fixtures. Real exports are never committed: they carry PII even after
 * sanitizing, and they live outside the repository.
 *
 * See `source-contracts.ts` (`link2feed_clients_v1`) for the column contract
 * and the full record of the all-time review.
 */

export interface ClientCoverageInput {
  /** Every Link2Feed client id FEED currently stores. */
  storedClientIds: string[];
  /** One entry per export file, in the order they should be reported. */
  files: Array<{ label: string; clientIds: string[] }>;
}

export interface ClientCoverageReport {
  storedCount: number;
  /** Per file, and then the union of all of them. */
  files: Array<{
    label: string;
    rows: number;
    /** Rows whose client id FEED already stores. */
    matched: number;
    /** Rows FEED has never seen — a client the visits import missed entirely. */
    unmatched: number;
  }>;
  combined: {
    /** Distinct client ids across every file. */
    rows: number;
    matched: number;
    unmatched: number;
    /** Share of stored clients the union reaches, 0-100, rounded. */
    coveragePercent: number;
  };
  /**
   * Stored clients no file mentions. The all-time export left 5,272 of these;
   * if the per-year files are worth importing, this number falls sharply.
   */
  missing: {
    count: number;
    /**
     * How many of them sit below the lowest id any file carries. That was the
     * whole of the all-time file's shortfall, and distinguishes "the exports
     * start too late" from "these clients are genuinely absent".
     */
    belowLowestExportedId: number;
  };
  /**
   * Whether the union beats the all-time baseline it is being compared with.
   * Null when no baseline was supplied.
   */
  improvesOnBaseline: boolean | null;
}

/** Numeric where the ids are numeric, so "below the floor" means what it says. */
const asNumber = (clientId: string): number | null => {
  const trimmed = clientId.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

export function measureClientCoverage(
  input: ClientCoverageInput,
  baselineMatched: number | null = null,
): ClientCoverageReport {
  const stored = new Set(input.storedClientIds.map((id) => id.trim()).filter(Boolean));

  const seen = new Set<string>();
  const files = input.files.map((file) => {
    const ids = new Set(file.clientIds.map((id) => id.trim()).filter(Boolean));
    let matched = 0;
    for (const id of ids) {
      if (stored.has(id)) matched += 1;
      seen.add(id);
    }
    return { label: file.label, rows: ids.size, matched, unmatched: ids.size - matched };
  });

  let combinedMatched = 0;
  for (const id of seen) if (stored.has(id)) combinedMatched += 1;

  // The floor is only meaningful for numeric ids; a file of non-numeric ids
  // reports zero below it rather than inventing an ordering.
  const exportedNumbers = [...seen].map(asNumber).filter((n): n is number => n !== null);
  const lowestExported = exportedNumbers.length > 0 ? Math.min(...exportedNumbers) : null;

  let missingCount = 0;
  let belowFloor = 0;
  for (const id of stored) {
    if (seen.has(id)) continue;
    missingCount += 1;
    const numeric = asNumber(id);
    if (lowestExported !== null && numeric !== null && numeric < lowestExported) belowFloor += 1;
  }

  return {
    storedCount: stored.size,
    files,
    combined: {
      rows: seen.size,
      matched: combinedMatched,
      unmatched: seen.size - combinedMatched,
      coveragePercent: stored.size === 0
        ? 0
        : Math.round((combinedMatched / stored.size) * 100),
    },
    missing: { count: missingCount, belowLowestExportedId: belowFloor },
    improvesOnBaseline: baselineMatched === null ? null : combinedMatched > baselineMatched,
  };
}
