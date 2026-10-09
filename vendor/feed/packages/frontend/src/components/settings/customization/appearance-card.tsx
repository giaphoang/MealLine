// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { Palette } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBrand, useBrandPreview, type BrandConfigurationPayload } from '@/contexts/BrandContext';
import { formatDateTime } from '@/lib/formatting/date';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { brandService, type BrandConfigurationRow } from '@/services/brand';
import { messageService } from '@/services/message';
import { AppearanceWizard, type AppearanceDraft, type AppearanceTemplate } from './appearance-wizard';

const TEMPLATE_DETAILS: Record<string, { name: string; description: string }> = {
  'template-william-temple-house': {
    name: 'Start from William Temple House',
    description: 'Blue, teal, and gold with the current FEED identity.',
  },
};

type Confirmation =
  | { kind: 'delete'; id: string }
  | { kind: 'deactivate' }
  | null;

export function AppearanceCard() {
  const brand = useBrand();
  const brandPreview = useBrandPreview();
  const [rows, setRows] = React.useState<BrandConfigurationRow[] | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AppearanceDraft | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmation, setConfirmation] = React.useState<Confirmation>(null);

  const load = React.useCallback(async () => {
    try {
      const loaded = await brandService.list();
      setRows(loaded.configurations);
      setActiveId(loaded.activeId);
    } catch (error) {
      setRows([]);
      ErrorHandlerService.handleError(error, 'brandLoadConfigurations');
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const templates: AppearanceTemplate[] = (rows ?? []).filter((row) => row.isTemplate).map((row) => ({
    id: row.id,
    name: TEMPLATE_DETAILS[row.id]?.name ?? `Start from ${row.id.replace(/^template-/, '').replace(/-/g, ' ')}`,
    description: TEMPLATE_DETAILS[row.id]?.description ?? 'A complete example appearance.',
    config: row.payload as BrandConfigurationPayload,
  }));
  const saved = (rows ?? []).filter((row) => !row.isTemplate);

  const activate = async (id: string) => {
    setPending(true);
    try {
      await brandService.activate(id);
      messageService.success('Appearance activated for FEED.');
      window.location.reload();
    } catch (error) { ErrorHandlerService.handleError(error, 'brandActivate'); }
    finally { setPending(false); }
  };

  const confirm = async () => {
    const action = confirmation;
    setConfirmation(null);
    if (!action) return;
    setPending(true);
    try {
      if (action.kind === 'delete') {
        await brandService.remove(action.id);
        messageService.success('Appearance configuration deleted.');
        await load();
      } else {
        await brandService.deactivate();
        messageService.success('FEED returned to the built-in William Temple House appearance.');
        window.location.reload();
      }
    } catch (error) { ErrorHandlerService.handleError(error, action.kind === 'delete' ? 'brandDelete' : 'brandDeactivate'); }
    finally { setPending(false); }
  };

  const openEdit = (row: BrandConfigurationRow) => {
    setEditing({ id: row.id, config: structuredClone(row.payload), startSource: 'saved' });
    setWizardOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5 text-muted-foreground" aria-hidden="true" />Organization customization</CardTitle>
          <CardDescription>
            {brand.source === 'configured' ? `“${activeId ?? brand.configId}” is the live organization appearance.` : 'FEED is using the compiled William Temple House appearance.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {brandPreview.isPreviewing ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm">You are previewing an unsaved appearance in this browser session.</p>
              <Button variant="outline" size="sm" onClick={brandPreview.clear}>Stop previewing</Button>
            </div>
          ) : null}
          {brand.warning ? (
            <div role="alert" className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {brand.warning} The safe built-in William Temple House appearance is active instead.
            </div>
          ) : null}
          {rows === null ? (
            <div className="space-y-2" aria-label="Loading appearance configurations"><Skeleton className="h-16 w-full" /><Skeleton className="h-9 w-36" /></div>
          ) : saved.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="font-medium">Set up your organization’s appearance</p>
              <p className="mt-1 text-sm text-muted-foreground">A guided workflow covers identity, logos, accessible colors, staff copy, and public capabilities.</p>
              <Button className="mt-3" onClick={() => { setEditing(null); setWizardOpen(true); }} disabled={pending}>Set up appearance</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {saved.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.id}</p>
                    <p className="text-xs text-muted-foreground">Updated {formatDateTime(row.updatedAt)}</p>
                  </div>
                  {row.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Draft</Badge>}
                  <Button variant="outline" size="sm" onClick={() => openEdit(row)} disabled={pending}>Edit</Button>
                  {!row.isActive ? <Button variant="outline" size="sm" onClick={() => void activate(row.id)} disabled={pending}>Activate</Button> : null}
                  {!row.isActive ? <Button variant="ghost" size="sm" onClick={() => setConfirmation({ kind: 'delete', id: row.id })} disabled={pending}>Delete</Button> : null}
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" onClick={() => { setEditing(null); setWizardOpen(true); }} disabled={pending}>New appearance</Button>
                {brand.source === 'configured' ? <Button variant="outline" onClick={() => setConfirmation({ kind: 'deactivate' })} disabled={pending}>Use built-in appearance</Button> : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AppearanceWizard open={wizardOpen} onOpenChange={setWizardOpen} templates={templates} existingDraft={editing} onSaved={() => void load()} />

      <AlertDialog open={confirmation !== null} onOpenChange={(open) => !open && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.kind === 'delete' ? 'Delete this appearance?' : 'Use the built-in appearance?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.kind === 'delete'
                ? `“${confirmation.id}” will be permanently removed. Uploaded images used only by this configuration will also be removed from the live database.`
                : 'The saved configuration remains available, but FEED immediately returns to the built-in William Temple House identity and colors.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void confirm()} disabled={pending}>{confirmation?.kind === 'delete' ? 'Delete' : 'Use built-in appearance'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
