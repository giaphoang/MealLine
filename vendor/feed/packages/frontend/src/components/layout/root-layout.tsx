// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { AppSidebar } from './app-sidebar';
import { Header } from './header';
import { SkipNav } from './skip-nav';
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { AlertButton } from '@/components/dashboard/alerts/alert-button';
import { ThemeSwitcher } from '@/components/theme-switcher';

// Folded to `false` in production, so Rollup drops the dynamic import with it.
const PaletteDevTools = import.meta.env.DEV
  ? React.lazy(() => import('@/components/palette-dev-tools'))
  : null;

// Match the storage key from sidebar.tsx
const SIDEBAR_STORAGE_KEY = "sidebar_state";

interface RootLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: {
    title: string;
    href?: string;
  }[];
}

export function RootLayout({ children, breadcrumbs = [] }: RootLayoutProps) {
  // Initialize state from localStorage, defaulting to true if nothing is stored
  const [sidebarOpen, setSidebarOpen] = React.useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  
  // Custom setter that updates both state and localStorage
  const handleSidebarChange = React.useCallback((open: boolean) => {
    setSidebarOpen(open);
    if (typeof window !== 'undefined') {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
    }
  }, []);
  
  return (
    <>
      <SkipNav />
      <div
        aria-hidden="true"
        className="feed-shell-backdrop pointer-events-none fixed inset-0 z-0"
      />
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={handleSidebarChange}
      >
        <AppSidebar />
        <SidebarInset className="relative z-10 min-w-0 bg-transparent">
          <Header 
            breadcrumbs={breadcrumbs} 
            rightContent={
              <div className="flex items-center space-x-1">
                {/* TEMPORARY: Tailwind palette A/B controls. Lazy behind the
                    DEV flag so the stylesheet and candidate data leave the
                    production bundle entirely, not just the interface. */}
                {PaletteDevTools && (
                  <React.Suspense fallback={null}>
                    <PaletteDevTools />
                  </React.Suspense>
                )}
                <ThemeSwitcher />
                <AlertButton />
              </div>
            } 
          />
          <main
            id="main-content"
            className="
              flex min-w-0 flex-1 flex-col gap-4 px-4 pt-0 pb-6 sm:px-6
              focus:outline-hidden
            "
            tabIndex={-1}
          >
            <div className="flex min-w-0 flex-col gap-4">
              {children}
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  );
}
