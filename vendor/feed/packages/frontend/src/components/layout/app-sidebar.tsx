// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOutIcon } from "@/components/animate-ui/icons/log-out";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarMenu,
  useSidebar,
} from '@/components/ui/sidebar';
import { navigationItems } from './navigation';
import { NavigationSection } from './navigation-section';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigationKeyboard } from '@/hooks/use-navigation-keyboard';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { markDashboardNavigation } from '@/hooks/use-route-persistence';
import { APP_VERSION } from '@/config/app-version';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { AboutNavIcon } from './animated-nav-icons';
import { AboutCard } from '@/components/about/AboutPage';
import { ReleaseNotesCard } from '@/components/release-notes/ReleaseNotesCard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useBrand } from '@/contexts/BrandContext';

// Extract Dashboard as a special item (at index 0)
const dashboardItem = navigationItems[0];

export function AppSidebar() {
  const { pathname } = useLocation();
  const { state } = useSidebar();
  const { isAdministrator } = useAuth();
  const brand = useBrand();
  const isCollapsed = state === 'collapsed';
  const itemRefs = React.useRef<(HTMLAnchorElement | null)[]>([]);

  // Administrator-only entries are filtered here rather than at module scope,
  // because the roster can change under a signed-in session: the server
  // re-reads role on every request, so a demotion takes effect on the next
  // session check and the menu should follow. Hiding an item is presentation;
  // `/api/admin` enforces authority on its own.
  const { standaloneItems, groupedItems, allMenuItems } = React.useMemo(() => {
    const isVisible = (item: { adminOnly?: boolean }) =>
      !item.adminOnly || isAdministrator;

    const standalone = navigationItems
      .slice(1)
      .filter(item => !item.items)
      .filter(isVisible);

    const grouped = navigationItems
      .slice(1)
      .filter(item => item.items)
      .filter(isVisible)
      .map(section => ({
        ...section,
        items: section.items?.filter(isVisible),
      }));

    // Flattened for the collapsed view (Dashboard is handled separately)
    const all = [
      ...standalone,
      ...grouped.flatMap(section => section.items || []),
    ].filter(item => !item.isFuture);

    return {
      standaloneItems: standalone,
      groupedItems: grouped,
      allMenuItems: all,
    };
  }, [isAdministrator]);

  const handleNavigate = React.useCallback((index: number) => {
    itemRefs.current[index]?.focus();
  }, []);

  useNavigationKeyboard({
    itemCount: allMenuItems.length,
    onNavigate: handleNavigate,
    isCollapsed,
  });

  // Determine if Dashboard is active
  const isDashboardActive = pathname === dashboardItem.href ||
                            pathname.startsWith(`${dashboardItem.href}/`);

  return (
    <Sidebar
      collapsible="icon"
      className="feed-shell-sidebar"
      role="navigation"
      aria-label="Main navigation"
    >
      <SidebarHeader className="p-0">
        {isCollapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <AnimateIcon asChild animateOnHover animateOnTap>
                <Link
                  to={dashboardItem.href}
                  data-feed-no-icon-motion="true"
                  className={`
                    flex h-16 w-full items-center px-6
                    group-data-[collapsible=icon]:justify-center
                    hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                    transition-all duration-200
                    focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                    rounded-none
                    ${isDashboardActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
                  `}
                  onClick={markDashboardNavigation}
                  aria-label={`Navigate to ${dashboardItem.title}`}
                  aria-current={isDashboardActive ? 'page' : undefined}
                >
                  <dashboardItem.icon
                    className="
                      h-4 w-4 shrink-0
                      transition-all duration-200
                    "
                    aria-hidden="true"
                  />
                  <span
                    className="
                      ml-3 text-md font-medium
                      group-data-[collapsible=icon]:hidden
                    "
                  >
                    {brand.identity.appName} Dashboard
                  </span>
                </Link>
              </AnimateIcon>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              Dashboard (Home)
            </TooltipContent>
          </Tooltip>
        ) : (
          <AnimateIcon asChild animateOnHover animateOnTap>
            <Link
              to={dashboardItem.href}
              data-feed-no-icon-motion="true"
              className={`
                flex h-16 w-full items-center px-6
                group-data-[collapsible=icon]:justify-center
                hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                transition-all duration-200
                focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                rounded-none
                ${isDashboardActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
              `}
              onClick={markDashboardNavigation}
              aria-label={`Navigate to ${dashboardItem.title}`}
              aria-current={isDashboardActive ? 'page' : undefined}
            >
              <dashboardItem.icon
                className="
                  h-4 w-4 shrink-0
                  transition-all duration-200
                "
                aria-hidden="true"
              />
              <span
                className="
                  ml-3 text-md font-medium
                "
              >
                {brand.identity.appName} Dashboard
              </span>
            </Link>
          </AnimateIcon>
        )}
      </SidebarHeader>

      <SidebarContent
        className="
          group-data-[collapsible=icon]:flex
          group-data-[collapsible=icon]:flex-col
          group-data-[collapsible=icon]:items-center
          group-data-[collapsible=icon]:pt-4
          justify-start!
        "
      >
        {/* Collapsed state view - single column of icons */}
        <div className="hidden group-data-[collapsible=icon]:block group-data-[collapsible=icon]:w-full">
          <SidebarMenu
            className="flex flex-col items-center space-y-4 w-full"
            role="menu"
            aria-label="Navigation menu"
          >
            {allMenuItems.map((item, index) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <SidebarMenuItem key={item.title} role="none">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        asChild
                        className={`
                          focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                          ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
                        `}
                      >
                        <AnimateIcon asChild animateOnHover animateOnTap>
                          <Link
                            ref={el => itemRefs.current[index] = el}
                            to={item.href}
                            data-feed-no-icon-motion="true"
                            className="
                              flex items-center justify-center p-2
                              transition-all duration-200
                              hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                              rounded-md
                            "
                            onClick={item.href === '/' ? markDashboardNavigation : undefined}
                            role="menuitem"
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={`Navigate to ${item.title}`}
                          >
                            {item.icon && (
                              <item.icon
                                className="h-4 w-4 shrink-0 transition-transform duration-200"
                                aria-hidden="true"
                              />
                            )}
                          </Link>
                        </AnimateIcon>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </div>

        {/* Expanded state view - grouped items with labels */}
        <div className="group-data-[collapsible=icon]:hidden">
          {/* Standalone items */}
          {standaloneItems.length > 0 && (
            <SidebarGroup>
              <SidebarMenu role="menu" aria-label="Main menu items">
                {standaloneItems.map((item, index) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <SidebarMenuItem key={item.title} role="none">
                      <SidebarMenuButton
                        asChild
                        className={`
                          focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                          ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : ''}
                        `}
                      >
                        <AnimateIcon asChild animateOnHover animateOnTap>
                          <Link
                            ref={el => itemRefs.current[index] = el}
                            to={item.href}
                            data-feed-no-icon-motion="true"
                            className="
                              flex items-center gap-2 px-2 py-1.5
                              transition-all duration-200
                              hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                              rounded-md
                            "
                            onClick={item.href === '/' ? markDashboardNavigation : undefined}
                            role="menuitem"
                            aria-current={isActive ? 'page' : undefined}
                            aria-label={`Navigate to ${item.title}`}
                          >
                            {item.icon && (
                              <item.icon
                                className="h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </AnimateIcon>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          )}

          {/* Grouped sections */}
          {groupedItems.map((section) => (
            <NavigationSection
              key={section.title}
              label={section.title}
              items={section.items || []}
            />
          ))}
        </div>
      </SidebarContent>

      <SidebarFooter className="border-t flex flex-col">
        {/* Logout Button - Expanded State */}
        <div className="mt-1 px-2 group-data-[collapsible=icon]:hidden">
          <AnimateIcon asChild animateOnHover animateOnTap>
            <Link
              to="/logout"
              data-feed-no-icon-motion="true"
              className="
                flex items-center gap-2 px-2 py-1.5
                transition-all duration-200
                hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                rounded-md text-sm
                focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
              "
              aria-label="Logout"
            >
              <LogOutIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">Logout</span>
            </Link>
          </AnimateIcon>
        </div>

        {/* Logout Button - Collapsed State */}
        <div className="hidden group-data-[collapsible=icon]:block mt-1 px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <AnimateIcon asChild animateOnHover animateOnTap>
                <Link
                  to="/logout"
                  data-feed-no-icon-motion="true"
                  className="
                    flex items-center justify-center p-2
                    transition-all duration-200
                    hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                    rounded-md
                    focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  "
                  aria-label="Logout"
                >
                  <LogOutIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </AnimateIcon>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>Logout</TooltipContent>
          </Tooltip>
        </div>

        <div
          className="
            mt-auto px-2 py-2
            text-xs text-muted-foreground/70
            transition-opacity
            space-y-1.5
          "
        >
          <div className="group-data-[collapsible=icon]:hidden">
            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="
                    rounded-md px-0 py-1 text-left text-xs text-muted-foreground/80
                    transition-colors
                    hover:text-foreground
                    focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  "
                  aria-label={`Open release notes for Version ${APP_VERSION}`}
                >
                  Version {APP_VERSION}
                </button>
              </DialogTrigger>
              <DialogContent className="border-0! bg-transparent! p-0! shadow-none! outline-hidden! ring-0! focus:outline-hidden! focus-visible:outline-hidden! focus-visible:ring-0! sm:max-w-2xl [&>button]:right-4 [&>button]:top-4">
                <DialogTitle className="sr-only">Release Notes</DialogTitle>
                <DialogDescription className="sr-only">
                  Plain-language release notes for FEED versions 1.0.0 through {APP_VERSION}.
                </DialogDescription>
                <ReleaseNotesCard />
              </DialogContent>
            </Dialog>
          </div>
          {/*
            No tooltip here, unlike the collapsed-rail items above. This block
            is `group-data-[collapsible=icon]:hidden`, so it only ever renders
            with the sidebar expanded — where the word "About" is already on
            screen next to the icon. A tooltip repeating it just put a second
            "About" beside the first on hover. The sibling "Version" button
            follows the same rule.
          */}
          <div className="group-data-[collapsible=icon]:hidden">
            <Dialog>
              <DialogTrigger asChild>
                <AnimateIcon asChild animateOnHover animateOnTap>
                  <button
                    type="button"
                    data-feed-no-icon-motion="true"
                    className="
                      flex items-center gap-2 rounded-md px-0 py-1
                      text-left text-xs text-muted-foreground/80
                      transition-all duration-200
                      hover:text-foreground
                      focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                    "
                  aria-label={`About ${brand.identity.appName}`}
                  >
                    <AboutNavIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>About</span>
                  </button>
                </AnimateIcon>
              </DialogTrigger>
              <DialogContent className="border-0! bg-transparent! p-0! shadow-none! outline-hidden! ring-0! focus:outline-hidden! focus-visible:outline-hidden! focus-visible:ring-0! sm:max-w-xl [&>button]:right-10 [&>button]:top-4">
                <DialogTitle className="sr-only">About {brand.identity.appName}</DialogTitle>
                <DialogDescription className="sr-only">
                  Product, source, and licensing information for {brand.identity.appName}.
                </DialogDescription>
                <AboutCard />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
