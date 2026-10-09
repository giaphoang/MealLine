// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { ServiceMetricsSettings } from '@/components/service-metrics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { createPageTitleIcon } from '@/components/layout/page-title-icon';
import { SectionHeader } from '@/components/shared/section-header';
import { Loader2 } from '@/components/ui/icons';
import { UsersRoundIcon } from '@/components/ui/users-round';
import { useAuth } from '@/contexts/AuthContext';
import { useTerminology } from '@/contexts/TerminologyContext';
import { useMessage } from '@/hooks/message/useMessage';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { settingsService } from '@/services/settings';
import {
  serviceApi,
  type SaveServiceDayInput,
  type ServiceDay,
  type ServiceMetricDayDefinition,
  type ServicePantryStatus,
} from '@/services/service';
import { DEFAULT_OPERATING_HOURS_SETTINGS } from '@/types/settings';
import { getIconComponent } from '@/lib/icon-library';
import { cn } from '@/lib/utils';
import { ServiceDateNavigator } from './service-date-navigator';
import { dateInTimezone } from './service-date';

type EntryValue = {
  countValue: string;
  booleanValue: '' | 'true' | 'false';
  timeValue: string;
};

const PageTitleUsersRoundIcon = createPageTitleIcon(UsersRoundIcon);

const valueFromMetric = (metric: ServiceMetricDayDefinition): EntryValue => ({
  countValue: metric.observation?.countValue?.toString() ?? '',
  booleanValue: metric.observation?.booleanValue === null || metric.observation?.booleanValue === undefined
    ? ''
    : metric.observation.booleanValue ? 'true' : 'false',
  timeValue: metric.observation?.timeValue ?? '',
});

const unitLabel = (metric: ServiceMetricDayDefinition) => {
  if (metric.valueType === 'boolean') return 'Yes or no';
  if (metric.valueType === 'time_of_day') return 'Time';
  return metric.unit[0].toUpperCase() + metric.unit.slice(1);
};

interface MetricFieldProps {
  metric: ServiceMetricDayDefinition;
  value: EntryValue;
  disabled: boolean;
  onChange: (value: EntryValue) => void;
}

function MetricField({ metric, value, disabled, onChange }: MetricFieldProps) {
  const Icon = getIconComponent(metric.iconName);
  return (
    <div className="flex h-full flex-col rounded-md border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
            data-testid={`service-metric-icon-${metric.id}`}
          />
          <div className="min-w-0">
            <Label htmlFor={`service-metric-${metric.id}`} className="wrap-break-word">
              {metric.displayName}
            </Label>
            {metric.description && (
              <p className="mt-1 text-xs text-muted-foreground wrap-break-word">{metric.description}</p>
            )}
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0">{unitLabel(metric)}</Badge>
      </div>

      <div className="mt-auto pt-4">
        {metric.valueType === 'count' && (
          <Input
            id={`service-metric-${metric.id}`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value.countValue}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, countValue: event.target.value })}
          />
        )}
        {metric.valueType === 'boolean' && (
          <Select
            value={value.booleanValue || 'not_recorded'}
            disabled={disabled}
            onValueChange={(next) => onChange({
              ...value,
              booleanValue: next === 'not_recorded' ? '' : next as 'true' | 'false',
            })}
          >
            <SelectTrigger id={`service-metric-${metric.id}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_recorded">Not recorded</SelectItem>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        )}
        {metric.valueType === 'time_of_day' && (
          <Input
            id={`service-metric-${metric.id}`}
            type="time"
            value={value.timeValue}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, timeValue: event.target.value })}
          />
        )}
      </div>
    </div>
  );
}

interface MetricSectionProps {
  sectionKey: 'service' | 'capacity' | 'other';
  title: string;
  description?: string;
  metrics: ServiceMetricDayDefinition[];
  values: Record<number, EntryValue>;
  disabled: boolean;
  onChange: (metricId: number, value: EntryValue) => void;
}

function MetricSection({
  sectionKey,
  title,
  description,
  metrics,
  values,
  disabled,
  onChange,
}: MetricSectionProps) {
  if (metrics.length === 0) return null;
  return (
    <Card
      className={cn(metrics.length >= 3 && 'lg:col-span-2')}
      data-testid={`service-metric-section-${sectionKey}`}
    >
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn('grid gap-4', metrics.length >= 2 && 'sm:grid-cols-2')}>
        {metrics.map((metric) => (
          <MetricField
            key={metric.id}
            metric={metric}
            value={values[metric.id]}
            disabled={disabled}
            onChange={(value) => onChange(metric.id, value)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

const sectionForRole = (role: ServiceMetricDayDefinition['semanticRole']) => {
  if (role === 'served_household_method') return 'service';
  if (role === 'unmet_demand' || role === 'capacity_marker') return 'capacity';
  return 'other';
};

export function ServiceLogWorkspace() {
  const terminology = useTerminology();
  const defaultToday = dateInTimezone(DEFAULT_OPERATING_HOURS_SETTINGS.timezone);
  const [serviceDate, setServiceDate] = React.useState(defaultToday);
  const [operatingHours, setOperatingHours] = React.useState(DEFAULT_OPERATING_HOURS_SETTINGS);
  const [day, setDay] = React.useState<ServiceDay | null>(null);
  const [values, setValues] = React.useState<Record<number, EntryValue>>({});
  const [pantryStatus, setPantryStatus] = React.useState<ServicePantryStatus>('open');
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const { isAdministrator } = useAuth();
  const { showSuccess } = useMessage();

  React.useEffect(() => {
    let active = true;
    settingsService.getOperatingHours()
      .then((loaded) => {
        if (!active) return;
        setOperatingHours(loaded);
        setServiceDate((current) => current === defaultToday
          ? dateInTimezone(loaded.timezone)
          : current);
      })
      .catch((error) => ErrorHandlerService.handleError(error, 'ServiceLog.loadOperatingHours'));
    return () => { active = false; };
  }, [defaultToday]);

  const loadDay = React.useCallback(async (date: string) => {
    setIsLoading(true);
    try {
      const loaded = await serviceApi.getDay(date);
      setDay(loaded);
      setPantryStatus(loaded.pantryStatus);
      setValues(Object.fromEntries(loaded.metrics.map((metric) => [metric.id, valueFromMetric(metric)])));
    } catch (error) {
      ErrorHandlerService.handleError(error, 'ServiceLog.loadDay');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => { void loadDay(serviceDate); }, [loadDay, serviceDate]);

  const refreshMetricDefinitions = React.useCallback(async () => {
    try {
      const loaded = await serviceApi.getDay(serviceDate);
      setDay(loaded);
      setValues((current) => Object.fromEntries(loaded.metrics.map((metric) => [
        metric.id,
        current[metric.id] ?? valueFromMetric(metric),
      ])));
    } catch (error) {
      ErrorHandlerService.handleError(error, 'ServiceLog.refreshMetricDefinitions');
    }
  }, [serviceDate]);

  const updateValue = (metricId: number, value: EntryValue) => {
    setValues((current) => ({ ...current, [metricId]: value }));
  };

  const changePantryStatus = (status: ServicePantryStatus) => {
    setPantryStatus(status);
    if (status === 'closed') {
      setValues((current) => Object.fromEntries(
        Object.keys(current).map((metricId) => [Number(metricId), {
          countValue: '',
          booleanValue: '',
          timeValue: '',
        }]),
      ));
    }
  };

  const save = async () => {
    if (!day) return;
    setIsSaving(true);
    const observations: SaveServiceDayInput['observations'] = day.metrics.map((metric) => {
      const value = values[metric.id] ?? { countValue: '', booleanValue: '', timeValue: '' };
      return {
        metricId: metric.id,
        countValue: metric.valueType === 'count' && value.countValue !== ''
          ? Number(value.countValue)
          : null,
        booleanValue: metric.valueType === 'boolean' && value.booleanValue !== ''
          ? value.booleanValue === 'true'
          : null,
        timeValue: metric.valueType === 'time_of_day' && value.timeValue !== ''
          ? value.timeValue
          : null,
      };
    });
    try {
      const saved = await serviceApi.saveDay(serviceDate, {
        pantryStatus,
        entryState: 'finalized',
        observations,
      });
      setDay(saved);
      setValues(Object.fromEntries(saved.metrics.map((metric) => [metric.id, valueFromMetric(metric)])));
      showSuccess('Service day saved');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'ServiceLog.saveDay');
    } finally {
      setIsSaving(false);
    }
  };

  const groups = React.useMemo(() => {
    const result: Record<'service' | 'capacity' | 'other', ServiceMetricDayDefinition[]> = {
      service: [],
      capacity: [],
      other: [],
    };
    for (const metric of day?.metrics ?? []) result[sectionForRole(metric.semanticRole)].push(metric);
    return result;
  }, [day]);

  const operationalValues = (day?.metrics ?? [])
    .filter((metric) => metric.contributesToOperationalTotal)
    .map((metric) => values[metric.id]?.countValue ?? '')
    .filter((value) => value !== '');
  const operationalTotal = operationalValues.length > 0
    ? operationalValues.reduce((sum, value) => sum + Number(value), 0)
    : null;
  const capacityMetricIds = new Set(
    day?.capacityPlan?.targets.flatMap((target) => target.metricId === null ? [] : [target.metricId]) ?? [],
  );
  const regularCapacityValues = (day?.metrics ?? [])
    .filter((metric) => capacityMetricIds.has(metric.id))
    .map((metric) => values[metric.id]?.countValue ?? '')
    .filter((value) => value !== '');
  const regularCapacityCount = regularCapacityValues
    .reduce((sum, value) => sum + Number(value), 0);
  const overallCapacity = day?.capacityPlan?.targets.find((target) => target.metricId === null)?.targetValue ?? null;

  return (
    <div className="space-y-6 min-w-0 w-full pt-6">
      <SectionHeader
        title="Service Log"
        description={terminology.format('Record the shared operational details for one {pantry} service day.')}
        icon={PageTitleUsersRoundIcon}
      />

      <div className="grid gap-4 md:grid-cols-2 md:items-end">
        <ServiceDateNavigator
          value={serviceDate}
          today={dateInTimezone(operatingHours.timezone)}
          hours={operatingHours.hours}
          onChange={setServiceDate}
        />
        <div className="space-y-2">
          <Label>{terminology.format('{Pantry} status')}</Label>
          <Select value={pantryStatus} onValueChange={(value) => changePantryStatus(value as ServicePantryStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-40 items-center justify-center" aria-live="polite">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : day && day.metrics.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No Service fields are configured for this date</CardTitle>
            <CardDescription>
              {isAdministrator
                ? 'Configure the organization’s Service metrics before recording this day.'
                : 'Ask an administrator to configure the organization’s Service metrics.'}
            </CardDescription>
          </CardHeader>
          {isAdministrator && (
            <CardContent><Button asChild><a href="#service-metrics">Configure Service Metrics</a></Button></CardContent>
          )}
        </Card>
      ) : day ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Operational households served</CardDescription>
                <CardTitle>{operationalTotal === null ? 'Not recorded' : operationalTotal.toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {operationalValues.length} of {day.operationalTotal.expectedMetricCount} included methods recorded
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>{terminology.format('Regular {pantry} capacity')}</CardDescription>
                <CardTitle>
                  {overallCapacity === null
                    ? 'Not configured'
                    : regularCapacityValues.length === 0
                      ? 'Not recorded'
                      : `${regularCapacityCount.toLocaleString()} / ${overallCapacity.toLocaleString()}`}
                </CardTitle>
              </CardHeader>
              {day.capacityPlan && (
                <CardContent className="text-xs text-muted-foreground">{day.capacityPlan.displayName}</CardContent>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <MetricSection
              sectionKey="service"
              title="Service Provided"
              description="Household counts by service method"
              metrics={groups.service}
              values={values}
              disabled={pantryStatus === 'closed'}
              onChange={updateValue}
            />
            <MetricSection
              sectionKey="capacity"
              title="Capacity and Demand"
              description="Operational pressure that does not count as households served."
              metrics={groups.capacity}
              values={values}
              disabled={pantryStatus === 'closed'}
              onChange={updateValue}
            />
            <MetricSection
              sectionKey="other"
              title="Other Services and Requests"
              description="Special items or irregular service types."
              metrics={groups.other}
              values={values}
              disabled={pantryStatus === 'closed'}
              onChange={updateValue}
            />
          </div>

          <div className="flex justify-end">
            <Button disabled={isSaving} onClick={save}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </>
      ) : null}

      {isAdministrator && (
        <>
          <Separator />
          <ServiceMetricsSettings onMetricsChanged={refreshMetricDefinitions} />
        </>
      )}
    </div>
  );
}
