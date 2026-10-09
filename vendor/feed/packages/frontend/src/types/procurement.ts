// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import type { AnalyticsRangePreset } from '@/types/analytics';

export type ProcurementImportStatus = 'active' | 'rolled_back';
export type ProcurementChannel = 'ofb_warehouse' | 'fresh_alliance' | 'community_donation';
export type ProcurementEventKind =
  | 'ofb_warehouse_order'
  | 'fresh_alliance_receipt'
  | 'community_donation_month';
export type AcquisitionClass = 'DONATED' | 'PURCH-DON' | 'GOVERNMENT' | 'PURCHASED';

export interface ProcurementOrderSummary {
  id: number;
  sourceOrderReference: string;
  eventKind: ProcurementEventKind;
  deliveryDate: string;
  revision: number;
  /** Null where the source reports no donor — never inferred (D4). */
  donorCode: string | null;
  donorName: string | null;
  warningCodes: string[];
  isCurrent: boolean;
  lineCount: number;
}

export interface ProcurementImportRecord {
  id: number;
  /** `legacy_community` is the curated pre-Primarius ledger (D16). */
  source: 'ofb' | 'ofb_pickup' | 'legacy_community';
  status: ProcurementImportStatus;
  schemaVersion: number;
  rowCount: number;
  orderCount: number;
  warningCount: number;
  warnings: ProcurementWarning[];
  rangeStart: string;
  rangeEnd: string;
  importedAt: string;
  rolledBackAt: string | null;
  restoredAt: string | null;
  /**
   * Hash of the original unified export file. A unified upload always
   * produces two rows -- Warehouse and Fresh Alliance are permanently
   * separate source namespaces -- and this ties them back to one upload
   * action. Null only for an import that predates this column.
   */
  unifiedFileHash: string | null;
  orders: ProcurementOrderSummary[];
}

export interface ProcurementWarning {
  code: string;
  message: string;
  deliveryDate: string;
  rowNumbers: number[];
}

export interface ProcurementImportResult {
  outcome: 'imported' | 'duplicate';
  importId: number | null;
  rowCount: number;
  orderCount: number;
  skippedOrderCount: number;
  warningCount: number;
  rangeStart: string;
  rangeEnd: string;
  warnings: ProcurementWarning[];
}

export interface ProcurementChannelCoverage {
  eventCount: number;
  earliestDeliveryDate: string | null;
  latestDeliveryDate: string | null;
}

export interface ProcurementDataStatus {
  hasData: boolean;
  latestDeliveryDate: string | null;
  daysSinceLatestDelivery: number | null;
  isStale: boolean;
  staleAfterDays: number;
  /**
   * Each channel is reported on its own schedule and their windows are never
   * assumed equal. This describes what FEED can currently see — it is not a
   * completeness score or a performance signal.
   */
  coverage: {
    warehouse: ProcurementChannelCoverage;
    freshAlliance: ProcurementChannelCoverage;
  };
}

export interface FreshAllianceImportResult {
  outcome: 'imported' | 'duplicate';
  importId: number | null;
  rowCount: number;
  pickupCount: number;
  skippedPickupCount: number;
  supersededEventCount: number;
  warningCount: number;
  rangeStart: string;
  rangeEnd: string;
  warnings: ProcurementWarning[];
}

/** The OFB Order CSV Exporter v2.0.0 unified export: Warehouse Completed
 *  orders plus Fresh Alliance Pending and Completed pickups, in one file. */
export interface UnifiedImportResult {
  outcome: 'imported' | 'duplicate';
  rowCount: number;
  rangeStart: string;
  rangeEnd: string;
  /** `null` when the file contained no warehouse rows at all. */
  warehouse: ProcurementImportResult | null;
  /** `null` when the file contained no Fresh Alliance pickup rows at all. */
  freshAlliance: FreshAllianceImportResult | null;
}

export const DATA_SHAPING_EXCLUSIONS = ['pass_through', 'other_exclusion'] as const;
export const DATA_SHAPING_ANNOTATIONS = ['at_risk', 'estimated', 'program_bound'] as const;
export type DataShapingFlag =
  | (typeof DATA_SHAPING_EXCLUSIONS)[number]
  | (typeof DATA_SHAPING_ANNOTATIONS)[number];
export type FlagFamily = 'exclusion' | 'annotation';
export type RuleScope = 'donor' | 'category' | 'date_range' | 'event';

/**
 * A non-destructive classification overlay on procurement observations (D19).
 * A rule never edits or deletes an event; it records how this agency reads it,
 * and each Analytics view decides which flags it honors.
 */
export interface DataShapingRule {
  id: number;
  flag: DataShapingFlag;
  scope: RuleScope;
  donorName: string | null;
  donorCode: string | null;
  productCode: string | null;
  orderRevisionId: number | null;
  source: string | null;
  startDate: string | null;
  endDate: string | null;
  enabled: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DataShapingRuleInput = Partial<Omit<DataShapingRule, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>> & {
  flag: DataShapingFlag;
  scope: RuleScope;
};

export interface DataShapingCatalogEntry {
  flag: DataShapingFlag;
  family: FlagFamily;
  description: string;
}

/** The curated pre-Primarius community-donation ledger (D22, single-agency). */
export interface LegacyImportResult {
  outcome: 'imported' | 'duplicate';
  importId: number | null;
  rowCount: number;
  monthCount: number;
  skippedMonthCount: number;
  totalWeightHundredths: number;
  rangeStart: string;
  rangeEnd: string;
  sourceCount: number;
}

export interface ProcurementAnalyticsFilters {
  preset?: AnalyticsRangePreset;
  startDate?: string;
  endDate?: string;
  channel?: ProcurementChannel;
  acquisitionClass?: AcquisitionClass;
}

export interface ProcurementWarehouseProductSummary {
  productCode: string;
  description: string;
  acquisitionClass: AcquisitionClass;
  procurementChannel: ProcurementChannel;
  receiptDateCount: number;
  totalWeightHundredths: number;
  averageWeightPerReceiptHundredths: number;
  medianGapDays: number | null;
  // Charges carried on the same rows. A product is purchased or donated, never
  // both, so these are 0/0/null for donated products (the old separate paid
  // table was just the purchased subset).
  totalSpendCents: number;
  paidWeightHundredths: number;
  costPerPaidPoundCents: number | null;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

export interface FreshAllianceCategorySummary {
  productCode: string;
  description: string;
  receiptEventCount: number;
  receivingDateCount: number;
  totalWeightHundredths: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

export interface FreshAllianceDonorCategorySummary {
  /** `null` when the receipt has no donor on file — reported honestly, never inferred. */
  donorCode: string | null;
  donorName: string;
  productCode: string;
  description: string;
  receiptEventCount: number;
  receivingDateCount: number;
  totalWeightHundredths: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

export interface PaidProcurementProductSummary {
  productCode: string;
  description: string;
  receiptDateCount: number;
  totalSpendCents: number;
  paidWeightHundredths: number;
  costPerPaidPoundCents: number | null;
  firstReceivedDate: string;
  lastReceivedDate: string;
}

export interface DonorCategoryObservation {
  productCode: string;
  description: string;
  weightHundredths: number;
}

export interface DonorSummary {
  donorCode: string;
  donorName: string;
  pickupCount: number;
  receivingDateCount: number;
  weightHundredths: number;
  averageWeightPerPickupHundredths: number;
  valuedWeightHundredths: number;
  unvaluedWeightHundredths: number;
  recordedValueCents: number;
  firstReceivedDate: string;
  lastReceivedDate: string;
  categories: DonorCategoryObservation[];
}

export interface DonorValueSummary {
  recordedValueCents: number;
  valuedWeightHundredths: number;
  totalWeightHundredths: number;
  unvaluedWeightHundredths: number;
}

export interface ProcurementAnalytics {
  dataAsOf: string;
  status: ProcurementDataStatus;
  range: {
    preset: AnalyticsRangePreset;
    startDate: string;
    endDate: string;
    timeZone: string;
  };
  filters: {
    channel: ProcurementChannel | null;
    acquisitionClass: AcquisitionClass | null;
  };
  availableYears: string[];
  summary: {
    totalWeightHundredths: number;
    sourceEventCount: number;
    warehouseOrderCount: number;
    freshAllianceReceiptCount: number;
    receivingDateCount: number;
    medianReceivingGapDays: number | null;
    medianEventWeightHundredths: number | null;
    lowerQuartileEventWeightHundredths: number | null;
    upperQuartileEventWeightHundredths: number | null;
    medianLinesPerEvent: number | null;
    warehouseProductCodes: number;
    freshAllianceCategoryCodes: number;
    zeroInboundLineCount: number;
    calculatedGrossProductChargesCents: number;
    sourceReportedProductChargesCents: number;
    costAdjustmentsAttributable: boolean;
    serviceFeesCents: number | null;
    grantsAppliedCents: number | null;
    netRecordedCostCents: number | null;
    priceMismatchLineCount: number;
    /**
     * Weight already counted in every total above -- OFB's "Confirmed" flag
     * is an audit sign-off on data the agency already reported, not a
     * data-quality gate, so pending weight is included everywhere like any
     * other observation (D15). This describes the same weight a second time,
     * not a separate figure. `null` when nothing in the current range/filters
     * is pending.
     */
    freshAlliancePending: {
      weightHundredths: number;
      eventCount: number;
      earliestDeliveryDate: string;
      latestDeliveryDate: string;
    } | null;
    /** Legacy weight from sources the live Fresh Alliance record also reports —
     *  already inside the community_donation channel; the frontend stacks this
     *  onto the Fresh Alliance bar and removes it from the legacy bar (D16). */
    freshAllianceLegacyWeightHundredths: number;
  };
  acquisitionMix: Array<{
    acquisitionClass: AcquisitionClass;
    weightHundredths: number;
  }>;
  channelMix: Array<{
    channel: ProcurementChannel;
    weightHundredths: number;
  }>;
  /**
   * Recorded spend by delivery month. Separate from weight because the two do
   * not move together — a heavy donated load costs nothing.
   */
  /** The grain the four over-time series are bucketed at. */
  bucketGranularity: 'day' | 'week' | 'month';
  monthlySpend: Array<{
    bucket: string;
    productChargesCents: number;
    serviceFeesCents: number;
    grantsAppliedCents: number;
    netRecordedCostCents: number;
  }>;
  monthlyWeight: Array<{
    bucket: string;
    donatedWeightHundredths: number;
    purchDonWeightHundredths: number;
    governmentWeightHundredths: number;
    purchasedWeightHundredths: number;
    ofbWarehouseWeightHundredths: number;
    freshAllianceWeightHundredths: number;
    /** Pre-Primarius community donations (D16). Monthly grain, own series. */
    communityDonationWeightHundredths: number;
  }>;
  seasonalWeight: Array<{
    year: string;
    month: number;
    weightHundredths: number;
  }>;
  seasonalChannelWeight: Array<{
    year: string;
    month: number;
    channel: ProcurementChannel;
    weightHundredths: number;
  }>;
  warehouseProducts: ProcurementWarehouseProductSummary[];
  paidProducts: PaidProcurementProductSummary[];
  freshAllianceCategories: FreshAllianceCategorySummary[];
  freshAllianceDonorCategories: FreshAllianceDonorCategorySummary[];
  donors: DonorSummary[];
  donorMonthlyWeight: Array<{
    bucket: string;
    donorCode: string;
    weightHundredths: number;
  }>;
  /**
   * Legacy community donation history (D16), by canonical source. A "received"
   * view of donations as an activity, so it honors no exclusion flags — its
   * total will not reconcile with retained-supply figures, by design (D21).
   * Sorted heaviest first.
   */
  communitySources: Array<{
    sourceName: string;
    /** True when this source matches a live Fresh Alliance donor; its history
     *  feeds the Fresh Alliance views, and the community time-series omit it. */
    isFreshAlliancePartner: boolean;
    weightHundredths: number;
    monthCount: number;
    firstReceivedDate: string;
    lastReceivedDate: string;
  }>;
  communityMonthlyWeight: Array<{
    bucket: string;
    sourceName: string;
    weightHundredths: number;
  }>;
  /** FFA partners' pre-Primarius monthly history, keyed by the live donor code,
   *  for the Donations-Over-Time "Show Legacy Data" toggle. */
  freshAllianceLegacyMonthlyWeight: Array<{
    bucket: string;
    donorCode: string;
    weightHundredths: number;
  }>;
  donorValue: DonorValueSummary;
  /**
   * What the agency's own rules did to these numbers (D19/D21).
   * `summary.totalWeightHundredths` remains everything received;
   * `retainedWeightHundredths` is what is left after honoring exclusions. Two
   * honest answers to two different questions, from the same untouched
   * observations — and the breakdown exists so an exclusion is never invisible.
   */
  dataShaping: {
    excludedWeightHundredths: number;
    retainedWeightHundredths: number;
    flags: Array<{
      flag: DataShapingFlag;
      family: FlagFamily;
      weightHundredths: number;
      eventCount: number;
    }>;
  };
}
