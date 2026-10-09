// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import { Plus, Settings2 } from '@/components/ui/icons';
import { useMessage } from '@/hooks/message/useMessage';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import {
  serviceApi,
  type ServiceMetricConfiguration,
  type ServiceMetricConfigurationInput,
} from '@/services/service';
import { serviceMetricColumns } from './columns';
import { MetricDialog } from './metric-dialog';

interface ServiceMetricsSettingsProps {
  onMetricsChanged?: () => Promise<void> | void;
}

export function ServiceMetricsSettings({ onMetricsChanged }: ServiceMetricsSettingsProps = {}) {
  const [metrics, setMetrics] = React.useState<ServiceMetricConfiguration[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingMetric, setEditingMetric] = React.useState<ServiceMetricConfiguration | null>(null);
  const { showSuccess } = useMessage();

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      setMetrics(await serviceApi.listMetrics());
    } catch (error) {
      ErrorHandlerService.handleError(error, 'ServiceMetrics.load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const openAdd = () => {
    setEditingMetric(null);
    setDialogOpen(true);
  };

  const openEdit = React.useCallback((metric: ServiceMetricConfiguration) => {
    setEditingMetric(metric);
    setDialogOpen(true);
  }, []);

  const saveMetric = async (input: ServiceMetricConfigurationInput) => {
    setIsSaving(true);
    try {
      let successMessage: string;
      if (editingMetric) {
        await serviceApi.updateMetric(editingMetric.id, {
          ...input,
          expectedRevision: editingMetric.currentRevision.revision,
        });
        successMessage = 'Service metric revision saved';
      } else {
        await serviceApi.createMetric(input);
        successMessage = 'Service metric added';
      }
      setDialogOpen(false);
      await Promise.all([load(), onMetricsChanged?.()]);
      showSuccess(successMessage);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'ServiceMetrics.save');
    } finally {
      setIsSaving(false);
    }
  };

  const seedDefaults = async () => {
    setIsSaving(true);
    try {
      const result = await serviceApi.seedWthDefaults();
      const successMessage = result.metricsCreated === 0 && !result.capacityPlanCreated
        ? 'WTH Service defaults are already configured'
        : `Configured ${result.metricsCreated} WTH Service ${result.metricsCreated === 1 ? 'metric' : 'metrics'}`;
      await Promise.all([load(), onMetricsChanged?.()]);
      showSuccess(successMessage);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'ServiceMetrics.seedWthDefaults');
    } finally {
      setIsSaving(false);
    }
  };

  const columns = React.useMemo(() => serviceMetricColumns(openEdit), [openEdit]);
  return (
    <>
      <section
        id="service-metrics"
        aria-labelledby="service-metrics-heading"
        className="scroll-mt-24 space-y-4"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <h3
              id="service-metrics-heading"
              className="flex items-center gap-2 text-lg font-semibold"
            >
              <Settings2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Service Metrics
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure the shared fields staff record in the daily Service Log.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {metrics.length === 0 && (
              <Button variant="outline" onClick={seedDefaults} disabled={isSaving}>
                Configure WTH Defaults
              </Button>
            )}
            <Button onClick={openAdd} disabled={isSaving}>
              <Plus className="mr-2 h-4 w-4" />
              Add Metric
            </Button>
          </div>
        </div>

        <EnhancedDataTable
          columns={columns}
          data={metrics}
          isLoading={isLoading}
          filterColumn="name"
          filterPlaceholder="Filter Service metrics…"
          enableColumnVisibility
          enableFiltering
          emptyMessage="No Service metrics are configured yet."
        />
      </section>

      <MetricDialog
        open={dialogOpen}
        metric={editingMetric}
        metricCount={metrics.length}
        isSaving={isSaving}
        onOpenChange={setDialogOpen}
        onSave={saveMetric}
      />
    </>
  );
}
