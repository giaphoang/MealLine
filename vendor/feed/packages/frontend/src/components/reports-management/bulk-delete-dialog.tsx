// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import { BulkDeleteDialog as SharedBulkDeleteDialog } from '@/components/shared/bulk-delete-dialog';

interface ReportTemplateItem {
  id: number;
  name: string;
}

interface BulkDeleteDialogProps<T extends ReportTemplateItem> {
  templates: T[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (templates: T[]) => Promise<void>;
  isLoading?: boolean;
}

/** Reports wording around the project's standard bulk-delete confirmation. */
export function BulkDeleteDialog<T extends ReportTemplateItem>({
  templates,
  open,
  onOpenChange,
  onConfirm,
  isLoading,
}: BulkDeleteDialogProps<T>) {
  return (
    <SharedBulkDeleteDialog
      items={templates}
      itemType="Report template"
      pluralItemType="Report templates"
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      isLoading={isLoading}
      customDescription="This removes the saved card selections and filters for everyone. Reports already downloaded are unaffected."
    />
  );
}
