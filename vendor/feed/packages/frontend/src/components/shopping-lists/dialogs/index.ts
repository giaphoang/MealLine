// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

// The wizard subgraph and the legacy instance dialogs (ViewInstanceDialog,
// DeleteInstanceDialog, GenerateListDialog, AddSectionDialog,
// EditSectionDialog, SaveTemplateDialog, TemplateSelectionDialog,
// AddTitleTextDialog) were removed in v1.0.0 along with the rest of the
// wizard subgraph. Builder templates are now the only first-class concept.
//
// Per-template translation+generate (`translate-and-generate-dialog`) lives
// next to this file but is imported directly by the page; it intentionally
// doesn't re-export here so we don't grow another barrel.
export {};
