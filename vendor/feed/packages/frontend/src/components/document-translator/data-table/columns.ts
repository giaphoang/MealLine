// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { getColumns } from './columns.tsx';

export { getColumns };

// Create a wrapper function that matches what DocumentList expects
export const columns = (props: {
  onEdit: (document: any) => void;
  onDelete: (document: any) => void;
  onTranslate: (document: any) => void;
  onDownload: (document: any) => void;
  onDownloadAllTranslations: (document: any) => Promise<void>;
}) => {
  return getColumns(
    props.onEdit,
    props.onDelete,
    props.onTranslate,
    props.onDownload,
    props.onDownloadAllTranslations
  );
};