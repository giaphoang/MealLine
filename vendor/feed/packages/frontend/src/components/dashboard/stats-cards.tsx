// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

"use client"

import * as React from "react"
import { Link } from "react-router-dom"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useStatsData } from "@/hooks/dashboard/useStatsData"
import { Skeleton } from "@/components/ui/skeleton"
import { AppleIcon } from "@/components/ui/apple"
import { GlobeIcon } from "@/components/ui/globe"
import { LanguagesIcon } from "@/components/ui/languages"
import { ShapesIcon } from "@/components/ui/shapes"

type AnimatedIconHandle = { startAnimation: () => void; stopAnimation: () => void }
type AnimatedIconComponent = React.ForwardRefExoticComponent<
  React.RefAttributes<AnimatedIconHandle> & { size?: number; className?: string }
>

interface StatsCardProps {
  title: string
  cardId: string
  value: string | number
  description?: string
  icon: AnimatedIconComponent
  href?: string
  trend?: {
    value: number
    isPositive: boolean
  }
}

function StatsCard({ title, value, description, icon: Icon, href, trend }: StatsCardProps) {
  const iconRef = React.useRef<AnimatedIconHandle>(null)

  React.useEffect(() => {
    iconRef.current?.startAnimation()
  }, [])

  const card = (
    <Card
      data-feed-card-interactive="true"
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      className={href ? "h-full transition-colors hover:border-primary/40 focus-within:border-primary/40" : undefined}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon ref={iconRef} size={16} className="text-muted-foreground" />
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <div className="text-2xl font-bold">{value}</div>
        {(description || trend) && (
          <div className="flex items-center text-xs text-muted-foreground">
            {trend && (
              <span className={`mr-1 ${trend.isPositive ? 'text-green-500' : 'text-red-500'}`}>
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            )}
            {description}
          </div>
        )}
      </CardContent>
    </Card>
  )

  const content = !href ? card : (
    <Link
      to={href}
      className="block rounded-xl outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label={`Open ${title}`}
    >
      {card}
    </Link>
  )
  return content
}

function StatsCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 pt-4 px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4" />
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        <Skeleton className="h-8 w-16 mb-2" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

export function StatsCards() {
  const { data, isLoading, error } = useStatsData()

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
      <StatsCardSkeleton key={i} />
      ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total Categories"
          cardId="dashboard-overview-categories"
          value="--"
          description="Error loading data"
          icon={ShapesIcon as AnimatedIconComponent}
          href="/categories"
        />
        <StatsCard
          title="Food Items"
          cardId="dashboard-overview-food-items"
          value="--"
          description="Error loading data"
          icon={AppleIcon as AnimatedIconComponent}
          href="/food-items"
        />
        <StatsCard
          title="Languages"
          cardId="dashboard-overview-languages"
          value="--"
          description="Error loading data"
          icon={GlobeIcon as AnimatedIconComponent}
          href="/languages"
        />
        <StatsCard
          title="Translations"
          cardId="dashboard-overview-translations"
          value="--"
          description="Error loading data"
          icon={LanguagesIcon as AnimatedIconComponent}
          href="/translations"
        />
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Total Categories"
        cardId="dashboard-overview-categories"
        value={data.categories.total}
        description={`${data.categories.noLimitPercentage}% assigned "No Limit"`}
        icon={ShapesIcon as AnimatedIconComponent}
        href="/categories"
      />
      <StatsCard
        title="Food Items"
        cardId="dashboard-overview-food-items"
        value={data.foodItems.total}
        description={`${data.foodItems.inStockPercentage}% in stock`}
        icon={AppleIcon as AnimatedIconComponent}
        href="/food-items"
      />
      <StatsCard
        title="Languages"
        cardId="dashboard-overview-languages"
        value={data.languages.active}
        description={`${data.languages.total - data.languages.active} more languages available`}
        icon={GlobeIcon as AnimatedIconComponent}
        href="/languages"
      />
      <StatsCard
        title="Translations"
        cardId="dashboard-overview-translations"
        value={data.translations.total}
        description={`${data.translations.languageCount} languages`}
        icon={LanguagesIcon as AnimatedIconComponent}
        href="/translations"
      />
    </div>
  )
}
