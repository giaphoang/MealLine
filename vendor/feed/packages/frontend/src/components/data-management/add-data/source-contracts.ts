// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

export type ImportDomain = 'procurement' | 'service';
export type SourceContractStatus = 'operational' | 'prototype' | 'pending-sample';

export interface SourceContract {
  id:
    | 'ofb_unified_v2'
    | 'ofb_completed_orders_v1'
    | 'ofb_agency_pickups_v1'
    | 'wth_legacy_procurement_v1'
    | 'link2feed_visits_v1'
    | 'link2feed_clients_v1'
    | 'simc_service_visits_v1'
    | 'wth_service_tracking_v1'
    | 'lotto_queue_history_v1';
  label: string;
  sourceLabel: string;
  datasetLabel: string;
  domain: ImportDomain;
  status: SourceContractStatus;
  exactHeaders?: readonly string[];
  requiredHeaders?: readonly string[];
  requiredAnyOf?: readonly (readonly string[])[];
  forbiddenHeaders?: readonly string[];
  allowedHeaders: readonly string[];
  transformations: readonly string[];
  nextStep: string;
  priority: number;
}

export interface DetectedSource {
  status: 'detected';
  contract: SourceContract;
  headers: string[];
  recognizedHeaders: string[];
  ignoredHeaders: string[];
}

export interface UnknownSource {
  status: 'unknown';
  headers: string[];
}

export interface AmbiguousSource {
  status: 'ambiguous';
  headers: string[];
  candidates: SourceContract[];
}

export type SourceDetection = DetectedSource | UnknownSource | AmbiguousSource;

export const OFB_UNIFIED_HEADERS = [
  'Schema Version',
  'Record Type',
  'Confirmed',
  'Date',
  'Period',
  'Source Reference',
  'Product #',
  'Product Description',
  'Category',
  'Qty',
  'Weight',
  'Unit Price',
  'Price Total',
  'Service Fee',
  'Grants Applied',
  'Pickup Time',
  'Pickup ID',
  'Pickup Line ID',
  'Donor Code',
  'Donor Name',
  'Fresh Alliance Category',
  'Received Qty',
  'Received Weight',
  'Temperature',
  'Submitted Date/Time',
  'Donor Value Per Pound',
] as const;

export const OFB_COMPLETED_ORDER_HEADERS = [
  'Date',
  'Period',
  'Order #',
  'Product #',
  'Product Description',
  'Category',
  'Qty',
  'Weight',
  'Unit Price',
  'Price Total',
  'Service Fee',
  'Grants Applied',
] as const;

export const OFB_AGENCY_PICKUP_HEADERS = [
  'Date',
  'Period',
  'Pickup Time',
  'Pickup ID',
  'Pickup Reference',
  'Pickup Line ID',
  'Donor Code',
  'Donor Name',
  'Product #',
  'Product Description',
  'Category',
  'Fresh Alliance Category',
  'Qty',
  'Weight',
  'Received Qty',
  'Received Weight',
  'Temperature',
  'Submitted Date/Time',
  'Donor Value Per Pound',
] as const;

export const WTH_LEGACY_PROCUREMENT_HEADERS = [
  'calendar_year',
  'month_num',
  'month',
  'source_canonical',
  'disposition',
  'in_ofb',
  'weight_pounds',
  'source_as_written',
  'fiscal_year',
  'source_file',
  'caveat',
] as const;
export const LOTTO_QUEUE_HISTORY_HEADERS = ['FEED Schema Version', 'Summary JSON'] as const;

/**
 * Public Link2Feed visit allowlist. An original export may contain additional
 * personal columns; their presence neither prevents detection nor makes their
 * values eligible for ingestion.
 */
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

/**
 * Provisional client-export allowlist. The canonical destinations are decided,
 * but source detection stays marked pending until a sanitized client export
 * verifies the exact Link2Feed header vocabulary.
 */
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

/**
 * Long-form handoff from the temporary WTH Google Sheet exporter. The
 * spreadsheet layout is deliberately not the application contract.
 */
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

export const SOURCE_CONTRACTS: readonly SourceContract[] = [
  {
    id: 'lotto_queue_history_v1',
    label: 'LOTTO queue history',
    sourceLabel: 'LOTTO',
    datasetLabel: 'Historical queue-session timing',
    domain: 'service',
    status: 'operational',
    exactHeaders: LOTTO_QUEUE_HISTORY_HEADERS,
    allowedHeaders: LOTTO_QUEUE_HISTORY_HEADERS,
    transformations: [
      'Import privacy-minimized session closeouts without physical ticket numbers.',
      'Keep unusual sessions out of Analytics until staff classify them.',
    ],
    nextStep: 'Import the reconstructed history, then review withheld sessions.',
    priority: 110,
  },
  {
    id: 'ofb_unified_v2',
    label: 'OFB unified order export',
    sourceLabel: 'Oregon Food Bank',
    datasetLabel: 'Completed orders and agency pickups',
    domain: 'procurement',
    status: 'operational',
    exactHeaders: OFB_UNIFIED_HEADERS,
    allowedHeaders: OFB_UNIFIED_HEADERS,
    transformations: [
      'Separate warehouse orders and agency pickups into permanent source namespaces.',
      'Preserve the existing OFB validation, revision, and warning rules.',
    ],
    nextStep: 'Continue through the established OFB import and reconciliation flow.',
    priority: 100,
  },
  {
    id: 'ofb_agency_pickups_v1',
    label: 'OFB agency pickup export',
    sourceLabel: 'Oregon Food Bank',
    datasetLabel: 'Fresh Food Alliance agency pickups',
    domain: 'procurement',
    status: 'prototype',
    exactHeaders: OFB_AGENCY_PICKUP_HEADERS,
    allowedHeaders: OFB_AGENCY_PICKUP_HEADERS,
    transformations: [
      'Preserve donor, pickup, received-weight, valuation, and source-warning evidence.',
      'Recognize the retired single-channel schema without importing it.',
    ],
    nextStep: 'Export the supported unified OFB file and try again.',
    priority: 90,
  },
  {
    id: 'ofb_completed_orders_v1',
    label: 'OFB completed-order export',
    sourceLabel: 'Oregon Food Bank',
    datasetLabel: 'Completed warehouse orders',
    domain: 'procurement',
    status: 'prototype',
    exactHeaders: OFB_COMPLETED_ORDER_HEADERS,
    allowedHeaders: OFB_COMPLETED_ORDER_HEADERS,
    transformations: [
      'Preserve order, product, weight, price, grant, and source-warning evidence.',
      'Recognize the retired single-channel schema without importing it.',
    ],
    nextStep: 'Export the supported unified OFB file and try again.',
    priority: 80,
  },
  {
    id: 'wth_legacy_procurement_v1',
    label: 'WTH historical community-donation ledger',
    sourceLabel: 'William Temple House',
    datasetLabel: 'Historical monthly community donations',
    domain: 'procurement',
    status: 'operational',
    exactHeaders: WTH_LEGACY_PROCUREMENT_HEADERS,
    allowedHeaders: WTH_LEGACY_PROCUREMENT_HEADERS,
    transformations: [
      'Keep monthly grain and the WTH-authored canonical source identity.',
      'Preserve disposition and caveat fields without manufacturing product detail.',
    ],
    nextStep: 'Continue through the established historical-ledger import flow.',
    priority: 70,
  },
  {
    id: 'wth_service_tracking_v1',
    label: 'WTH service-tracking export',
    sourceLabel: 'William Temple House',
    datasetLabel: 'Historical daily service-method observations',
    domain: 'service',
    status: 'operational',
    exactHeaders: WTH_SERVICE_TRACKING_HEADERS,
    allowedHeaders: WTH_SERVICE_TRACKING_HEADERS,
    transformations: [
      'Import direct metric observations; never import spreadsheet Total formulas as canonical facts.',
      'Preserve blank versus explicit zero, source-cell provenance, metric role, unit, and value type.',
      'Map the historical observations into the same metric model used by FEED-native Service Logs.',
    ],
    nextStep: 'Review historical observations, source provenance, and comparison with formal household totals.',
    priority: 60,
  },
  {
    id: 'link2feed_visits_v1',
    label: 'Link2Feed visit export',
    sourceLabel: 'Link2Feed',
    datasetLabel: 'Service visits and visit-linked demographics',
    domain: 'service',
    status: 'operational',
    requiredHeaders: [
      'Visit Date',
      'Client ID',
      'Household Size',
      'Recorded At',
    ],
    allowedHeaders: LINK2FEED_VISIT_ALLOWED_HEADERS,
    transformations: [
      'Keep Client ID only as a Link2Feed-scoped identifier; never match it to SIMC identity.',
      'Convert Excel serial dates and timestamps under the reviewed Link2Feed contract.',
      'Derive birth year and estimated-year status, then discard full birth dates.',
      'Normalize approved demographic, geography, language, housing, dietary, income, disability, and assistance fields.',
      'Collapse demographic participation to provided or not provided; never infer why no answer was supplied.',
      'Discard Notes. Service-method detail comes from WTH Tracking or FEED-native Service Logs.',
      'Ignore every column outside this allowlist without reading or retaining its values.',
    ],
    nextStep: 'Review coverage, demographic participation, identity gaps, and source-data resolutions.',
    priority: 50,
  },
  {
    id: 'link2feed_clients_v1',
    label: 'Link2Feed client export',
    sourceLabel: 'Link2Feed',
    datasetLabel: 'Client profiles and demographics',
    domain: 'service',
    status: 'pending-sample',
    requiredHeaders: ['Client ID'],
    requiredAnyOf: [
      ['Client Date of Birth', 'Client Estimated Date of Birth'],
      ['Client Gender Identity-Labels', 'Client Ethnicity-Labels'],
    ],
    forbiddenHeaders: ['Visit Date', 'Recorded At'],
    allowedHeaders: LINK2FEED_CLIENT_ALLOWED_HEADERS,
    transformations: [
      'Enrich existing Link2Feed-scoped client profiles without requiring visits to be re-imported.',
      'Apply the same birth-year, demographic-participation, geography, and multi-select transformations as visit exports.',
      'Ignore every column outside the approved client allowlist.',
    ],
    nextStep: 'Confirm the source vocabulary against a sanitized client export before enabling ingestion.',
    priority: 40,
  },
  {
    id: 'simc_service_visits_v1',
    label: 'SIMC service visit export',
    sourceLabel: 'Service Insights Meal Connect',
    datasetLabel: 'Household visits and represented people',
    domain: 'service',
    status: 'operational',
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
] as const;

export const normalizeSourceHeader = (value: string) => value
  .replace(/^\uFEFF/, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('en-US');

/** Parse one CSV record correctly enough to inspect headers with commas, quotes,
 * escaped quotes, CRLF, or a newline inside a quoted header. */
export function parseCsvHeader(csvText: string): string[] {
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

  if (value.length > 0 || headers.length > 0) {
    headers.push(value.replace(/^\uFEFF/, '').trim());
  }
  return headers;
}

const normalized = (headers: readonly string[]) => headers.map(normalizeSourceHeader);

const contractMatches = (contract: SourceContract, headers: string[]) => {
  const normalizedHeaders = normalized(headers);
  const headerSet = new Set(normalizedHeaders);

  if (contract.exactHeaders) {
    const exact = normalized(contract.exactHeaders);
    return exact.length === normalizedHeaders.length
      && exact.every((header, index) => header === normalizedHeaders[index]);
  }

  if (contract.requiredHeaders?.some((header) => !headerSet.has(normalizeSourceHeader(header)))) {
    return false;
  }
  if (contract.requiredAnyOf?.some((group) => (
    !group.some((header) => headerSet.has(normalizeSourceHeader(header)))
  ))) {
    return false;
  }
  if (contract.forbiddenHeaders?.some((header) => headerSet.has(normalizeSourceHeader(header)))) {
    return false;
  }
  return true;
};

export function detectCsvSource(csvText: string): SourceDetection {
  const headers = parseCsvHeader(csvText);
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    return { status: 'unknown', headers };
  }

  const candidates = SOURCE_CONTRACTS
    .filter((contract) => contractMatches(contract, headers))
    .sort((left, right) => right.priority - left.priority);

  if (candidates.length === 0) return { status: 'unknown', headers };
  if (candidates.length > 1 && candidates[0].priority === candidates[1].priority) {
    return { status: 'ambiguous', headers, candidates };
  }

  const contract = candidates[0];
  const allowed = new Set(normalized(contract.allowedHeaders));
  const recognizedHeaders = headers.filter((header) => allowed.has(normalizeSourceHeader(header)));
  const ignoredHeaders = headers.filter((header) => !allowed.has(normalizeSourceHeader(header)));
  return {
    status: 'detected',
    contract,
    headers,
    recognizedHeaders,
    ignoredHeaders,
  };
}
