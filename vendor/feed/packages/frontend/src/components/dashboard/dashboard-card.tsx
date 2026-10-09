// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardCardProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
  error?: boolean;
  errorMessage?: string;
  className?: string;
}

export function DashboardCard({
  title,
  description,
  icon: Icon,
  iconClassName = "text-muted-foreground",
  children,
  footer,
  loading = false,
  error = false,
  errorMessage = "Failed to load data",
  className,
}: DashboardCardProps) {
  return (
    <Card
      data-feed-card-interactive="true"
      className={cn("h-full flex flex-col", className)}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {Icon && <Icon className={cn("h-4 w-4", iconClassName)} />}
      </CardHeader>
      
      <CardContent className="flex-1 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="h-[180px] w-[80%]" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[180px] text-muted-foreground">
            {errorMessage}
          </div>
        ) : (
          children
        )}
      </CardContent>
      
      {footer && !loading && !error && (
        <CardFooter className="mt-auto pt-2">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}

// For skeleton loading states
export function DashboardCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <Skeleton className="h-6 w-32 mb-1" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent className="py-2">
        <div className="flex items-center justify-center">
          <Skeleton className="h-[180px] w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
