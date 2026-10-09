// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { parseISO } from 'date-fns';
import { AlertTriangle, Eye, RotateCcw, SlidersHorizontal, Undo2 } from 'lucide-react';
import { PlusIcon } from '@/components/animate-ui/icons/plus';
import { createPageTitleIcon } from '@/components/layout/page-title-icon';
import { SectionHeader } from '@/components/shared/section-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { DatabaseIcon } from '@/components/ui/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TableActionMenu } from '@/components/ui/table-action-menu';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { useAuth } from '@/contexts/AuthContext';
import {
  dataImportService,
  type DataManagementCoverage,
  type ImportHistoryRecord,
} from '@/services/data-import';
import { procurementService } from '@/services/procurement';
import type {
  DataShapingCatalogEntry,
  DataShapingRule,
  ProcurementDataStatus,
} from '@/types/procurement';
import type { TableBulkAction } from '@/types/table';
import { DataCoverageStrip } from './coverage-strip';
import { DatabasePanel } from './database-panel';
import { DataShapingRuleDialog, type RuleDialogSeed } from './data-shaping-rule-dialog';
import { DataShapingRules } from './data-shaping-rules';
import { AddDataDialog } from './add-data/add-data-dialog';
import { DeploymentCapabilitiesPanel } from './deployment-capabilities-panel';
import { LottoQueuePanel } from './lotto-queue-panel';
import { BrandAssetStoragePanel } from './brand-asset-storage-panel';
import { formatDate, formatDateRange, formatDateTime } from '@/lib/formatting/date';

const PageTitleDataManagementIcon = createPageTitleIcon(DatabaseIcon);

type LifecycleAction = {
  mode: 'rollback' | 'restore';
  imports: ImportHistoryRecord[];
};

const sourceLabel = (source: string) => {
  if (source === 'ofb') return 'OFB Completed Orders';
  if (source === 'ofb_pickup') return 'OFB Agency Pickups';
  if (source === 'legacy_community') return 'Community Donations (historical)';
  if (source === 'link2feed') return 'Link2Feed';
  if (source === 'simc') return 'SIMC';
  if (source === 'wth_tracking') return 'WTH Tracking';
  if (source === 'lotto') return 'LOTTO';
  return source;
};

const datasetLabel = (record: ImportHistoryRecord) => {
  if (record.domain === 'procurement') return 'Procurement · Orders';
  if (record.datasetKind === 'operational_metrics') return 'Service · Operational metrics';
  if (record.datasetKind === 'visits') return 'Service · Visits';
  if (record.datasetKind === 'clients') return 'Service · Client profiles';
  if (record.datasetKind === 'queue_sessions') return 'Service · Queue sessions';
  return `Service · ${record.datasetKind.replace(/_/g, ' ')}`;
};

const recordCountLabel = (record: ImportHistoryRecord) =>
  `${record.recordCount.toLocaleString()} ${record.recordUnit}`;
// Dates come back as bare calendar days (`2026-06-02`). parseISO reads those
// in local time; `new Date()` would read them as UTC midnight and render the
// previous day west of Greenwich.
const dateLabel = (date: string) => formatDate(parseISO(date));
const eventLabel = (kind: string) => {
  if (kind === 'fresh_alliance_receipt') return 'Fresh Food Alliance Receipt';
  if (kind === 'community_donation_month') return 'Community Donation Month';
  return 'OFB Warehouse Order';
};

export function DataManagementWorkspace() {
  // Rollback, restore, and data-shaping rules are administrator actions
  // (ISSUES.md #50a) — the server refuses them for Staff. Hiding the controls
  // keeps a staff member from meeting a 403 they could not have predicted;
  // it is not the boundary, which lives on the route.
  const { isAdministrator } = useAuth();
  const [imports, setImports] = React.useState<ImportHistoryRecord[]>([]);
  const [status, setStatus] = React.useState<ProcurementDataStatus | null>(null);
  const [coverage, setCoverage] = React.useState<DataManagementCoverage | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [addDataOpen, setAddDataOpen] = React.useState(false);
  const [detailTarget, setDetailTarget] = React.useState<ImportHistoryRecord | null>(null);
  const [lifecycleAction, setLifecycleAction] = React.useState<LifecycleAction | null>(null);
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [rules, setRules] = React.useState<DataShapingRule[]>([]);
  const [ruleCatalog, setRuleCatalog] = React.useState<DataShapingCatalogEntry[]>([]);
  const [rulesLoading, setRulesLoading] = React.useState(true);
  const [ruleSeed, setRuleSeed] = React.useState<RuleDialogSeed | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = React.useState(false);
  const [ruleToDelete, setRuleToDelete] = React.useState<DataShapingRule | null>(null);
  const tableRef = React.useRef<{ clearSelection?: () => void }>(null);
  const addDataButtonRef = React.useRef<HTMLButtonElement>(null);

  const refresh = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const [loadedImports, loadedStatus, loadedCoverage] = await Promise.all([
        dataImportService.getHistory(),
        procurementService.getStatus(),
        dataImportService.getCoverage(),
      ]);
      setImports(loadedImports);
      setStatus(loadedStatus);
      setCoverage(loadedCoverage);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'dataImportHistory');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshRules = React.useCallback(async () => {
    try {
      setRulesLoading(true);
      const { rules: loaded, catalog } = await procurementService.getRules();
      setRules(loaded);
      setRuleCatalog(catalog);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'procurementDataRules');
    } finally {
      setRulesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
    void refreshRules();
  }, [refresh, refreshRules]);

  // Donors FEED has actually seen, offered when authoring a rule so staff pick
  // from what the source reported rather than retyping a name from memory.
  const donorSuggestions = React.useMemo(() => {
    const seen = new Map<string, { name: string; code: string | null }>();
    for (const record of imports) {
      if (record.details.kind !== 'procurement') continue;
      for (const order of record.details.orders) {
        if (!order.donorName) continue;
        if (!seen.has(order.donorName)) {
          seen.set(order.donorName, { name: order.donorName, code: order.donorCode });
        }
      }
    }
    return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [imports]);

  const openRuleDialog = React.useCallback((seed: RuleDialogSeed | null) => {
    setRuleSeed(seed);
    setRuleDialogOpen(true);
  }, []);

  const toggleRule = async (rule: DataShapingRule, enabled: boolean) => {
    try {
      await procurementService.updateRule(rule.id, { enabled });
      await refreshRules();
    } catch (error) {
      ErrorHandlerService.handleError(error, 'procurementDataRules');
    }
  };

  const confirmDeleteRule = async () => {
    if (!ruleToDelete) return;
    try {
      setIsUpdating(true);
      await procurementService.deleteRule(ruleToDelete.id);
      setRuleToDelete(null);
      await refreshRules();
      messageService.success('Rule removed. The observations it covered are counted again.');
    } catch (error) {
      ErrorHandlerService.handleError(error, 'procurementDataRules');
    } finally {
      setIsUpdating(false);
    }
  };

  const applyLifecycleAction = async () => {
    if (!lifecycleAction) return;
    try {
      setIsUpdating(true);
      const updated = await dataImportService.changeHistoryStatus(
        lifecycleAction.mode,
        lifecycleAction.imports.map(({ domain, id }) => ({ domain, id })),
      );
      setLifecycleAction(null);
      tableRef.current?.clearSelection?.();
      await refresh();
      if (updated === 0) {
        messageService.info(
          lifecycleAction.mode === 'rollback'
            ? 'The selected imports were already rolled back.'
            : 'The selected imports were already active.'
        );
      } else {
        messageService.success(
          lifecycleAction.mode === 'rollback'
            ? `Rolled back ${updated} import${updated === 1 ? '' : 's'}.`
            : `Restored ${updated} import${updated === 1 ? '' : 's'}.`
        );
      }
    } catch (error) {
      ErrorHandlerService.handleError(
        error,
        lifecycleAction.mode === 'rollback'
          ? 'dataImportRollback'
          : 'dataImportRestore'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  // A unified OFB upload produces two Procurement rows -- Warehouse and Fresh
  // Alliance remain separate source namespaces (D3). The cross-domain history
  // contract carries a related-upload key solely to explain that relationship.
  const pairedSourceByImportKey = React.useMemo(() => {
    const bySameUpload = new Map<string, ImportHistoryRecord[]>();
    for (const record of imports) {
      if (!record.relatedUploadKey) continue;
      const group = bySameUpload.get(record.relatedUploadKey) ?? [];
      group.push(record);
      bySameUpload.set(record.relatedUploadKey, group);
    }
    const result = new Map<string, string>();
    for (const group of bySameUpload.values()) {
      for (const record of group) {
        const sibling = group.find((other) => other.key !== record.key && other.source !== record.source);
        if (sibling) result.set(record.key, sourceLabel(sibling.source));
      }
    }
    return result;
  }, [imports]);

  const columns = React.useMemo<ColumnDef<ImportHistoryRecord>[]>(() => {
    const columnDefinitions: ColumnDef<ImportHistoryRecord>[] = [
    {
      accessorKey: 'source',
      header: 'Source',
      size: 170,
      cell: ({ row }) => {
        const pairedWith = pairedSourceByImportKey.get(row.original.key);
        return (
          <div className="min-w-0">
            <span className="font-medium">{sourceLabel(row.original.source)}</span>
            <p className="text-xs text-muted-foreground">{datasetLabel(row.original)}</p>
            {pairedWith && (
              <p className="text-xs text-muted-foreground">
                Paired with {pairedWith}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: 'dateRange',
      header: 'Data Dates',
      size: 220,
      cell: ({ row }) => row.original.rangeStart && row.original.rangeEnd
        ? formatDateRange(parseISO(row.original.rangeStart), parseISO(row.original.rangeEnd))
        : 'Not reported',
    },
    {
      accessorKey: 'recordCount',
      header: 'Records',
      size: 135,
      cell: ({ row }) => recordCountLabel(row.original),
    },
    {
      accessorKey: 'warningCount',
      header: 'Warnings',
      size: 110,
      cell: ({ row }) => row.original.warningCount > 0
        ? <Badge variant="outline">{row.original.warningCount}</Badge>
        : 'None',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      size: 120,
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'secondary' : 'outline'}>
          {row.original.status === 'active' ? 'Active' : 'Rolled Back'}
        </Badge>
      ),
    },
    {
      accessorKey: 'importedAt',
      header: 'Imported',
      size: 170,
      cell: ({ row }) => formatDateTime(row.original.importedAt),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableHiding: false,
      size: 72,
      // No `justify-end` wrapper. The header is the plain string 'Actions',
      // which renders left-aligned, so pushing the trigger to the right edge
      // left the label and the button visibly out of line. Every other table in
      // the app pairs a plain header with an unwrapped trigger; the one that
      // right-aligns (food items) right-aligns its header too. Alignment has to
      // be decided for the column, not for one half of it.
      cell: ({ row }) => (
        <TableActionMenu
          size="sm"
          triggerLabel={`Open actions for ${sourceLabel(row.original.source)} import`}
          actions={[
            {
              label: 'View Details',
              icon: Eye,
              onClick: () => setDetailTarget(row.original),
            },
            ...(isAdministrator
              ? [
                  ...(row.original.domain === 'procurement' ? [{
                    // An import is something you can reshape after the fact,
                    // not only roll back (D20). Seeded with this import's
                    // source and window so the rule starts where the user is
                    // looking.
                    label: 'Shape Data',
                    icon: SlidersHorizontal,
                    onClick: () => openRuleDialog({
                      scope: 'donor',
                      source: row.original.source,
                      startDate: row.original.rangeStart ?? undefined,
                      endDate: row.original.rangeEnd ?? undefined,
                    }),
                  }] : []),
                  row.original.status === 'active'
                    ? {
                        label: 'Rollback',
                        icon: Undo2,
                        variant: 'destructive' as const,
                        onClick: () => setLifecycleAction({ mode: 'rollback', imports: [row.original] }),
                      }
                    : {
                        label: 'Restore Import',
                        icon: RotateCcw,
                        onClick: () => setLifecycleAction({ mode: 'restore', imports: [row.original] }),
                      },
                ]
              : []),
          ]}
        />
      ),
    },
    ];


    return columnDefinitions;
  }, [isAdministrator, openRuleDialog, pairedSourceByImportKey]);

  const bulkActions = React.useMemo<TableBulkAction<ImportHistoryRecord>[]>(() => (
    !isAdministrator ? [] : [
    {
      label: 'Rollback Active Imports',
      icon: Undo2,
      variant: 'destructive',
      action: (selected) => {
        const active = selected.filter((record) => record.status === 'active');
        if (active.length === 0) {
          messageService.info('The selected imports are already rolled back.');
          return;
        }
        setLifecycleAction({ mode: 'rollback', imports: active });
      },
    },
    {
      label: 'Restore Rolled-Back Imports',
      icon: RotateCcw,
      action: (selected) => {
        const rolledBack = selected.filter((record) => record.status === 'rolled_back');
        if (rolledBack.length === 0) {
          messageService.info('The selected imports are already active.');
          return;
        }
        setLifecycleAction({ mode: 'restore', imports: rolledBack });
      },
    },
  ]), [isAdministrator]);

  // One definition, rendered by whichever branch applies below. Duplicating
  // the JSX would double every future edit — and every type error in it.
  const dataContent = (
    <>
    <DataCoverageStrip
      status={status}
      serviceCoverage={coverage}
      formatDate={dateLabel}
    />

    <DeploymentCapabilitiesPanel isAdministrator={isAdministrator} />

    {isAdministrator ? <BrandAssetStoragePanel /> : null}

    <LottoQueuePanel isAdministrator={isAdministrator} />

    {status?.isStale && status.latestDeliveryDate && (
      <Alert variant="warning" className="items-start">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <AlertTitle>Procurement data may be out of date</AlertTitle>
          <AlertDescription>
            The most recent observation FEED holds is from {dateLabel(status.latestDeliveryDate)}. Importing a current export will refresh Procurement Analytics.
          </AlertDescription>
        </div>
      </Alert>
    )}

    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Imported Data</CardTitle>
        <CardDescription>
          Add and manage data imported from Link2Feed, SIMC, Oregon Food Bank Primarius.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DataShapingRules
          rules={rules}
          isLoading={rulesLoading}
          onAdd={() => openRuleDialog(null)}
          onEdit={(rule) => openRuleDialog({ rule })}
          onToggle={(rule, enabled) => void toggleRule(rule, enabled)}
          onDelete={setRuleToDelete}
          canManage={isAdministrator}
        />
        <EnhancedDataTable
          ref={tableRef}
          columns={columns}
          data={imports}
          isLoading={isLoading}
          filterColumn="source"
          filterPlaceholder="Filter imports..."
          enableColumnVisibility
          defaultPageSize={5}
          selection={{
            enabled: true,
            selectionColumn: true,
            bulkActions,
          }}
          toolbarActions={[
            {
              // All staff retain the established procurement import capability.
              // The modal identifies Service files locally, then explains the
              // administrator boundary before any protected upload is attempted.
              label: 'Add Data',
              icon: PlusIcon,
              variant: 'default' as const,
              action: () => setAddDataOpen(true),
              title: 'Detect and import an external data file',
              buttonRef: addDataButtonRef,
            },
          ]}
        />
      </CardContent>
    </Card>

    </>
  );

  return (
    <div className="space-y-6 min-w-0 w-full pt-6">
      <SectionHeader
        title="Data Management"
        description="Import external data, download and restore database backups."
        icon={PageTitleDataManagementIcon}
      />

      {/* Staff see only the Data content and no tab strip: a single tab
          is chrome without a choice. Administrators also get Database, whose
          actions the server gates independently of this rendering. */}
      {isAdministrator ? (
        <Tabs defaultValue="data">
          <TabsList>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
          </TabsList>

          <TabsContents>
            <TabsContent value="data" className="space-y-6 pt-4">
              {dataContent}
            </TabsContent>

            <TabsContent value="database" className="pt-4">
              <DatabasePanel />
            </TabsContent>
          </TabsContents>
        </Tabs>
      ) : (
        <div className="space-y-6">{dataContent}</div>
      )}

      <AddDataDialog
        open={addDataOpen}
        onOpenChange={setAddDataOpen}
        isAdministrator={isAdministrator}
        onImported={refresh}
        returnFocusRef={addDataButtonRef}
      />

      <DataShapingRuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        catalog={ruleCatalog}
        seed={ruleSeed}
        donorSuggestions={donorSuggestions}
        onSaved={refreshRules}
      />

      <AlertDialog open={ruleToDelete !== null} onOpenChange={(open) => !open && setRuleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              Nothing that was imported changes. The observations this rule covered simply stop
              carrying its flag, so any total that had honored it will include them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRule} disabled={isUpdating}>
              Remove Rule
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={detailTarget !== null} onOpenChange={(open) => !open && setDetailTarget(null)}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>Import Details</DialogTitle>
            <DialogDescription>
              Normalized provenance retained after the source CSV was discarded.
            </DialogDescription>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Source</dt><dd className="font-medium">{sourceLabel(detailTarget.source)}</dd></div>
                <div><dt className="text-muted-foreground">Data type</dt><dd className="font-medium">{datasetLabel(detailTarget)}</dd></div>
                <div><dt className="text-muted-foreground">Source rows</dt><dd className="font-medium">{detailTarget.sourceRowCount.toLocaleString()}</dd></div>
                <div><dt className="text-muted-foreground">Imported records</dt><dd className="font-medium">{recordCountLabel(detailTarget)}</dd></div>
                <div><dt className="text-muted-foreground">Warnings</dt><dd className="font-medium">{detailTarget.warningCount}</dd></div>
                {detailTarget.rangeStart && detailTarget.rangeEnd && (
                  <div>
                    <dt className="text-muted-foreground">Data dates</dt>
                    <dd className="font-medium">
                      {formatDateRange(parseISO(detailTarget.rangeStart), parseISO(detailTarget.rangeEnd))}
                    </dd>
                  </div>
                )}
                {pairedSourceByImportKey.get(detailTarget.key) && (
                  <div className="col-span-2 sm:col-span-3">
                    <dt className="text-muted-foreground">From the same export as</dt>
                    <dd className="font-medium">{pairedSourceByImportKey.get(detailTarget.key)}</dd>
                  </div>
                )}
              </dl>
              {detailTarget.details.kind === 'procurement' ? (
                <ScrollArea className="h-72 rounded-md border">
                  <div className="space-y-3 p-4">
                    {detailTarget.details.warnings.map((warning, index) => (
                      <div key={`${warning.code}-${warning.deliveryDate}-${index}`} className="border-b pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{warning.code.replace(/_/g, ' ')}</Badge>
                          <span className="text-sm font-medium">{dateLabel(warning.deliveryDate)}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{warning.message}</p>
                      </div>
                    ))}
                    {detailTarget.details.orders.map((order) => (
                      <div key={order.id} className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0 last:pb-0">
                        <div>
                          <p className="font-medium">{eventLabel(order.eventKind)} {order.sourceOrderReference}</p>
                          <p className="text-sm text-muted-foreground">
                            {dateLabel(order.deliveryDate)} · {order.lineCount} lines · Revision {order.revision}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {order.isCurrent && <Badge variant="secondary">Current</Badge>}
                          {order.warningCodes.map((code) => (
                            <Badge key={code} variant="outline">{code.replace(/_/g, ' ')}</Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="space-y-4">
                  <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                    <div><dt className="text-muted-foreground">Visits</dt><dd className="font-medium">{detailTarget.details.encounterRevisionCount.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Household profiles</dt><dd className="font-medium">{detailTarget.details.clientProfileRevisionCount.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Person profiles</dt><dd className="font-medium">{detailTarget.details.personProfileRevisionCount.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Operational observations</dt><dd className="font-medium">{detailTarget.details.metricObservationRevisionCount.toLocaleString()}</dd></div>
                    <div><dt className="text-muted-foreground">Quality findings</dt><dd className="font-medium">{detailTarget.details.qualityIssueCount.toLocaleString()}</dd></div>
                  </dl>
                  {detailTarget.details.qualityGroups.length > 0 ? (
                    <ScrollArea className="h-52 rounded-md border">
                      <div className="space-y-3 p-4">
                        {detailTarget.details.qualityGroups.map((group) => (
                          <div key={`${group.code}-${group.severity}`} className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{group.code.replace(/_/g, ' ')}</Badge>
                              <span className="text-sm capitalize text-muted-foreground">{group.severity}</span>
                            </div>
                            <span className="font-medium tabular-nums">{group.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="rounded-md border p-4 text-sm text-muted-foreground">
                      No retained quality findings for this import.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={lifecycleAction !== null} onOpenChange={(open) => !open && setLifecycleAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lifecycleAction?.mode === 'rollback' ? 'Rollback selected import data?' : 'Restore selected import data?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lifecycleAction?.mode === 'rollback'
                ? 'The normalized records remain in audit history, but their revisions will stop contributing to Analytics. Previous active revisions are restored automatically.'
                : 'The selected import records will become active again. Newer active revisions continue to take precedence.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void applyLifecycleAction()} disabled={isUpdating}>
              {isUpdating
                ? 'Updating…'
                : lifecycleAction?.mode === 'rollback' ? 'Rollback Import' : 'Restore Import'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
