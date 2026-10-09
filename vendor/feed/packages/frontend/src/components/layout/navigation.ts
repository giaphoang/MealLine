// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Info, Package, Globe2, Settings, AudioWaveform, Map, User } from "@/components/ui/icons";
import type { ComponentType } from 'react';
import {
  AdminNavIcon,
  AIConfigurationNavIcon,
  AnalyticsNavIcon,
  CategoriesNavIcon,
  DashboardNavIcon,
  DocumentTranslatorNavIcon,
  FoodItemsNavIcon,
  ReportsNavIcon,
  HelpNavIcon,
  SettingsNavIcon,
  DataManagementNavIcon,
  LanguagesNavIcon,
  ShoppingListsNavIcon,
  ServiceLogNavIcon,
  ServiceNavIcon,
  TranslationsNavIcon,
} from './animated-nav-icons';

export interface NavItem {
  title: string;
  href: string;
  icon: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
  items?: NavItem[];
  isActive?: boolean;
  isFuture?: boolean;  // For planned features
  /**
   * Shown only to administrators. Presentation only — the server enforces
   * authority on every privileged route independently, and an omitted menu
   * item is not a security boundary.
   */
  adminOnly?: boolean;
}

export const navigationItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: DashboardNavIcon,
  },
  {
    title: "Inventory",
    href: "#",
    icon: Package,
    items: [
      {
        title: "Categories",
        href: "/categories",
        icon: CategoriesNavIcon,
      },
      {
        title: "Food Items",
        href: "/food-items",
        icon: FoodItemsNavIcon,
      }
    ]
  },
  {
    title: "Language & Translation",
    href: "#",
    icon: Globe2,
    items: [
      {
        title: "Languages",
        href: "/languages",
        icon: LanguagesNavIcon
      },
      {
        title: "Translations",
        href: "/translations",
        icon: TranslationsNavIcon
      }
    ]
  },
  {
    title: "Service",
    href: "#",
    icon: ServiceNavIcon,
    items: [
      { title: 'Voice Intakes', href: '/intakes', icon: AudioWaveform },
      { title: 'Clients', href: '/clients', icon: User },
      { title: 'Household Baskets', href: '/household-baskets', icon: Package },
      { title: 'Deliveries', href: '/deliveries', icon: Map },
      {
        title: "Service Log",
        href: "/service-log",
        icon: ServiceLogNavIcon,
      },
    ],
  },
  // AI Configuration powers the tools rather than being one — translation and
  // document work depend on it — so the section is named for both. That also
  // gives Settings and Admin a home beside it, which is what frees Information
  // to be about reading the organization's data rather than configuring it.
  {
    title: "Tools & Settings",
    href: "#",
    icon: Settings,
    items: [
      {
        title: "Shopping Lists",
        href: "/shopping-lists",
        icon: ShoppingListsNavIcon
      },
      {
        title: "Document Translator",
        href: "/document-translator",
        icon: DocumentTranslatorNavIcon
      },
      {
        title: "AI Configuration",
        href: "/ai-configuration",
        icon: AIConfigurationNavIcon
      },
      {
        title: "Settings",
        href: "/settings",
        icon: SettingsNavIcon,
      },
      {
        title: "Admin",
        href: "/admin",
        icon: AdminNavIcon,
        adminOnly: true,
      }
    ]
  },
  // Analytics sat under Inventory while every lens described inventory over
  // time. Service encounters are not inventory, so the section that named the
  // subject no longer describes the page. Analytics, Reports and Data now read
  // as one progression: look at the data, report on it, manage its sources.
  {
    title: "Information",
    href: "#",
    icon: Info,
    items: [
      {
        title: "Analytics",
        href: "/analytics",
        icon: AnalyticsNavIcon,
      },
      {
        title: "Reports",
        href: "/reports",
        icon: ReportsNavIcon,
      },
      {
        title: "Data",
        href: "/data-management",
        icon: DataManagementNavIcon,
      },
      {
        title: "Help",
        href: "/help",
        icon: HelpNavIcon,
      }
    ]
  }
];
