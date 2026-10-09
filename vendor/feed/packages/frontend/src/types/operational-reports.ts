import type { AnalyticsRangePreset } from '@/types/analytics';

export type OperationalRangePreset = AnalyticsRangePreset;

export interface OperationalReportRequest {
  preset: OperationalRangePreset;
  startDate?: string;
  endDate?: string;
  /** Card-local display/export option; it does not filter other analytics. */
  assortmentCategoryId?: number;
}

export interface AvailabilityTimelinePoint {
  date: string;
  serviceMinutes: number;
  trackedItemMinutes: number;
  availableItemMinutes: number;
  availableCategoryItemMinutes: Record<string, number>;
  trackedItems: number;
  available: number;
  availableByCategory: Record<string, number>;
  unavailable: number;
  limitedSupply: number;
  clearance: number;
  itemRationed: number;
  /** Average categories carrying an explicit limit during the service window. */
  categoryRationed: number;
  /** Rationed-item counts keyed by "<limit>|<limitType>", zero-filled. */
  rationedByLimit: Record<string, number>;
}

export interface AssortmentCategorySeries {
  categoryId: number;
  categoryName: string;
  averageAvailable: number;
}

/** One distinct limit configuration observed in the timeline. */
export interface RationedLimitSeries {
  key: string;
  limit: number;
  limitType: string;
}

export interface UnavailableEpisode {
  itemId: number;
  itemName: string;
  categoryId: number;
  categoryName: string;
  startedAt: string;
  endedAt: string | null;
  durationHours: number;
  resolution: 'restored' | 'deleted' | 'open_at_range_end';
  entryKind: 'initial_unavailable' | 'availability_transition';
}

export interface RecurringAvailabilityItem {
  itemId: number;
  itemName: string;
  categoryId: number;
  categoryName: string;
  unavailableEntries: number;
  restorations: number;
  ongoingEpisodes: number;
  deletedEpisodes: number;
  medianRestorationHours: number | null;
  latestUnavailableAt: string;
}

export interface RecurringAvailabilityCategory {
  categoryId: number;
  categoryName: string;
  recurringItems: number;
  unavailableEntries: number;
  restorations: number;
  ongoingEpisodes: number;
  deletedEpisodes: number;
  medianRestorationHours: number | null;
}

export interface CategoryPressureSummary {
  categoryId: number;
  categoryName: string;
  observedServiceMinutes: number;
  limitedSupplyServicePercent: number | null;
  clearanceServicePercent: number | null;
  itemRationedServicePercent: number | null;
  categoryRationedServicePercent: number | null;
  recurringItems: number;
  recurringUnavailableEntries: number;
}

export interface LimitChange {
  entityType: 'food_item' | 'category';
  entityId: number;
  entityName: string;
  categoryName: string | null;
  limit: number;
  limitType: string;
  isNoLimit: boolean;
  recordedAt: string;
}

export interface OperationalAnalyticsResult {
  dataAsOf: string;
  range: { startDate: string; endDate: string; timeZone: string };
  calculationVersion: string;
  correctionWindowMinutes: number;
  serviceSchedule: {
    queryTimeZone: string;
    appliedRevisions: Array<{
      revisionId: number;
      effectiveDate: string;
      timezone: string;
      recordedAt: string;
    }>;
  };
  summary: {
    trackedItems: number;
    availableNow: number;
    unavailableNow: number;
    limitedSupplyNow: number;
    clearanceNow: number;
    itemRationedNow: number;
    categoryRationedNow: number;
    repeatUnavailableItems: number;
    recurringUnavailableEntries: number;
    recurringRestorations: number;
    recurringOngoingEpisodes: number;
    recurringMedianRestorationHours: number | null;
    unavailableEpisodes: number;
    medianRestorationHours: number | null;
    averageAvailableAssortment: number | null;
    latestAvailableAssortment: number | null;
  };
  timeline: AvailabilityTimelinePoint[];
  assortmentCategorySeries: AssortmentCategorySeries[];
  rationedLimitSeries: RationedLimitSeries[];
  recurringAvailability: RecurringAvailabilityItem[];
  recurringAvailabilityCategories: RecurringAvailabilityCategory[];
  categoryPressure: CategoryPressureSummary[];
  episodes: UnavailableEpisode[];
  limitChanges: LimitChange[];
}
