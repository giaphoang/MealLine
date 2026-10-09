// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { parseISO } from 'date-fns';
import { AlertTriangle, Check, RefreshCw, Settings2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SortableHeader } from '@/components/ui/sortable-header';
import { TableActionMenu } from '@/components/ui/table-action-menu';
import { Textarea } from '@/components/ui/textarea';
import { formatDate, formatDateTime } from '@/lib/formatting/date';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { serviceApi, type LottoQueueDisposition, type LottoQueueSession, type LottoQueueStatus } from '@/services/service';

const dispositionLabel: Record<LottoQueueDisposition, string> = {
  needs_review: 'Needs review', included_service: 'Include as service',
  excluded_test: 'Exclude as test', excluded_duplicate: 'Exclude as duplicate',
  excluded_other: 'Exclude for another reason',
};

export function LottoQueuePanel({ isAdministrator }: { isAdministrator: boolean }) {
  const [status, setStatus] = React.useState<LottoQueueStatus | null>(null);
  const [sessions, setSessions] = React.useState<LottoQueueSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [configOpen, setConfigOpen] = React.useState(false);
  const [baseUrl, setBaseUrl] = React.useState('');
  const [token, setToken] = React.useState('');
  const [review, setReview] = React.useState<LottoQueueSession | null>(null);
  const [disposition, setDisposition] = React.useState<LottoQueueDisposition>('included_service');
  const [reason, setReason] = React.useState('');

  const refresh = React.useCallback(async () => {
    try {
      const [nextStatus, nextSessions] = await Promise.all([
        serviceApi.getLottoStatus(), serviceApi.listLottoSessions(),
      ]);
      setStatus(nextStatus); setSessions(nextSessions);
      if (nextStatus.config?.baseUrl) setBaseUrl(nextStatus.config.baseUrl);
    } catch (error) { ErrorHandlerService.handleError(error, 'lottoQueueData'); }
    finally { setLoading(false); }
  }, []);
  React.useEffect(() => { void refresh(); }, [refresh]);

  const sync = async () => {
    try {
      setSyncing(true);
      const result = await serviceApi.syncLotto();
      await refresh();
      messageService.success(
        result.inserted === 0
          ? 'LOTTO is already synchronized.'
          : `Synchronized ${result.inserted} LOTTO session${result.inserted === 1 ? '' : 's'}; ${result.review} await review.`,
      );
    } catch (error) { ErrorHandlerService.handleError(error, 'lottoQueueSync'); }
    finally { setSyncing(false); }
  };

  const saveConfig = async () => {
    try {
      const result = await serviceApi.saveLottoConfig(baseUrl, token);
      setToken(''); setConfigOpen(false); await refresh();
      messageService.success(
        result.sourceChanged
          ? 'New LOTTO source saved. FEED will reconcile its available history from the beginning.'
          : 'LOTTO connection saved. Existing synchronization history and position were preserved.'
      );
    } catch (error) { ErrorHandlerService.handleError(error, 'lottoQueueConfig'); }
  };

  const saveResolution = async () => {
    if (!review) return;
    try {
      await serviceApi.resolveLottoSession(review.sessionId, disposition, reason);
      setReview(null); setReason(''); await refresh();
      messageService.success('LOTTO session classification saved. Service Analytics has been refreshed.');
    } catch (error) { ErrorHandlerService.handleError(error, 'lottoQueueReview'); }
  };

  const columns = React.useMemo<ColumnDef<LottoQueueSession>[]>(() => [
    {
      accessorKey: 'serviceDate',
      header: ({ column }) => <SortableHeader column={column}>Service Date</SortableHeader>,
      size: 125, cell: ({ row }) => formatDate(parseISO(row.original.serviceDate)),
    },
    {
      accessorKey: 'issuedCount',
      header: ({ column }) => <SortableHeader column={column}>Issued</SortableHeader>,
      size: 85, meta: { align: 'right' },
    },
    {
      accessorKey: 'calledCount',
      header: ({ column }) => <SortableHeader column={column}>Called</SortableHeader>,
      size: 85, meta: { align: 'right' },
    },
    {
      id: 'signals', header: 'Authenticity Signals', size: 245,
      cell: ({ row }) => {
        const values = [
          row.original.withinOperatingWindow && 'Within hours',
          row.original.allIssuedTicketsCalled && 'All called',
          row.original.switchedRandomToSequential && 'Mode switched',
          row.original.appendedTickets && 'Tickets appended',
        ].filter(Boolean) as string[];
        return <span className="text-sm text-muted-foreground">{values.join(' · ') || 'No strong signals'}</span>;
      },
    },
    {
      accessorKey: 'effectiveDisposition',
      header: ({ column }) => <SortableHeader column={column}>Status</SortableHeader>,
      size: 145,
      cell: ({ row }) => <Badge variant={row.original.effectiveDisposition === 'needs_review' ? 'outline' : 'secondary'}>{dispositionLabel[row.original.effectiveDisposition]}</Badge>,
    },
    {
      id: 'actions', header: 'Actions', size: 80, enableHiding: false,
      cell: ({ row }) => <TableActionMenu
        size="sm"
        triggerLabel={`Review LOTTO session from ${row.original.serviceDate}`}
        actions={[{ label: 'Classify', icon: Check, onClick: () => {
          setReview(row.original);
          setDisposition(row.original.effectiveDisposition === 'needs_review' ? 'included_service' : row.original.effectiveDisposition);
          setReason(row.original.latestResolution?.reason ?? '');
        } }]}
      />,
    },
  ], []);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>LOTTO Queue Data</CardTitle>
          <CardDescription>
            Synchronize immutable queue closeouts and review sessions withheld from Service Analytics.
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          {isAdministrator && <Button variant="outline" onClick={() => setConfigOpen(true)}><Settings2 className="mr-2 h-4 w-4" />Configure</Button>}
          <Button onClick={() => void sync()} disabled={!status?.configured || syncing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronizing…' : 'Sync now'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.configured && (
          <Alert variant="warning">
            <AlertTriangle className="h-4 w-4" />
            <div><AlertTitle>LOTTO is not connected</AlertTitle><AlertDescription>An administrator must save the LOTTO endpoint and integration token before staff can synchronize.</AlertDescription></div>
          </Alert>
        )}
        {status?.config?.lastSyncedAt && <p className="text-sm text-muted-foreground">Last synchronized {formatDateTime(new Date(status.config.lastSyncedAt))}.</p>}
        <EnhancedDataTable
          // EnhancedDataTable's generic is erased by React.forwardRef. Keep
          // the typed column declaration above, then bridge that known wrapper
          // limitation at the call site (docs/TSC-DEBT.md).
          columns={columns as unknown as ColumnDef<unknown>[]} data={sessions} isLoading={loading}
          filterColumn="effectiveDisposition" filterPlaceholder="Filter session status..."
          enableColumnVisibility={false} defaultPageSize={5}
          emptyMessage="No LOTTO sessions have been synchronized yet."
        />
      </CardContent>

      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Configure LOTTO connection</DialogTitle><DialogDescription>The synchronization token is encrypted with FEED’s existing key manager. Replacing a token for the same LOTTO URL preserves synchronization history and position.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="lotto-base-url">LOTTO URL</Label><Input id="lotto-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://lotto.example.org" /></div>
            <div className="space-y-2"><Label htmlFor="lotto-token">Integration token</Label><Input id="lotto-token" type="password" value={token} onChange={(event) => setToken(event.target.value)} autoComplete="new-password" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setConfigOpen(false)}>Cancel</Button><Button onClick={() => void saveConfig()} disabled={!baseUrl.trim() || token.trim().length < 16}>Save Connection</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={review !== null} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Classify LOTTO session</DialogTitle><DialogDescription>Every source record remains preserved. This decision only controls whether the session contributes to Analytics.</DialogDescription></DialogHeader>
          {review && <div className="space-y-4">
            <p className="text-sm">{review.serviceDate}: {review.issuedCount} issued, {review.calledCount} called.</p>
            <dl className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
              {[
                ['Within operating hours ±1 hour', review.withinOperatingWindow],
                ['All issued tickets called', review.allIssuedTicketsCalled],
                ['Random changed to Sequential', review.switchedRandomToSequential],
                ['Tickets appended', review.appendedTickets],
              ].map(([label, met]) => <div key={String(label)} className="flex items-center justify-between gap-3"><dt>{label}</dt><dd className={met ? 'text-primary' : 'text-muted-foreground'}>{met ? 'Yes' : 'No'}</dd></div>)}
            </dl>
            <div className="space-y-2"><Label htmlFor="lotto-disposition">Classification</Label><Select value={disposition} onValueChange={(value) => setDisposition(value as LottoQueueDisposition)}><SelectTrigger id="lotto-disposition"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(dispositionLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="lotto-reason">Reason</Label><Textarea id="lotto-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record what established this classification." /></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setReview(null)}>Cancel</Button><Button onClick={() => void saveResolution()} disabled={!reason.trim()}>Save Classification</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
