// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { LanguageSelectionForm } from "./language-selection-form"
import { LanguageProvider } from "@/contexts/LanguageContext"
import { SectionHeader } from "@/components/shared/section-header"
import { GlobeIcon } from "@/components/ui/globe"
import { createPageTitleIcon } from "@/components/layout/page-title-icon"

// Page-title icon: animates on mount (page load) + hover. Mirrors the
// AI Configuration title pattern.
const PageTitleGlobeIcon = createPageTitleIcon(GlobeIcon);

export function LanguageManagement() {
  return (
    <LanguageProvider>
      <div className="space-y-6 min-w-0 w-full pt-6" data-testid="data-list">
        <SectionHeader
          title="Language Management"
          description="Manage language availability and content translation settings."
          icon={PageTitleGlobeIcon}
        />

        <div className="w-full">
          <LanguageSelectionForm />
        </div>
      </div>
    </LanguageProvider>
  )
}