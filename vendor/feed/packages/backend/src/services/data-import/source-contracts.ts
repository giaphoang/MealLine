// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import {
  FRESH_ALLIANCE_HEADERS,
  LEGACY_LEDGER_HEADERS,
  OFB_HEADERS,
  UNIFIED_HEADERS,
} from '../procurement/contracts';

export type DataImportDomain = 'procurement' | 'service';
export const LOTTO_QUEUE_HISTORY_HEADERS = ['FEED Schema Version', 'Summary JSON'] as const;
export type DataSourceReadiness =
  | 'operational'
  | 'prototype'
  /** No sample of this export has been seen yet. */
  | 'pending_sample'
  /** A sample was reviewed and activation was decided against; `nextStep` says why. */
  | 'sample_reviewed';

interface DataSourceContract {
  id: string;
  source: string;
  datasetKind: string;
  label: string;
  sourceLabel: string;
  datasetLabel: string;
  domain: DataImportDomain;
  readiness: DataSourceReadiness;
  exactHeaders?: readonly string[];
  requiredHeaders?: readonly string[];
  requiredAnyOf?: readonly (readonly string[])[];
  forbiddenHeaders?: readonly string[];
  allowedHeaders: readonly string[];
  transformations: readonly string[];
  nextStep: string;
  priority: number;
}

export interface DetectedDataSourceInspection {
  status: 'detected';
  contract: Pick<
    DataSourceContract,
    'id' | 'source' | 'datasetKind' | 'label' | 'sourceLabel' | 'datasetLabel' | 'domain' | 'readiness' | 'transformations' | 'nextStep'
  >;
  headerCount: number;
  recognizedFieldCount: number;
  ignoredFieldCount: number;
}

export type DataSourceInspection =
  | DetectedDataSourceInspection
  | { status: 'unknown'; message: string }
  | { status: 'ambiguous'; message: string };

export const LINK2FEED_VISIT_ALLOWED_HEADERS = [
  'Visit Date',
  'Client ID',
  'Client First Visit- Personal Tab',
  'Client First Visit-Date',
  'Client Date of Birth',
  'Client Estimated Date of Birth',
  'Client Gender Identity-Labels',
  'Client Gender Identity-Parent Types',
  'Client Ethnicity-Labels',
  'Client Disability',
  'Client Self-Identifies As',
  'City',
  'County',
  'State',
  'Zip Code',
  'Housing Type',
  'Household Size',
  'Household Languages',
  'Household Primary Income Source',
  'Dietary Considerations',
  'Social Assistance',
  'Recorded At',
  'Notes',
] as const;

export const LINK2FEED_CLIENT_ALLOWED_HEADERS = [
  'Client ID',
  'Client First Visit- Personal Tab',
  'Client First Visit-Date',
  'Client Date of Birth',
  'Client Estimated Date of Birth',
  'Client Gender Identity-Labels',
  'Client Gender Identity-Parent Types',
  'Client Ethnicity-Labels',
  'Client Disability',
  'Client Self-Identifies As',
  'City',
  'County',
  'State',
  'Zip Code',
  'Housing Type',
  'Household Size',
  'Household Languages',
  'Household Primary Income Source',
  'Dietary Considerations',
  'Social Assistance',
] as const;

export const SIMC_SERVICE_VISIT_ALLOWED_HEADERS = [
  'Household ID', 'Anonymous', 'Household City', 'Household County',
  'Household FIPS', 'Household ST', 'Household Zip', 'No Fixed Address',
  'Household Dietary Factors or Concerns', 'Household Disability Status',
  'Household Employment', 'Household Food Insecurity(run out of food/ does not last)',
  'Household Living Situation', 'Household Military Status', 'Household Size',
  'Additional Assistance', 'Additional Notes', 'Head of Household',
  'Number of Adults', 'Number of Children', 'Number of Seniors',
  'Number of Unknown Age HH Members', 'Preferred Language(s)',
  'SNAP Participation', 'Proxy', 'Neighbor ID', 'Neighbor Date of Birth',
  'Neighbor Age', 'Neighbor Gender Identity', 'Neighbor Race or Ethnicity',
  'Event ID', 'Visit ID', 'Visit Date', 'Visit Recorded On',
  'Primary Service(s)', 'Agency ID', 'Other Government Program(s)',
] as const;

export const WTH_SERVICE_TRACKING_HEADERS = [
  'FEED Schema Version',
  'Service Date',
  'Metric Key',
  'Metric Label',
  'Value',
  'Value Type',
  'Unit',
  'Semantic Role',
  'Source Sheet',
  'Source Cell',
] as const;

const CONTRACTS: readonly DataSourceContract[] = [
  {
    id: 'lotto_queue_history_v1',
    source: 'lotto',
    datasetKind: 'queue_sessions',
    label: 'LOTTO queue history',
    sourceLabel: 'LOTTO',
    datasetLabel: 'Historical queue-session timing',
    domain: 'service',
    readiness: 'operational',
    exactHeaders: LOTTO_QUEUE_HISTORY_HEADERS,
    allowedHeaders: LOTTO_QUEUE_HISTORY_HEADERS,
    transformations: [
      'Import privacy-minimized session closeouts without physical ticket numbers.',
      'Synchronize every session and withhold anomalous sessions from Analytics pending staff review.',
    ],
    nextStep: 'Import the reconstructed history, then review any sessions FEED withholds from Analytics.',
    priority: 110,
  },
  {
    id: 'ofb_unified_v2',
    source: 'ofb',
    datasetKind: 'unified_orders',
    label: 'OFB unified order export',
    sourceLabel: 'Oregon Food Bank',
    datasetLabel: 'Completed orders and agency pickups',
    domain: 'procurement',
    readiness: 'operational',
    exactHeaders: UNIFIED_HEADERS,
    allowedHeaders: UNIFIED_HEADERS,
    transformations: ['Use the existing OFB validation, revision, warning, and reconciliation pipeline.'],
    nextStep: 'Continue through the established OFB import review.',
    priority: 100,
  },
  {
    id: 'ofb_agency_pickups_v1',
    source: 'ofb',
    datasetKind: 'agency_pickups',
    label: 'OFB agency pickup export',
    sourceLabel: 'Oregon Food Bank',
    datasetLabel: 'Fresh Food Alliance agency pickups',
    domain: 'procurement',
    readiness: 'prototype',
    exactHeaders: FRESH_ALLIANCE_HEADERS,
    allowedHeaders: FRESH_ALLIANCE_HEADERS,
    transformations: ['Recognize the retired single-channel schema without importing it.'],
    nextStep: 'Export the supported unified OFB file and try again.',
    priority: 90,
  },
  {
    id: 'ofb_completed_orders_v1',
    source: 'ofb',
    datasetKind: 'completed_orders',
    label: 'OFB completed-order export',
    sourceLabel: 'Oregon Food Bank',
    datasetLabel: 'Completed warehouse orders',
    domain: 'procurement',
    readiness: 'prototype',
    exactHeaders: OFB_HEADERS,
    allowedHeaders: OFB_HEADERS,
    transformations: ['Recognize the retired single-channel schema without importing it.'],
    nextStep: 'Export the supported unified OFB file and try again.',
    priority: 80,
  },
  {
    id: 'wth_legacy_procurement_v1',
    source: 'wth',
    datasetKind: 'legacy_procurement',
    label: 'WTH historical community-donation ledger',
    sourceLabel: 'William Temple House',
    datasetLabel: 'Historical monthly community donations',
    domain: 'procurement',
    readiness: 'operational',
    exactHeaders: LEGACY_LEDGER_HEADERS,
    allowedHeaders: LEGACY_LEDGER_HEADERS,
    transformations: ['Preserve monthly grain, canonical source identity, disposition, and caveats.'],
    nextStep: 'Continue through the historical-ledger review.',
    priority: 70,
  },
  {
    id: 'wth_service_tracking_v1',
    source: 'wth',
    datasetKind: 'operational_metrics',
    label: 'WTH service-tracking export',
    sourceLabel: 'William Temple House',
    datasetLabel: 'Historical daily service-method observations',
    domain: 'service',
    readiness: 'operational',
    exactHeaders: WTH_SERVICE_TRACKING_HEADERS,
    allowedHeaders: WTH_SERVICE_TRACKING_HEADERS,
    transformations: [
      'Import direct metric observations and ignore spreadsheet Total formulas.',
      'Preserve blank versus explicit zero and source-cell provenance.',
    ],
    nextStep: 'Review historical observations, source provenance, and comparison with formal household totals.',
    priority: 60,
  },
  {
    id: 'link2feed_visits_v1',
    source: 'link2feed',
    datasetKind: 'visits',
    label: 'Link2Feed visit export',
    sourceLabel: 'Link2Feed',
    datasetLabel: 'Service visits and visit-linked demographics',
    domain: 'service',
    readiness: 'operational',
    requiredHeaders: ['Visit Date', 'Client ID', 'Household Size', 'Recorded At'],
    allowedHeaders: LINK2FEED_VISIT_ALLOWED_HEADERS,
    transformations: [
      'Project only the reviewed allowlist and ignore every other column without retaining its values.',
      'Keep Client ID only inside the Link2Feed source namespace.',
      'Derive birth year and estimated status, then discard full birth dates.',
      'Normalize demographic participation to provided or not provided.',
      'Discard Notes; service-method detail comes from Tracking or FEED-native Service Logs.',
    ],
    nextStep: 'Review coverage, demographic participation, identity gaps, and source resolutions.',
    priority: 50,
  },
  {
    id: 'link2feed_clients_v1',
    source: 'link2feed',
    datasetKind: 'clients',
    label: 'Link2Feed client export',
    sourceLabel: 'Link2Feed',
    datasetLabel: 'Client profiles and demographics',
    domain: 'service',
    readiness: 'sample_reviewed',
    requiredHeaders: ['Client ID'],
    requiredAnyOf: [
      ['Client Date of Birth', 'Client Estimated Date of Birth'],
      ['Client Gender Identity-Labels', 'Client Ethnicity-Labels'],
    ],
    forbiddenHeaders: ['Visit Date', 'Recorded At'],
    allowedHeaders: LINK2FEED_CLIENT_ALLOWED_HEADERS,
    transformations: [
      'Enrich Link2Feed-scoped profiles independently of visit import order.',
      'Ignore every column outside the provisional client allowlist.',
    ],
    /**
     * **Superseded 2026-08-18 — read this first.** The file reviewed on the
     * 17th was labelled "ALL-TIME" and was not: a real 2017-01-01..2026-05-31
     * export holds 16,728 rows and matches **every one** of the 9,596 Link2Feed
     * clients FEED stores, against 4,324 for the file below. The recency bias,
     * the id floor, and the "covers less, not more" verdict were all artefacts
     * of that one export, not properties of this dataset.
     *
     * 7,132 of its rows are clients FEED has no visit for. Note what this is
     * *not*: the export's 2017-01-01 start is simply the earliest date
     * Link2Feed offers, and William Temple House did not adopt Link2Feed until
     * October 2020 — FEED's visits begin 2020-10-19, so both records start at
     * adoption and the file does not reach further back. Registration without a
     * recorded visit is the likelier reading, but it is unconfirmed; establish
     * which before quoting the figure or treating it as an import gap.
     *
     * So the two fields that are genuinely unique to this path —
     * `Client Ethnicity-Parent Types` (the rollup that makes an ethnicity card
     * legible; the labels alone run to 86 combinations) and `Household ID` —
     * are now available at full coverage rather than 45%. The case for
     * activating this path is materially stronger than the note below concluded.
     * Re-measure with `scripts/measure-l2f-client-coverage.ts` before acting,
     * and confirm the export's span against FEED's visit span.
     *
     * ---
     *
     * Reviewed 2026-08-17 against a sanitized "all-time" client export, and not
     * activated. Retained because its column-level findings still hold; its
     * coverage findings do not.
     *
     * **The visits import already collected this.** Every demographic dimension
     * in the client export is stored for all 9,596 Link2Feed clients — gender
     * identity and its parent types, ethnicity, disability, self-identifies-as,
     * city/county/state/postal code, housing type, languages, primary income
     * source, dietary considerations, social assistance — plus every birth year.
     *
     * **The export covers less, not more.** 6,460 rows against 9,596 clients
     * FEED holds; 4,324 in both. 3,344 of our clients carry ids below the file's
     * lowest (5,466,020) and cannot appear in it at all, and above that floor
     * coverage climbs 64% → 88% from oldest ids to newest. The clients it omits
     * have *better* demographic coverage in FEED (55–95% per dimension) than the
     * ones it includes (26–66%), because a long-standing client has more visits
     * and each visit was another chance to record a profile.
     *
     * **Most of its extra columns are empty.** The 23 per-income-source flags
     * are `0` on every one of the 6,460 rows. Monthly Household Income carries a
     * real figure on 15 rows. Names, emails, phones and street are PII this
     * importer would drop anyway, which is why they are absent from the
     * allowlist above.
     *
     * **Two fields are genuinely only here.** `Client Ethnicity-Parent Types` —
     * the rollup that would make an ethnicity card legible, since the labels
     * alone run to 86 combinations, and it is absent from the visits export.
     * And `Household ID`, which groups clients into 5,328 households. Household
     * ID confirms rather than corrects: only 47 of 4,277 households have more
     * than one visiting client id, and 5 household-days out of 26,827 visits
     * were served under two, so Link2Feed records visits against the head of
     * household and the existing household counts are sound.
     *
     * Link2Feed is proprietary and the visits export cannot be extended, so the
     * ethnicity rollup is obtainable only through this path. Revisit if a
     * legible ethnicity breakdown becomes worth a second import path — and
     * expect the recency bias above to need stating on any card drawn from it.
     *
     * The real vocabulary is 51 columns against the 20 provisionally listed
     * here; `Client First Visit- Personal Tab` and `Client First Visit-Date` are
     * absent from the sample. Dates arrive as Excel serials when the file has
     * been opened in Excel, as with the visits export.
     */
    nextStep:
      'Not activated, but the case has strengthened: a full 2017-2026 export '
      + 'matches all 9,596 stored Link2Feed clients, so Client Ethnicity-Parent '
      + 'Types and Household ID are available at full coverage rather than 45%. '
      + 'The earlier "covers less, not more" finding came from a mislabelled '
      + 'sample. See the note above before reopening.',
    priority: 40,
  },
  {
    id: 'simc_service_visits_v1',
    source: 'simc',
    datasetKind: 'visits',
    label: 'SIMC service visit export',
    sourceLabel: 'Service Insights Meal Connect',
    datasetLabel: 'Household visits and represented people',
    domain: 'service',
    readiness: 'operational',
    requiredHeaders: [
      'Household ID', 'Anonymous', 'Household Size', 'Neighbor ID',
      'Number of Adults', 'Number of Children', 'Number of Seniors',
      'Number of Unknown Age HH Members', 'Neighbor Date of Birth',
      'Neighbor Age', 'Neighbor Gender Identity', 'Neighbor Race or Ethnicity',
      'Event ID', 'Visit ID', 'Visit Date', 'Visit Recorded On',
      'Primary Service(s)',
    ],
    allowedHeaders: SIMC_SERVICE_VISIT_ALLOWED_HEADERS,
    transformations: [
      'Group household-member rows into one formal encounter per Visit ID.',
      'Keep household and person details separate so totals and demographics stay accurate.',
      'Use Household Size for reported people and member rows for demographic coverage.',
      'Derive birth year, discard full birth dates, and normalize response participation.',
      'Discard Additional Notes and every column outside the reviewed allowlist.',
    ],
    nextStep: 'Review visits, households, represented people, demographic coverage, and source-quality findings.',
    priority: 55,
  },
];

export const normalizeDataSourceHeader = (value: string): string => value
  .replace(/^\uFEFF/, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('en-US');

export function parseCsvHeaderRecord(csvText: string): string[] {
  const headers: string[] = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (character === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (character === ',' && !inQuotes) {
      headers.push(value.replace(/^\uFEFF/, '').trim());
      value = '';
      continue;
    }
    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && csvText[index + 1] === '\n') index += 1;
      headers.push(value.replace(/^\uFEFF/, '').trim());
      return headers;
    }
    value += character;
  }

  if (value.length > 0 || headers.length > 0) headers.push(value.replace(/^\uFEFF/, '').trim());
  return headers;
}

const normalized = (headers: readonly string[]) => headers.map(normalizeDataSourceHeader);

const matches = (contract: DataSourceContract, headers: string[]): boolean => {
  const normalizedHeaders = normalized(headers);
  const headerSet = new Set(normalizedHeaders);
  if (contract.exactHeaders) {
    const exact = normalized(contract.exactHeaders);
    return exact.length === normalizedHeaders.length
      && exact.every((header, index) => header === normalizedHeaders[index]);
  }
  if (contract.requiredHeaders?.some((header) => !headerSet.has(normalizeDataSourceHeader(header)))) return false;
  if (contract.requiredAnyOf?.some((group) => !group.some((header) => headerSet.has(normalizeDataSourceHeader(header))))) return false;
  if (contract.forbiddenHeaders?.some((header) => headerSet.has(normalizeDataSourceHeader(header)))) return false;
  return true;
};

export function inspectCsvHeader(csvHeaderText: string): DataSourceInspection {
  const headers = parseCsvHeaderRecord(csvHeaderText);
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    return {
      status: 'unknown',
      message: 'FEED could not find a CSV header row. Export the data again and try another file.',
    };
  }

  const candidates = CONTRACTS
    .filter((contract) => matches(contract, headers))
    .sort((left, right) => right.priority - left.priority);
  if (candidates.length === 0) {
    return {
      status: 'unknown',
      message: 'FEED could not identify this CSV. Choose a registered OFB, Link2Feed, SIMC, or FEED-formatted WTH export.',
    };
  }
  if (candidates.length > 1 && candidates[0].priority === candidates[1].priority) {
    return {
      status: 'ambiguous',
      message: 'This CSV matches more than one data contract. No importer has been selected.',
    };
  }

  const contract = candidates[0];
  const allowed = new Set(normalized(contract.allowedHeaders));
  const recognizedFieldCount = headers.filter((header) => allowed.has(normalizeDataSourceHeader(header))).length;
  return {
    status: 'detected',
    contract: {
      id: contract.id,
      source: contract.source,
      datasetKind: contract.datasetKind,
      label: contract.label,
      sourceLabel: contract.sourceLabel,
      datasetLabel: contract.datasetLabel,
      domain: contract.domain,
      readiness: contract.readiness,
      transformations: contract.transformations,
      nextStep: contract.nextStep,
    },
    headerCount: headers.length,
    recognizedFieldCount,
    ignoredFieldCount: headers.length - recognizedFieldCount,
  };
}
