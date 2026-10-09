// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import type { NavItem } from './navigation';
import { useNavigationKeyboard } from '@/hooks/use-navigation-keyboard';
import { motion } from 'framer-motion';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';

interface NavigationSectionProps {
  label: string;
  items: NavItem[];
}

export function NavigationSection({ label, items }: NavigationSectionProps) {
  const { pathname } = useLocation();
  const itemRefs = React.useRef<(HTMLAnchorElement | null)[]>([]);
  
  // Filter out future/planned items
  const availableItems = items.filter(item => !item.isFuture);

  const handleNavigate = React.useCallback((index: number) => {
    itemRefs.current[index]?.focus();
  }, []);

  useNavigationKeyboard({
    itemCount: availableItems.length,
    onNavigate: handleNavigate,
  });

  return (
    <SidebarGroup className="group/section">
      <SidebarGroupLabel 
        className="px-2 py-1.5 text-sm font-medium"
        aria-label={`${label} navigation section`}
      >
        {label}
      </SidebarGroupLabel>
      <SidebarMenu 
        role="group" 
        aria-label={`${label} menu items`}
        className="space-y-1"
      >
        {availableItems.map((item, index) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          
          return (
            <SidebarMenuItem 
              key={item.title}
              role="presentation"
              className="relative"
            >
              <SidebarMenuButton
                asChild
                className={`
                  group/item
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
                    flex items-center gap-2 w-full px-2 py-1.5
                    transition-all duration-200 ease-in-out
                    hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                    rounded-md
                    relative
                    group-data-[collapsible=icon]:justify-center
                    group-data-[collapsible=icon]:px-3
                  "
                  role="menuitem"
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`Navigate to ${item.title}`}
                  tabIndex={0}
                >
                  {item.icon && (
                    <item.icon 
                      className="
                        h-4 w-4 shrink-0
                        transition-transform duration-200
                        group-hover/item:scale-110
                      " 
                      aria-hidden="true"
                    />
                  )}
                  <span className="
                    truncate
                    transition-opacity duration-200
                    group-data-[collapsible=icon]:opacity-0
                    group-data-[collapsible=icon]:w-0
                    group-data-[collapsible=icon]:hidden
                  ">
                    {item.title}
                  </span>
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 w-1 h-full bg-sidebar-accent rounded-r-md"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </Link>
                </AnimateIcon>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}