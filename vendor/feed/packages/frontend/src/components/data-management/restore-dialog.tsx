// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { adminService } from '@/services/admin';
import type {
  RestorePreview,
  RestoreResult,
  RestoreUnitId,
  RestoreUnitInfo,
} from '@/types/admin';
import { formatDateTime } from '@/lib/formatting/date';

/**
 * Restore, as a walk rather than a single terrifying button.
 *
 * Four steps: choose a file, see what is in it and pick what to bring back,
 * confirm, then wait for the restart. Validation happens on its own round trip
 * so the administrator reads what the file holds *before* anything is
 * replaced — the difference between a confirmation and a dare.
 *
 * The copy discloses and moves on rather than warning. Inventory is a living
 * record: staff reconcile it against physical stock before every pantry day,
 * and limits are printed on shopping lists and mirrored in shelf signage, so a
 * reverted limit is checkable. Two things do earn a mention — items that come
 * back from the dead, and the fact that inventory now reflects the backup's
 * date rather than this morning's.
 */

type Step = 'choose' | 'review' | 'confirm' | 'restarting' | 'done';

const dateTimeLabel = (iso: string) => {
  const date = new Date(iso);
  return formatDateTime(date);
};

interface RestoreDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the restore has landed, so the page can refresh its summary. */
  onRestored?: () => void;
}

export function RestoreDialog({ open, onOpenChange, onRestored }: RestoreDialogProps) {
  const [step, setStep] = React.useState<Step>('choose');
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<RestorePreview | null>(null);
  const [units, setUnits] = React.useState<RestoreUnitInfo[]>([]);
  const [selected, setSelected] = React.useState<RestoreUnitId[]>([]);
  const [result, setResult] = React.useState<RestoreResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const reset = React.useCallback(() => {
    setStep('choose');
    setFile(null);
    setPreview(null);
    setSelected([]);
    setResult(null);
    setError(null);
    setBusy(false);
  }, []);

  React.useEffect(() => {
    if (open) {
      reset();
      void adminService
        .getRestoreUnits()
        .then(setUnits)
        .catch(() => setUnits([]));
    }
  }, [open, reset]);

  /**
   * Dependencies are added for the user and named, rather than refused.
   * Refusing would make them solve a foreign-key graph the code already knows.
   */
  const closure = React.useMemo(() => {
    const byId = new Map(units.map(unit => [unit.id, unit]));
    const out = new Set<RestoreUnitId>();
    const visit = (id: RestoreUnitId) => {
      if (out.has(id)) return;
      out.add(id);
      byId.get(id)?.requires.forEach(visit);
    };
    selected.forEach(visit);
    return out;
  }, [selected, units]);

  // Named by the server from the same contract the restore itself reads, so
  // the warning cannot drift from what actually happens.
  const clearedLabels = React.useMemo(
    () => [...new Set(units.filter(unit => closure.has(unit.id)).flatMap(unit => unit.clears))],
    [closure, units],
  );

  const blankedLabels = React.useMemo(
    () => [...new Set(units.filter(unit => closure.has(unit.id)).flatMap(unit => unit.blanks))],
    [closure, units],
  );

  const autoAdded = [...closure].filter(id => !selected.includes(id));

  const handleFile = async (chosen: File) => {
    setFile(chosen);
    setError(null);
    setBusy(true);
    try {
      const summary = await adminService.validateBackup(chosen);
      setPreview(summary);
      setSelected(summary.availableUnits);
      setStep('review');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be read.');
      setFile(null);
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setStep('restarting');
    try {
      const outcome = await adminService.restoreBackup(file, [...closure]);
      setResult(outcome);
      setStep('done');
      onRestored?.();
      // The server exits right after responding, so the app goes away for a few
      // seconds. Reloading brings it back on the restored database rather than
      // leaving stale data on screen.
      window.setTimeout(() => window.location.reload(), 6000);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The restore did not run. Your data has not been changed.'
      );
      setStep('confirm');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: RestoreUnitId) => {
    setSelected(current =>
      current.includes(id) ? current.filter(unit => unit !== id) : [...current, id]
    );
  };

  const selectedUnits = units.filter(unit => closure.has(unit.id));

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        // Closing mid-restart would leave the user on a dead page with no
        // explanation. The reload is what ends this dialog.
        if (step === 'restarting') return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'done' ? 'Restore complete' : 'Restore from a backup'}
          </DialogTitle>
          <DialogDescription>
            {step === 'choose' &&
              'Choose a backup file FEED created. Nothing changes until you confirm.'}
            {step === 'review' &&
              preview &&
              `Backup taken ${dateTimeLabel(preview.generatedAt)} by ${preview.generatedBy}.`}
            {step === 'confirm' && 'Last check before FEED replaces this data.'}
            {step === 'restarting' && 'FEED is restarting. This takes a few seconds.'}
            {step === 'done' && 'FEED is reloading with the restored data.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'choose' && (
          <div className="space-y-3">
            <Label htmlFor="restore-file">Backup file</Label>
            <input
              id="restore-file"
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={event => {
                const chosen = event.target.files?.[0];
                if (chosen) void handleFile(chosen);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
            />
            <p className="text-xs text-muted-foreground">
              The .json file from Download Backup. FEED checks it before anything is replaced.
            </p>
          </div>
        )}

        {step === 'review' && preview && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">What to bring back</p>
              {units
                .filter(unit => preview.availableUnits.includes(unit.id))
                .map(unit => (
                  <label key={unit.id} className="flex items-start gap-3">
                    <Checkbox
                      checked={closure.has(unit.id)}
                      disabled={autoAdded.includes(unit.id)}
                      onCheckedChange={() => toggle(unit.id)}
                      className="mt-0.5"
                    />
                    <span className="space-y-0.5">
                      <span className="block text-sm">
                        {unit.label}
                        {preview.rowsByUnit[unit.id] !== undefined && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {preview.rowsByUnit[unit.id].toLocaleString()} records
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {unit.description}
                      </span>
                    </span>
                  </label>
                ))}
            </div>

            {autoAdded.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {autoAdded
                  .map(id => units.find(unit => unit.id === id)?.label ?? id)
                  .join(' and ')}{' '}
                {autoAdded.length === 1 ? 'is' : 'are'} included because the items you chose
                refer to {autoAdded.length === 1 ? 'it' : 'them'}.
              </p>
            )}

            {preview.notes.map(note => (
              <p key={note} className="text-xs text-muted-foreground">
                {note}
              </p>
            ))}
          </div>
        )}

        {step === 'confirm' && preview && (
          <div className="space-y-3 text-sm">
            <p>
              FEED will replace{' '}
              <strong>{selectedUnits.map(unit => unit.label.toLowerCase()).join(', ')}</strong>{' '}
              with the contents of the backup taken{' '}
              <strong>{dateTimeLabel(preview.generatedAt)}</strong>. Anything you did not
              select stays as it is.
            </p>
            <p className="text-muted-foreground">
              Work saved since that backup — in the parts being replaced — will be gone. FEED
              saves a snapshot of the current database first, so this can be undone from the
              server if it turns out to be wrong.
            </p>
            {closure.has('service') && (
              <p className="text-muted-foreground">
                LOTTO history is the exception: FEED keeps the union of the backup and newer
                queue sessions already stored here, because LOTTO may no longer hold older days.
              </p>
            )}
            {closure.has('staffRoster') && (
              <p className="text-muted-foreground">
                Restored accounts return as Staff. Your Administrator access remains in place.
              </p>
            )}
            {closure.has('inventory') && (
              <p className="text-muted-foreground">
                Items deleted since then will come back. They are easy to clear in bulk, but
                worth looking for.
              </p>
            )}
            {/* These rows reference records the restore replaces, whose ids are
                reassigned from the artifact — keeping them would attribute
                history to the wrong record. Saying so beats losing them
                quietly. */}
            {clearedLabels.length > 0 && (
              <p className="text-muted-foreground">
                This also clears {clearedLabels.join(' and ')}, which refer to the records
                being replaced and cannot be carried across.
              </p>
            )}
            {/* Not a deletion: the rows arrive, without the association. The
                parent they pointed at is an uploaded file, which no backup
                carries, so on any instance but the one the backup came from
                there is nothing left to point at. */}
            {blankedLabels.length > 0 && (
              <p className="text-muted-foreground">
                Restored records keep their content but lose {blankedLabels.join(' and ')},
                because backups do not carry uploaded files.
              </p>
            )}
            <p className="text-muted-foreground">
              FEED will restart, and everyone will be briefly unable to save changes.
            </p>
          </div>
        )}

        {step === 'restarting' && (
          <p className="text-sm text-muted-foreground">
            Replacing the database and restarting. Do not close this window.
          </p>
        )}

        {step === 'done' && result && (
          <div className="space-y-2 text-sm">
            <p>
              Restored {result.tables.length} table(s) from the backup taken{' '}
              {dateTimeLabel(result.backupTakenAt)}.
            </p>
            <p className="text-muted-foreground">
              Inventory reflects that date. Check limits and availability before your next
              pantry day.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('choose')} disabled={busy}>
                Back
              </Button>
              <Button onClick={() => setStep('confirm')} disabled={busy || closure.size === 0}>
                Continue
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('review')} disabled={busy}>
                Back
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleRestore()}
                disabled={busy}
              >
                Restore and restart
              </Button>
            </>
          )}
          {(step === 'choose' || step === 'done') && (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {step === 'done' ? 'Close' : 'Cancel'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
