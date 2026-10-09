// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from "@/components/ui/separator";
import { markDashboardNavigation } from '@/hooks/use-route-persistence';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

interface HeaderProps {
  breadcrumbs?: {
    title: string;
    href?: string;
  }[];
  rightContent?: React.ReactNode;
}

export function Header({ breadcrumbs = [], rightContent }: HeaderProps) {
  const navigate = useNavigate();
  
  const handleNavigate = (path?: string) => {
    if (!path) return;
    
    // Set the intentional dashboard flag if navigating to home
    if (path === '/') {
      markDashboardNavigation();
    }
    
    // Use React Router's navigate function
    navigate(path);
  };
  
  return (
    <header className="sticky top-0 z-40 w-full transition-all duration-200">
      <div className="relative">
        {/* Frosted glass effect with enhanced blur for better visibility */}
        <div className="feed-shell-header-panel absolute inset-0" />
        
        {/* Header content */}
        <div className="relative flex h-16 shrink-0 items-center gap-2 border-b transition-all duration-200 ease-in-out group-data-[collapsible=icon]:h-12">
          <div className="flex items-center justify-between w-full px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.title}>
                      {/* Enhanced responsive behavior */}
                      <BreadcrumbItem className="hidden sm:inline-flex">
                        {index === breadcrumbs.length - 1 ? (
                          <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                        ) : crumb.href ? (
                          <button
                            onClick={() => handleNavigate(crumb.href)}
                            className="hover:text-foreground/80 transition-colors"
                          >
                            {crumb.title}
                          </button>
                        ) : (
                          // Group labels (e.g. "Inventory", "Tools") have no
                          // route — render as non-interactive text so they
                          // don't present as clickable dead links.
                          <span className="text-muted-foreground">{crumb.title}</span>
                        )}
                      </BreadcrumbItem>
                      {index < breadcrumbs.length - 1 && (
                        <BreadcrumbSeparator className="hidden sm:inline-flex" />
                      )}
                    </React.Fragment>
                  ))}
                  {/* Mobile-only title display */}
                  {breadcrumbs.length > 0 && (
                    <BreadcrumbItem className="sm:hidden">
                      <BreadcrumbPage>
                        {breadcrumbs[breadcrumbs.length - 1].title}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  )}
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            <div className="flex items-center">
              {rightContent}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
