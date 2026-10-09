// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { BotIcon } from "@/components/animate-ui/icons/bot";
import { CircleHelpIcon } from "@/components/animate-ui/icons/circle-help";
import { ClipboardPenIcon } from "@/components/animate-ui/icons/clipboard-pen";
import { ClipboardListIcon } from "@/components/animate-ui/icons/clipboard-list";
import { ChartNoAxesCombinedIcon } from "@/components/animate-ui/icons/chart-no-axes-combined";
import { DatabaseIcon } from "@/components/animate-ui/icons/database";
import { FileChartPieIcon } from "@/components/animate-ui/icons/file-chart-pie";
import { GaugeIcon } from "@/components/animate-ui/icons/gauge";
import { InfoIcon } from "@/components/animate-ui/icons/info";
import { SettingsIcon } from "@/components/animate-ui/icons/settings";
import { ShieldUserIcon } from "@/components/animate-ui/icons/shield-user";
import { UsersRoundIcon } from "@/components/animate-ui/icons/users-round";
import { BridgedAnimatedIcon } from "@/components/animate-ui/bridge";
import { AppleIcon } from "@/components/ui/apple";
import { FileTextIcon } from "@/components/ui/file-text";
import { GlobeIcon } from "@/components/ui/globe";
import { LanguagesIcon } from "@/components/ui/languages";
import { ShapesIcon } from "@/components/ui/shapes";

interface NavIconProps {
  className?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

function animatedIconClassName(className?: string) {
  return className;
}

export function DashboardNavIcon({ className, ...props }: NavIconProps) {
  return (
    <GaugeIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function ReportsNavIcon({ className, ...props }: NavIconProps) {
  return (
    <FileChartPieIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function AnalyticsNavIcon({ className, ...props }: NavIconProps) {
  return (
    <ChartNoAxesCombinedIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function CategoriesNavIcon({ className, ...props }: NavIconProps) {
  return (
    <BridgedAnimatedIcon
      icon={ShapesIcon}
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function FoodItemsNavIcon({ className, ...props }: NavIconProps) {
  return (
    <BridgedAnimatedIcon
      icon={AppleIcon}
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function LanguagesNavIcon({ className, ...props }: NavIconProps) {
  return (
    <BridgedAnimatedIcon
      icon={GlobeIcon}
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function TranslationsNavIcon({ className, ...props }: NavIconProps) {
  return (
    <BridgedAnimatedIcon
      icon={LanguagesIcon}
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function ShoppingListsNavIcon({ className, ...props }: NavIconProps) {
  return (
    <ClipboardPenIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function DocumentTranslatorNavIcon({
  className,
  ...props
}: NavIconProps) {
  return (
    <BridgedAnimatedIcon
      icon={FileTextIcon}
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function AIConfigurationNavIcon({ className, ...props }: NavIconProps) {
  return (
    <BotIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function HelpNavIcon({ className, ...props }: NavIconProps) {
  return (
    <CircleHelpIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function SettingsNavIcon({ className, ...props }: NavIconProps) {
  return (
    <SettingsIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function AdminNavIcon({ className, ...props }: NavIconProps) {
  return (
    <ShieldUserIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function DataManagementNavIcon({ className, ...props }: NavIconProps) {
  return (
    <DatabaseIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function ServiceNavIcon({ className, ...props }: NavIconProps) {
  return (
    <ClipboardListIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function ServiceLogNavIcon({ className, ...props }: NavIconProps) {
  return (
    <UsersRoundIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}

export function AboutNavIcon({ className, ...props }: NavIconProps) {
  return (
    <InfoIcon
      size={16}
      className={animatedIconClassName(className)}
      {...props}
    />
  );
}
