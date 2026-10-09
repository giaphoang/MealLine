// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import config from '@/config/config';
import { BaseApiService } from '@/services/base';

export type ServiceMetricValueType = 'count' | 'boolean' | 'time_of_day';
export type ServiceMetricUnit = 'households' | 'people' | 'requests' | 'items' | 'marker';
export type ServiceMetricSemanticRole =
  | 'served_household_method'
  | 'unmet_demand'
  | 'ancillary_service'
  | 'capacity_marker'
  | 'informational_custom';
export type ServiceEntryState = 'draft' | 'finalized';
export type ServicePantryStatus = 'open' | 'closed';

export interface ServiceMetricRevision {
  id: number;
  metricId: number;
  revision: number;
  displayName: string;
  description: string | null;
  iconName: string;
  valueType: ServiceMetricValueType;
  unit: ServiceMetricUnit;
  semanticRole: ServiceMetricSemanticRole;
  contributesToOperationalTotal: boolean;
  capacityTarget: number | null;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  displayOrder: number;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface ServiceMetricConfiguration {
  id: number;
  metricKey: string;
  createdAt: string;
  currentRevision: ServiceMetricRevision;
  revisionCount: number;
  hasObservations: boolean;
  displayPosition: number;
}

export interface ServiceMetricConfigurationInput {
  displayName: string;
  description: string | null;
  iconName: string;
  valueType: ServiceMetricValueType;
  unit: ServiceMetricUnit;
  semanticRole: ServiceMetricSemanticRole;
  contributesToOperationalTotal: boolean;
  capacityTarget: number | null;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  displayPosition: number;
  isActive: boolean;
}

export interface ServiceMetricDayDefinition {
  id: number;
  metricKey: string;
  definitionRevisionId: number;
  definitionRevision: number;
  displayName: string;
  description: string | null;
  iconName: string;
  valueType: ServiceMetricValueType;
  unit: ServiceMetricUnit;
  semanticRole: ServiceMetricSemanticRole;
  contributesToOperationalTotal: boolean;
  capacityTarget: number | null;
  displayOrder: number;
  observation: {
    countValue: number | null;
    booleanValue: boolean | null;
    timeValue: string | null;
  } | null;
}

export interface ServiceDay {
  serviceDate: string;
  pantryStatus: ServicePantryStatus;
  entryState: ServiceEntryState;
  dayRevision: number;
  metrics: ServiceMetricDayDefinition[];
  operationalTotal: {
    value: number | null;
    recordedMetricCount: number;
    expectedMetricCount: number;
    complete: boolean;
  };
  capacityPlan: {
    planKey: string;
    revision: number;
    displayName: string;
    description: string | null;
    timezone: string;
    targets: Array<{
      id: number;
      targetKey: string;
      displayName: string;
      unit: string;
      targetValue: number;
      metricId: number | null;
      displayOrder: number;
    }>;
  } | null;
}

export interface SaveServiceDayInput {
  pantryStatus: ServicePantryStatus;
  entryState: ServiceEntryState;
  observations: Array<{
    metricId: number;
    countValue: number | null;
    booleanValue: boolean | null;
    timeValue: string | null;
  }>;
}

class ServiceApi extends BaseApiService {
  constructor() {
    super(config.api.endpoints.service.base);
  }

  async listMetrics(): Promise<ServiceMetricConfiguration[]> {
    return (await this.get<{ metrics: ServiceMetricConfiguration[] }>('/metrics')).metrics;
  }

  async createMetric(input: ServiceMetricConfigurationInput): Promise<void> {
    await this.post('/metrics', input);
  }

  async updateMetric(
    metricId: number,
    input: ServiceMetricConfigurationInput & { expectedRevision: number },
  ): Promise<void> {
    await this.put(`/metrics/${metricId}`, input);
  }

  async seedWthDefaults(): Promise<{
    metricsCreated: number;
    metricsSkipped: number;
    capacityPlanCreated: boolean;
  }> {
    return this.post('/metrics/wth-defaults', {});
  }

  async getDay(serviceDate: string): Promise<ServiceDay> {
    return (await this.get<{ day: ServiceDay }>(`/days/${serviceDate}`)).day;
  }

  async saveDay(serviceDate: string, input: SaveServiceDayInput): Promise<ServiceDay> {
    return (await this.put<{ day: ServiceDay }>(`/days/${serviceDate}`, input)).day;
  }

  async getAnalytics(filters: {
    preset: string; startDate?: string; endDate?: string;
  }): Promise<ServiceAnalytics> {
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value !== undefined) as [string, string][],
    ).toString();
    return (await this.get<{ analytics: ServiceAnalytics }>(`/analytics?${query}`)).analytics;
  }

  async importLottoHistory(file: File): Promise<LottoQueueImportResult> {
    const response = await this.request<{ result: LottoQueueImportResult }>('/lotto/history-import', {
      method: 'POST', body: file,
      headers: { 'Content-Type': file.type === 'application/csv' ? file.type : 'text/csv' },
    });
    return response.result;
  }

  async getLottoStatus(): Promise<LottoQueueStatus> {
    return (await this.get<{ status: LottoQueueStatus }>('/lotto/status')).status;
  }

  async listLottoSessions(): Promise<LottoQueueSession[]> {
    return (await this.get<{ sessions: LottoQueueSession[] }>('/lotto/sessions')).sessions;
  }

  async syncLotto(): Promise<{ inserted: number; unchanged: number; review: number }> {
    return (await this.post<{ result: { inserted: number; unchanged: number; review: number } }>('/lotto/sync')).result;
  }

  async saveLottoConfig(baseUrl: string, token: string): Promise<{ sourceChanged: boolean }> {
    return (await this.put<{ config: { sourceChanged: boolean } }>('/lotto/config', { baseUrl, token })).config;
  }

  async resolveLottoSession(sessionId: string, disposition: LottoQueueDisposition, reason: string): Promise<void> {
    await this.post(`/lotto/sessions/${encodeURIComponent(sessionId)}/resolutions`, { disposition, reason });
  }
}

export interface LottoQueueImportResult {
  outcome: 'imported' | 'no_op';
  importId: number;
  received: number;
  inserted: number;
  unchanged: number;
  review: number;
}

export type LottoQueueDisposition = 'needs_review' | 'included_service' | 'excluded_test' | 'excluded_duplicate' | 'excluded_other';
export interface LottoQueueStatus {
  configured: boolean;
  pendingReviewCount: number;
  config: { baseUrl: string; cursor: string | null; lastSyncedAt: string | null; updatedAt: string } | null;
}
export interface LottoQueueSession {
  id: number; sessionId: string; serviceDate: string; issuedCount: number; calledCount: number;
  withinOperatingWindow: boolean; allIssuedTicketsCalled: boolean;
  switchedRandomToSequential: boolean; appendedTickets: boolean;
  initialDisposition: LottoQueueDisposition; effectiveDisposition: LottoQueueDisposition;
  timingCoverage: string; recordedAt: string;
  qualityIssues: Array<{ id: number; code: string; severity: string }>;
  latestResolution: { disposition: LottoQueueDisposition; reason: string; createdAt: string } | null;
}


/** Mirrors `getServiceAnalytics` in the backend service. */
export type ServiceBucketGranularity = 'day' | 'week' | 'month';

export interface ServiceMethodDefinition {
  metricKey: string;
  displayName: string;
  unit: string;
  /** Administrator-configured icon, so the interface keeps no list of its own. */
  iconName: string;
  /** First date this metric was recorded with a non-zero value, if ever. */
  firstRecordedDate?: string | null;
}

/**
 * `values` can sum above `answered` where a question accepts more than one
 * answer, which `multiValue` declares so a card can say so.
 */
export interface DemographicBreakdown {
  values: Array<{ label: string; count: number }>;
  answered: number;
  asked: number;
  sources: string[];
  multiValue: boolean;
  unit: 'households' | 'people';
}

export interface ServiceAnalytics {
  coverage: {
    startDate: string;
    endDate: string;
    granularity: ServiceBucketGranularity;
    sources: Array<{ source: string; firstDate: string; lastDate: string; encounters: number }>;
    hasIntake: boolean;
    hasServiceLog: boolean;
    serviceLogFirstDate: string | null;
    serviceLogLastDate: string | null;
  };
  summary: {
    visits: number;
    peopleServed: number;
    identityUnavailableVisits: number;
    bulkEntryVisits: number;
    bulkEntryPeople: number;
    households: number;
    householdsSource: 'service_log' | 'intake' | 'none';
    methods: Array<ServiceMethodDefinition & { households: number }>;
    otherServices: Array<ServiceMethodDefinition & { total: number }>;
  };
  overTime: Array<{
    month: string;
    /** Null where the record does not cover the day — the line breaks there. */
    link2feedHouseholds: number | null;
    link2feedIndividuals: number | null;
    simcHouseholds: number | null;
    simcIndividuals: number | null;
    serviceLogHouseholds: number | null;
  }>;
  /**
   * Twelve calendar months, one key per year, in two measures of the same rows.
   * Households counts a household once however often it came; visits counts
   * every encounter, including those with no household record to be distinct
   * by.
   */
  seasonal: {
    years: string[];
    households: Array<Record<string, string | number>>;
    visits: Array<Record<string, string | number>>;
  };
  methodSeries: {
    granularity: ServiceBucketGranularity;
    methods: ServiceMethodDefinition[];
    buckets: Array<Record<string, string | number>>;
  };
  recordAgreement: {
    sharedDays: number;
    intakeTotal: number;
    serviceLogTotal: number;
    meanAbsoluteDailyDifference: number;
    agreementPercent: number;
  };
  /**
   * Service not delivered. A day inside the Service Log's span with no
   * turned-away entry is a confirmed zero; outside that span it is silence,
   * and the bucket is null so the line begins where the record does.
   */
  unmetDemand: {
    granularity: ServiceBucketGranularity;
    buckets: Array<{ bucket: string; turnedAway: number | null }>;
    householdsTurnedAway: number;
    daysWithTurnAway: number;
    daysRecorded: number;
    capacityReachedDays: number;
    /** The administrator's icon for the capacity metric; null if none or several. */
    capacityIconName: string | null;
    firstRecordedDate: string | null;
  };
  /**
   * Languages merged only where two labels are the same word — "Mandarin
   * Chinese" into "Mandarin". Different names stay different, and `rawValues`
   * keeps every answer exactly as recorded for the export.
   */
  languages: {
    values: Array<{ language: string; households: number }>;
    rawValues: Array<{ language: string; households: number }>;
    mergedLabels: number;
    householdsAsked: number;
    householdsAnswered: number;
  };
  /** How many households answered each question, and which system asked it. */
  responseCoverage: Array<{
    dimension: string;
    displayName: string;
    provided: number;
    notProvided: number;
    sources: string[];
  }>;
  /**
   * Ages as of the end of the range, banded. Only Link2Feed records a birth
   * year, so `sources` is empty for a range after the June 2026 changeover and
   * the card must say so rather than drawing six empty bars.
   */
  /**
   * Two records kept apart: Link2Feed records one birth year per household
   * profile (the person who registered), SIMC one per household member.
   * Summing them would weight a SIMC household by its size and a Link2Feed
   * household by one.
   */
  ageBands: {
    bands: Array<{ label: string; count: number }>;
    estimatedBirthYears: number;
    withoutBirthYear: number;
    implausibleBirthYears: number;
    sources: string[];
    available: boolean;
  };
  /** Ranked answers for one demographic question, at that record's grain. */
  demographics: {
    ethnicity: DemographicBreakdown;
    genderIdentity: DemographicBreakdown;
    genderIdentityGrouped: DemographicBreakdown;
    housingType: DemographicBreakdown;
    simcRaceOrEthnicity: DemographicBreakdown;
    simcGenderIdentity: DemographicBreakdown;
  };
  /**
   * Postal codes, excluding households recorded as having no fixed address —
   * their postal code is the agency's, entered because SIMC requires one.
   */
  geography: {
    /** `latitude`/`longitude` are null where the postal code has no centroid. */
    postalCodes: Array<{
      postalCode: string;
      clients: number;
      latitude: number | null;
      longitude: number | null;
    }>;
    clientsWithoutPlace: number;
    /** The agency's own code, derived; null when no code clearly dominates. */
    agencyPostalCode: string | null;
    noFixedAddress: number;
    noFixedAddressAsked: boolean;
    clientsWithoutPostalCode: number;
    clientsWithPostalCode: number;
  };
  householdSize: Array<{ people: number; visits: number }>;
  reachAndFrequency: Array<{
    year: string;
    households: number;
    visits: number;
    visitsPerHousehold: number;
  }>;
  /**
   * Added in FEED 1.6. Older cached responses and a frontend briefly served
   * ahead of its backend may omit it, so Analytics treats absence as no LOTTO
   * observations rather than failing the entire Service lens.
   */
  queueTiming?: {
    includedSessionCount: number;
    includedServiceDayCount: number;
    volumeServiceDayCount: number;
    pendingReviewCount: number;
    excludedSessionCount: number;
    observedTicketCount: number;
    medianWaitMinutes: number | null;
    averageWaitMinutes: number | null;
    p75WaitMinutes: number | null;
    p90WaitMinutes: number | null;
    historicalServingIntervalMinutes: number | null;
    typicalLastCallLocalTime: string | null;
    medianInitialBatchSize: number | null;
    averageIssuedPerServiceDay: number | null;
    averageReturnedPerServiceDay: number | null;
    daily: Array<{
      serviceDate: string;
      issuedCount: number | null;
      returnedCount: number | null;
      calledCount: number | null;
      initialBatchIssuedCount: number | null;
      tenthCallLocalMinute: number | null;
      twentyFifthCallLocalMinute: number | null;
      fiftiethCallLocalMinute: number | null;
      lastCallLocalMinute: number | null;
    }>;
  };
}

export const serviceApi = new ServiceApi();
