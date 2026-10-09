// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { createHash } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../db';
import {
  serviceMetricObservationSnapshotHash,
  type ServiceEntryState,
  type ServiceMetricDefinitionDraft,
  type ServiceMetricObservationDraft,
  type ServiceMetricSemanticRole,
  type ServiceMetricUnit,
  type ServiceMetricValueType,
  type ServicePantryStatus,
  validateServiceDayStatus,
  validateServiceMetricDefinition,
  validateServiceMetricObservation,
} from './metrics';

type ReadClient = PrismaClient | Prisma.TransactionClient;

export class ServiceLogError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'ServiceLogError';
  }
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
  displayOrder: number;
  isActive: boolean;
}

export type ServiceMetricConfigurationRequest = Omit<
  ServiceMetricConfigurationInput,
  'displayOrder'
> & {
  displayPosition: number;
};

export interface UpdateServiceMetricConfigurationInput extends ServiceMetricConfigurationRequest {
  expectedRevision: number;
}

export interface ServiceDayObservationInput {
  metricId: number;
  countValue: number | null;
  booleanValue: boolean | null;
  timeValue: string | null;
}

export interface SaveServiceDayInput {
  pantryStatus: ServicePantryStatus;
  entryState: ServiceEntryState;
  observations: ServiceDayObservationInput[];
}

const normalizeMetricKey = (displayName: string): string => {
  const normalized = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 56);
  return /^[a-z]/.test(normalized) ? normalized : `metric_${normalized || 'custom'}`;
};

async function availableMetricKey(displayName: string, client: ReadClient): Promise<string> {
  const base = normalizeMetricKey(displayName);
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base.slice(0, 58)}_${suffix}`;
    const existing = await client.serviceMetricDefinition.findUnique({
      where: { metricKey: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw new ServiceLogError(
    'FEED could not create a stable identity for this metric. Change the name and try again.',
    'SERVICE_METRIC_KEY_UNAVAILABLE',
    409,
  );
}

const definitionDraft = (
  metricKey: string,
  input: ServiceMetricConfigurationInput,
): ServiceMetricDefinitionDraft => validateServiceMetricDefinition({ metricKey, ...input });

const requestDefinitionDraft = (
  metricKey: string,
  input: ServiceMetricConfigurationRequest,
  displayOrder: number,
): ServiceMetricDefinitionDraft => definitionDraft(metricKey, {
  displayName: input.displayName,
  description: input.description,
  iconName: input.iconName,
  valueType: input.valueType,
  unit: input.unit,
  semanticRole: input.semanticRole,
  contributesToOperationalTotal: input.contributesToOperationalTotal,
  capacityTarget: input.capacityTarget,
  effectiveStartDate: input.effectiveStartDate,
  effectiveEndDate: input.effectiveEndDate,
  displayOrder,
  isActive: input.isActive,
});

const revisionData = (
  definition: ServiceMetricDefinitionDraft,
  revision: number,
  createdBy: string | null,
) => ({
  revision,
  displayName: definition.displayName,
  description: definition.description,
  iconName: definition.iconName,
  valueType: definition.valueType,
  unit: definition.unit,
  semanticRole: definition.semanticRole,
  contributesToOperationalTotal: definition.contributesToOperationalTotal,
  capacityTarget: definition.capacityTarget,
  effectiveStartDate: definition.effectiveStartDate,
  effectiveEndDate: definition.effectiveEndDate,
  displayOrder: definition.displayOrder,
  isActive: definition.isActive,
  createdBy,
});

const currentMetricConfigurations = async (client: ReadClient) => {
  const definitions = await client.serviceMetricDefinition.findMany({
    include: {
      revisions: { orderBy: { revision: 'desc' } },
      _count: { select: { observations: true } },
    },
    orderBy: { metricKey: 'asc' },
  });

  return definitions
    .filter((definition) => definition.revisions[0])
    .sort((left, right) => (
      left.revisions[0].displayOrder - right.revisions[0].displayOrder
      || left.revisions[0].displayName.localeCompare(right.revisions[0].displayName)
      || left.id - right.id
    ));
};

export function placeServiceMetricAtPosition(
  currentMetricIds: number[],
  metricId: number,
  displayPosition: number,
): number[] {
  const metricAlreadyExists = currentMetricIds.includes(metricId);
  const maximumPosition = metricAlreadyExists
    ? currentMetricIds.length
    : currentMetricIds.length + 1;
  if (
    !Number.isSafeInteger(displayPosition)
    || displayPosition < 1
    || displayPosition > maximumPosition
  ) {
    throw new ServiceLogError(
      'The available Service metric positions changed. Refresh the page and choose a position again.',
      'SERVICE_METRIC_POSITION_CONFLICT',
      409,
    );
  }

  const reordered = currentMetricIds.filter((currentId) => currentId !== metricId);
  reordered.splice(displayPosition - 1, 0, metricId);
  return reordered;
}

const normalizedDisplayOrder = (index: number): number => (index + 1) * 10;

const revisionDefinitionDraft = (
  metricKey: string,
  revision: {
    displayName: string;
    description: string | null;
    iconName: string;
    valueType: string;
    unit: string;
    semanticRole: string;
    contributesToOperationalTotal: boolean;
    capacityTarget: number | null;
    effectiveStartDate: string;
    effectiveEndDate: string | null;
    isActive: boolean;
  },
  displayOrder: number,
): ServiceMetricDefinitionDraft => definitionDraft(metricKey, {
  displayName: revision.displayName,
  description: revision.description,
  iconName: revision.iconName,
  valueType: revision.valueType as ServiceMetricValueType,
  unit: revision.unit as ServiceMetricUnit,
  semanticRole: revision.semanticRole as ServiceMetricSemanticRole,
  contributesToOperationalTotal: revision.contributesToOperationalTotal,
  capacityTarget: revision.capacityTarget,
  effectiveStartDate: revision.effectiveStartDate,
  effectiveEndDate: revision.effectiveEndDate,
  displayOrder,
  isActive: revision.isActive,
});

export async function listServiceMetricConfigurations(client: ReadClient = prisma) {
  const definitions = await currentMetricConfigurations(client);
  return definitions.map((definition, index) => ({
    id: definition.id,
    metricKey: definition.metricKey,
    createdAt: definition.createdAt,
    currentRevision: definition.revisions[0],
    revisionCount: definition.revisions.length,
    hasObservations: definition._count.observations > 0,
    displayPosition: index + 1,
  }));
}

export async function createServiceMetricConfiguration(
  input: ServiceMetricConfigurationRequest,
  createdBy: string | null,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const currentMetrics = await currentMetricConfigurations(tx);
    const pendingMetricId = -1;
    const orderedIds = placeServiceMetricAtPosition(
      currentMetrics.map((metric) => metric.id),
      pendingMetricId,
      input.displayPosition,
    );
    const desiredOrders = new Map(orderedIds.map((id, index) => [id, normalizedDisplayOrder(index)]));

    for (const currentMetric of currentMetrics) {
      const latest = currentMetric.revisions[0];
      const displayOrder = desiredOrders.get(currentMetric.id)!;
      if (latest.displayOrder === displayOrder) continue;
      const definition = revisionDefinitionDraft(
        currentMetric.metricKey,
        latest,
        displayOrder,
      );
      await tx.serviceMetricDefinitionRevision.create({
        data: {
          metricId: currentMetric.id,
          ...revisionData(definition, latest.revision + 1, createdBy),
        },
      });
    }

    const metricKey = await availableMetricKey(input.displayName, tx);
    const definition = requestDefinitionDraft(
      metricKey,
      input,
      desiredOrders.get(pendingMetricId)!,
    );
    return tx.serviceMetricDefinition.create({
      data: {
        metricKey,
        revisions: { create: revisionData(definition, 1, createdBy) },
      },
      include: { revisions: true },
    });
  });
}

export async function updateServiceMetricConfiguration(
  metricId: number,
  input: UpdateServiceMetricConfigurationInput,
  createdBy: string | null,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const currentMetrics = await currentMetricConfigurations(tx);
    const metric = currentMetrics.find((candidate) => candidate.id === metricId);
    if (!metric) {
      throw new ServiceLogError(
        'This Service metric no longer exists. Refresh the page and try again.',
        'SERVICE_METRIC_NOT_FOUND',
        404,
      );
    }
    const latest = metric.revisions[0];
    if (latest.revision !== input.expectedRevision) {
      throw new ServiceLogError(
        'This Service metric changed after you opened it. Refresh the page before saving your changes.',
        'SERVICE_METRIC_REVISION_CONFLICT',
        409,
      );
    }

    const orderedIds = placeServiceMetricAtPosition(
      currentMetrics.map((candidate) => candidate.id),
      metricId,
      input.displayPosition,
    );
    const desiredOrders = new Map(orderedIds.map((id, index) => [id, normalizedDisplayOrder(index)]));
    let updatedRevision = null;

    for (const currentMetric of currentMetrics) {
      const currentRevision = currentMetric.revisions[0];
      const displayOrder = desiredOrders.get(currentMetric.id)!;
      if (currentMetric.id !== metricId && currentRevision.displayOrder === displayOrder) continue;

      const definition = currentMetric.id === metricId
        ? requestDefinitionDraft(currentMetric.metricKey, {
          ...input,
          valueType: latest.valueType as ServiceMetricValueType,
          unit: latest.unit as ServiceMetricUnit,
          semanticRole: latest.semanticRole as ServiceMetricSemanticRole,
        }, displayOrder)
        : revisionDefinitionDraft(currentMetric.metricKey, currentRevision, displayOrder);
      const revision = await tx.serviceMetricDefinitionRevision.create({
        data: {
          metricId: currentMetric.id,
          ...revisionData(definition, currentRevision.revision + 1, createdBy),
        },
      });
      if (currentMetric.id === metricId) updatedRevision = revision;
    }

    return updatedRevision!;
  });
}

async function effectiveMetricDefinitions(serviceDate: string, client: ReadClient) {
  const definitions = await client.serviceMetricDefinition.findMany({
    include: {
      revisions: {
        where: {
          effectiveStartDate: { lte: serviceDate },
          OR: [
            { effectiveEndDate: null },
            { effectiveEndDate: { gte: serviceDate } },
          ],
        },
        orderBy: { revision: 'desc' },
      },
    },
  });

  return definitions
    .map((definition) => ({ definition, revision: definition.revisions[0] }))
    .filter((entry): entry is {
      definition: typeof definitions[number];
      revision: NonNullable<typeof definitions[number]['revisions'][number]>;
    } => Boolean(entry.revision?.isActive))
    .sort((left, right) => (
      left.revision.displayOrder - right.revision.displayOrder
      || left.revision.displayName.localeCompare(right.revision.displayName)
    ));
}

async function effectiveCapacityPlan(serviceDate: string, client: ReadClient) {
  const plans = await client.serviceCapacityPlan.findMany({
    include: {
      revisions: {
        where: {
          effectiveStartDate: { lte: serviceDate },
          OR: [
            { effectiveEndDate: null },
            { effectiveEndDate: { gte: serviceDate } },
          ],
        },
        include: { targets: { orderBy: { displayOrder: 'asc' } } },
        orderBy: { revision: 'desc' },
      },
    },
  });
  const candidates = plans
    .map((plan) => ({ plan, revision: plan.revisions[0] }))
    .filter((entry) => entry.revision?.isActive)
    .sort((left, right) => (
      right.revision!.effectiveStartDate.localeCompare(left.revision!.effectiveStartDate)
    ));
  return candidates[0] ?? null;
}

const observationValue = (observation: {
  countValue: number | null;
  booleanValue: boolean | null;
  timeValue: string | null;
}) => ({
  countValue: observation.countValue,
  booleanValue: observation.booleanValue,
  timeValue: observation.timeValue,
});

const sameObservation = (
  current: {
    definitionRevisionId: number;
    recordState: string;
    entryState: string;
    countValue: number | null;
    booleanValue: boolean | null;
    timeValue: string | null;
  },
  desired: ServiceMetricObservationDraft,
  definitionRevisionId: number,
) => current.recordState === 'recorded'
  && current.definitionRevisionId === definitionRevisionId
  && current.entryState === desired.entryState
  && current.countValue === desired.countValue
  && current.booleanValue === desired.booleanValue
  && current.timeValue === desired.timeValue;

const clearedObservationSnapshotHash = (
  metricKey: string,
  definitionRevision: number,
  serviceDate: string,
  entryState: ServiceEntryState,
): string => createHash('sha256').update(JSON.stringify({
  source: 'feed_service_log',
  sourceRecordKey: `feed_service_log:${serviceDate}:${metricKey}`,
  metricKey,
  definitionRevision,
  serviceDate,
  recordState: 'cleared',
  entryState,
})).digest('hex');

export function summarizeOperationalTotal(metrics: Array<{
  contributesToOperationalTotal: boolean;
  observation: { countValue: number | null } | null;
}>) {
  const included = metrics.filter((metric) => metric.contributesToOperationalTotal);
  const recorded = included.filter((metric) => (
    metric.observation !== null && metric.observation.countValue !== null
  ));
  return {
    value: recorded.length > 0
      ? recorded.reduce((sum, metric) => sum + (metric.observation?.countValue ?? 0), 0)
      : null,
    recordedMetricCount: recorded.length,
    expectedMetricCount: included.length,
    complete: included.length > 0 && recorded.length === included.length,
  };
}

export async function getServiceDay(serviceDate: string, client: ReadClient = prisma) {
  validateServiceDayStatus({ serviceDate, pantryStatus: 'open', entryState: 'draft' });
  const effective = await effectiveMetricDefinitions(serviceDate, client);
  const metricIds = effective.map(({ definition }) => definition.id);
  const [observations, status, capacity] = await Promise.all([
    client.serviceMetricObservationRevision.findMany({
      where: {
        serviceDate,
        isCurrent: true,
        metricId: { in: metricIds },
      },
    }),
    client.serviceDayStatusRevision.findFirst({
      where: { serviceDate, isCurrent: true },
      orderBy: { revision: 'desc' },
    }),
    effectiveCapacityPlan(serviceDate, client),
  ]);
  const byMetric = new Map(observations.map((observation) => [observation.metricId, observation]));
  const metrics = effective.map(({ definition, revision }) => ({
    id: definition.id,
    metricKey: definition.metricKey,
    definitionRevisionId: revision.id,
    definitionRevision: revision.revision,
    displayName: revision.displayName,
    description: revision.description,
    iconName: revision.iconName,
    valueType: revision.valueType,
    unit: revision.unit,
    semanticRole: revision.semanticRole,
    contributesToOperationalTotal: revision.contributesToOperationalTotal,
    capacityTarget: revision.capacityTarget,
    displayOrder: revision.displayOrder,
    observation: byMetric.has(definition.id)
      && byMetric.get(definition.id)!.recordState === 'recorded'
      ? observationValue(byMetric.get(definition.id)!)
      : null,
  }));
  const observationEntryState = observations.find((observation) => (
    observation.recordState === 'recorded'
  ))?.entryState ?? observations[0]?.entryState;

  return {
    serviceDate,
    pantryStatus: (status?.pantryStatus ?? 'open') as ServicePantryStatus,
    entryState: (status?.entryState ?? observationEntryState ?? 'draft') as ServiceEntryState,
    dayRevision: status?.revision ?? 0,
    metrics,
    operationalTotal: summarizeOperationalTotal(metrics),
    capacityPlan: capacity ? {
      planKey: capacity.plan.planKey,
      revision: capacity.revision!.revision,
      displayName: capacity.revision!.displayName,
      description: capacity.revision!.description,
      timezone: capacity.revision!.timezone,
      targets: capacity.revision!.targets,
    } : null,
  };
}

export async function saveServiceDay(
  serviceDate: string,
  input: SaveServiceDayInput,
  recordedBy: string | null,
  client: PrismaClient = prisma,
) {
  validateServiceDayStatus({ serviceDate, pantryStatus: input.pantryStatus, entryState: input.entryState });
  return client.$transaction(async (tx) => {
    const effective = await effectiveMetricDefinitions(serviceDate, tx);
    const expectedIds = new Set(effective.map(({ definition }) => definition.id));
    const suppliedIds = new Set<number>();
    for (const observation of input.observations) {
      if (suppliedIds.has(observation.metricId)) {
        throw new ServiceLogError(
          'Each Service metric can be recorded only once per day.',
          'DUPLICATE_SERVICE_DAY_METRIC',
        );
      }
      suppliedIds.add(observation.metricId);
    }
    if (
      suppliedIds.size !== expectedIds.size
      || [...suppliedIds].some((metricId) => !expectedIds.has(metricId))
    ) {
      throw new ServiceLogError(
        'The configured Service fields changed. Refresh this day before saving.',
        'SERVICE_DAY_DEFINITION_CONFLICT',
        409,
      );
    }
    if (
      input.pantryStatus === 'closed'
      && input.observations.some((entry) => (
        entry.countValue !== null || entry.booleanValue !== null || entry.timeValue !== null
      ))
    ) {
      throw new ServiceLogError(
        'A closed pantry day cannot contain service observations. Clear the fields and save again.',
        'CLOSED_SERVICE_DAY_HAS_VALUES',
      );
    }

    const allExisting = await tx.serviceMetricObservationRevision.findMany({
      where: { serviceDate, metricId: { in: [...expectedIds] } },
      orderBy: { revision: 'desc' },
    });
    const currentByMetric = new Map(
      allExisting.filter((row) => row.isCurrent).map((row) => [row.metricId, row]),
    );
    const maxRevisionByMetric = new Map<number, number>();
    for (const row of allExisting) {
      maxRevisionByMetric.set(row.metricId, Math.max(maxRevisionByMetric.get(row.metricId) ?? 0, row.revision));
    }
    const desiredByMetric = new Map(input.observations.map((entry) => [entry.metricId, entry]));

    for (const { definition, revision } of effective) {
      const supplied = desiredByMetric.get(definition.id)!;
      const hasValue = supplied.countValue !== null
        || supplied.booleanValue !== null
        || supplied.timeValue !== null;
      const current = currentByMetric.get(definition.id);
      if (!hasValue) {
        if (!current) continue;
        if (
          current.recordState === 'cleared'
          && current.definitionRevisionId === revision.id
          && current.entryState === input.entryState
        ) continue;
        await tx.serviceMetricObservationRevision.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
        const nextRevision = (maxRevisionByMetric.get(definition.id) ?? 0) + 1;
        await tx.serviceMetricObservationRevision.create({
          data: {
            metricId: definition.id,
            definitionRevisionId: revision.id,
            source: 'feed_service_log',
            sourceRecordKey: `feed_service_log:${serviceDate}:${definition.metricKey}`,
            serviceDate,
            revision: nextRevision,
            snapshotHash: clearedObservationSnapshotHash(
              definition.metricKey,
              revision.revision,
              serviceDate,
              input.entryState,
            ),
            recordState: 'cleared',
            entryState: input.entryState,
            warningCodes: [],
            isCurrent: true,
            recordedBy,
          },
        });
        maxRevisionByMetric.set(definition.id, nextRevision);
        continue;
      }

      const draft = validateServiceMetricObservation({
        source: 'feed_service_log',
        sourceRecordKey: `feed_service_log:${serviceDate}:${definition.metricKey}`,
        metricKey: definition.metricKey,
        definitionRevision: revision.revision,
        serviceDate,
        valueType: revision.valueType as ServiceMetricValueType,
        countValue: supplied.countValue,
        booleanValue: supplied.booleanValue,
        timeValue: supplied.timeValue,
        entryState: input.entryState,
      });
      if (current && sameObservation(current, draft, revision.id)) continue;
      if (current) {
        await tx.serviceMetricObservationRevision.update({
          where: { id: current.id },
          data: { isCurrent: false },
        });
      }
      const nextRevision = (maxRevisionByMetric.get(definition.id) ?? 0) + 1;
      await tx.serviceMetricObservationRevision.create({
        data: {
          metricId: definition.id,
          definitionRevisionId: revision.id,
          source: draft.source,
          sourceRecordKey: draft.sourceRecordKey,
          serviceDate,
          revision: nextRevision,
          snapshotHash: serviceMetricObservationSnapshotHash(draft),
          countValue: draft.countValue,
          booleanValue: draft.booleanValue,
          timeValue: draft.timeValue,
          recordState: 'recorded',
          entryState: draft.entryState,
          warningCodes: [],
          isCurrent: true,
          recordedBy,
        },
      });
      maxRevisionByMetric.set(definition.id, nextRevision);
    }

    const currentStatus = await tx.serviceDayStatusRevision.findFirst({
      where: { serviceDate, isCurrent: true },
      orderBy: { revision: 'desc' },
    });
    if (
      !currentStatus
      || currentStatus.pantryStatus !== input.pantryStatus
      || currentStatus.entryState !== input.entryState
    ) {
      if (currentStatus) {
        await tx.serviceDayStatusRevision.update({
          where: { id: currentStatus.id },
          data: { isCurrent: false },
        });
      }
      const latestStatus = await tx.serviceDayStatusRevision.findFirst({
        where: { serviceDate },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });
      await tx.serviceDayStatusRevision.create({
        data: {
          serviceDate,
          revision: (latestStatus?.revision ?? 0) + 1,
          pantryStatus: input.pantryStatus,
          entryState: input.entryState,
          isCurrent: true,
          recordedBy,
        },
      });
    }
  }).then(() => getServiceDay(serviceDate, client));
}

const WTH_METRICS: Array<{
  metricKey: string;
  revisions: ServiceMetricConfigurationInput[];
}> = [
  {
    metricKey: 'shopping_visits',
    revisions: [
      { displayName: 'Visits', description: 'Households shopping in the food pantry.', iconName: 'shopping-basket', valueType: 'count', unit: 'households', semanticRole: 'served_household_method', contributesToOperationalTotal: true, capacityTarget: 75, effectiveStartDate: '2023-10-17', effectiveEndDate: '2025-10-31', displayOrder: 10, isActive: true },
      { displayName: 'Pantry Shopping Visits', description: 'Households shopping for themselves or others in the food pantry.', iconName: 'shopping-basket', valueType: 'count', unit: 'households', semanticRole: 'served_household_method', contributesToOperationalTotal: true, capacityTarget: 75, effectiveStartDate: '2025-11-01', effectiveEndDate: null, displayOrder: 10, isActive: true },
    ],
  },
  {
    metricKey: 'long_lists',
    revisions: [
      { displayName: 'Lists', description: 'Long shopping lists equivalent in quantity and variety to pantry shopping.', iconName: 'scroll-text', valueType: 'count', unit: 'households', semanticRole: 'served_household_method', contributesToOperationalTotal: true, capacityTarget: 25, effectiveStartDate: '2023-10-17', effectiveEndDate: '2025-10-31', displayOrder: 20, isActive: true },
      { displayName: 'Long Lists', description: 'Long shopping lists equivalent in quantity and variety to pantry shopping.', iconName: 'scroll-text', valueType: 'count', unit: 'households', semanticRole: 'served_household_method', contributesToOperationalTotal: true, capacityTarget: 25, effectiveStartDate: '2025-11-01', effectiveEndDate: null, displayOrder: 20, isActive: true },
    ],
  },
  {
    metricKey: 'premade_bags',
    revisions: [
      { displayName: 'Premade Bags', description: 'Ready-to-eat bags paired with a short list for three additional items.', iconName: 'paper-bag', valueType: 'count', unit: 'households', semanticRole: 'served_household_method', contributesToOperationalTotal: true, capacityTarget: 45, effectiveStartDate: '2023-10-17', effectiveEndDate: null, displayOrder: 30, isActive: true },
    ],
  },
  {
    metricKey: 'emergency_bags',
    revisions: [
      { displayName: 'Emergency Bags', description: 'Staple-food bags provided after capacity is reached or during the final 30 minutes of service.', iconName: 'heart-pulse', valueType: 'count', unit: 'households', semanticRole: 'served_household_method', contributesToOperationalTotal: true, capacityTarget: null, effectiveStartDate: '2025-11-01', effectiveEndDate: null, displayOrder: 40, isActive: true },
    ],
  },
  {
    metricKey: 'turned_away',
    revisions: [
      { displayName: 'Turned Away', description: 'Households unable to receive service after capacity was reached.', iconName: 'ban', valueType: 'count', unit: 'households', semanticRole: 'unmet_demand', contributesToOperationalTotal: false, capacityTarget: null, effectiveStartDate: '2024-05-01', effectiveEndDate: '2025-10-31', displayOrder: 50, isActive: true },
      { displayName: 'Turned Away', description: 'Retired when the emergency-bag program began.', iconName: 'ban', valueType: 'count', unit: 'households', semanticRole: 'unmet_demand', contributesToOperationalTotal: false, capacityTarget: null, effectiveStartDate: '2025-11-01', effectiveEndDate: null, displayOrder: 50, isActive: false },
    ],
  },
  {
    metricKey: 'capacity_reached_time',
    revisions: [
      { displayName: 'Time Capacity Was Reached', description: 'Time pantry capacity was reached for the service day.', iconName: 'circle-parking', valueType: 'time_of_day', unit: 'marker', semanticRole: 'capacity_marker', contributesToOperationalTotal: false, capacityTarget: null, effectiveStartDate: '2025-07-01', effectiveEndDate: null, displayOrder: 60, isActive: true },
    ],
  },
  {
    metricKey: 'camping_gear_requests',
    revisions: [
      { displayName: 'Camping Gear Requests', description: 'Requests for camping gear or related support.', iconName: 'tent-tree', valueType: 'count', unit: 'requests', semanticRole: 'ancillary_service', contributesToOperationalTotal: false, capacityTarget: null, effectiveStartDate: '2024-08-01', effectiveEndDate: null, displayOrder: 70, isActive: true },
    ],
  },
];

export async function seedWthServiceConfiguration(
  createdBy: string | null,
  client: PrismaClient = prisma,
) {
  return client.$transaction(async (tx) => {
    let metricsCreated = 0;
    let metricsSkipped = 0;
    const metricIds = new Map<string, number>();
    for (const preset of WTH_METRICS) {
      const existing = await tx.serviceMetricDefinition.findUnique({
        where: { metricKey: preset.metricKey },
        select: { id: true },
      });
      if (existing) {
        metricIds.set(preset.metricKey, existing.id);
        metricsSkipped += 1;
        continue;
      }
      const definitions = preset.revisions.map((revision) => definitionDraft(preset.metricKey, revision));
      const created = await tx.serviceMetricDefinition.create({
        data: {
          metricKey: preset.metricKey,
          revisions: {
            create: definitions.map((definition, index) => (
              revisionData(definition, index + 1, createdBy)
            )),
          },
        },
      });
      metricIds.set(preset.metricKey, created.id);
      metricsCreated += 1;
    }

    const existingPlan = await tx.serviceCapacityPlan.findUnique({ where: { planKey: 'wth_standard_pantry' } });
    let capacityPlanCreated = false;
    if (!existingPlan) {
      await tx.serviceCapacityPlan.create({
        data: {
          planKey: 'wth_standard_pantry',
          revisions: {
            create: {
              revision: 1,
              displayName: 'WTH standard pantry capacity',
              description: 'Reviewed daily capacity of 145 households across shopping, premade bags, and long lists.',
              timezone: 'America/Los_Angeles',
              effectiveStartDate: '2024-05-01',
              effectiveEndDate: null,
              isActive: true,
              createdBy,
              targets: {
                create: [
                  { targetKey: 'formal_households', displayName: 'Overall households', unit: 'households', targetValue: 145, metricId: null, displayOrder: 10 },
                  { targetKey: 'shopping_visits', displayName: 'Shopping visits', unit: 'households', targetValue: 75, metricId: metricIds.get('shopping_visits'), displayOrder: 20 },
                  { targetKey: 'premade_bags', displayName: 'Premade bags', unit: 'households', targetValue: 45, metricId: metricIds.get('premade_bags'), displayOrder: 30 },
                  { targetKey: 'long_lists', displayName: 'Long lists', unit: 'households', targetValue: 25, metricId: metricIds.get('long_lists'), displayOrder: 40 },
                ],
              },
            },
          },
        },
      });
      capacityPlanCreated = true;
    }

    return { metricsCreated, metricsSkipped, capacityPlanCreated };
  });
}
