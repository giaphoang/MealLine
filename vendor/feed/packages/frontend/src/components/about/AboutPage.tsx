// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Info, SquareTerminal } from "@/components/ui/icons"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SectionHeader } from "@/components/shared/section-header"
import { APP_VERSION } from "@/config/app-version"
import { useBrand } from '@/contexts/BrandContext'

const aboutFacts = [
  { label: "Version", value: APP_VERSION },
  { label: "License", value: "AGPL-3.0-or-later" },
]

function TempleConsultingIcon() {
  return (
    <svg
      aria-label="Temple Consulting logo"
      className="mx-auto h-28 w-28 fill-current text-foreground"
      role="img"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon points="45.5 281.5 0 324.6 0 348.1 226.8 504.8 286.6 504.8 512 345.2 512 322.5 465.8 281.5 442.3 289.3 273.8 343.8 240.1 343.8 70.2 289.3 45.5 281.5" />
      <polygon points="146.1 218 247.1 203.8 266.9 203.8 364.8 218 424 266.4 424 281.5 275 312.8 239.9 312.8 90 282.2 90 266.4 146.1 218" />
      <path d="M272,182.8h-22.2c-17.5,2.8-45.8,7.1-62.8,9.5v-7.6c0,.7,36.4-71.9,37.6-74.5l25-10.4h11.3l24.3,10.4c1.9,3.3,38,73.5,38.7,74.5v7.4c-15.6-2.8-36.4-6.4-52.2-9.2Z" />
      <path d="M439.4,187.2c0,22-4,38.3-11.6,58.5l-34.3-28.4s4.5-3.8,4.5-30.5-14.7-72.7-41.6-98.9c-27-26.5-62.5-40.9-100.1-40.9-38.1,0-73.3,14.4-100.1,40.9-27,26.7-41.6,72.7-41.6,98.9s4.5,30.5,4.5,30.5l-34.3,28.4c-7.6-20.6-11.6-36.9-11.6-58.5s4.7-47.8,14.2-70.3c9.2-21.8,22.7-40.9,39.5-57.3,16.6-16.3,36.2-29.6,58.2-38.8,22.7-9.5,46.6-14,71.2-14s48.3,4.5,71.2,14c22.5,9.2,41.6,22.5,58.2,38.8,16.8,16.3,30.3,36,39.5,57.3,9.5,22.5,14.2,48.3,14.2,70.3Z" />
    </svg>
  )
}

export function AboutCard() {
  const brand = useBrand()
  return (
    <Card className="mx-auto max-w-xl rounded-lg">
      <CardContent className="flex flex-col items-center gap-6 p-8 text-center sm:p-10">
        <div className="space-y-4">
          <TempleConsultingIcon />
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">{brand.identity.appName}</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {brand.identity.tagline}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {brand.identity.description}
            </p>
          </div>
        </div>

        <dl className="grid w-full max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-left text-sm">
          <div className="contents">
            <dt className="text-right font-medium text-foreground">Made by</dt>
            <dd className="text-muted-foreground">
              <a
                href="https://www.geigertron.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Matt Geiger
              </a>
              {", "}
              <a
                href="https://templepdx.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                Temple Consulting, LLC.
              </a>{" "}
              2025-2026
            </dd>
          </div>
          <div className="contents">
            <dt className="text-right font-medium text-foreground">Made for</dt>
            <dd className="text-muted-foreground">
              <a
                href={brand.identity.organizationWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {brand.identity.organizationName}
              </a>
            </dd>
          </div>
          <div className="contents">
            <dt className="text-right font-medium text-foreground">Made with</dt>
            <dd className="text-muted-foreground">
              React, TypeScript, Node.js, Express, Prisma, Tailwind CSS, and
              Claude Code
            </dd>
          </div>
          {aboutFacts.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="text-right font-medium text-foreground">{fact.label}</dt>
              <dd className="text-muted-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>

        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          The application code is open source. William Temple House branding is
          not open source and may not be reused without separate permission.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild variant="secondary">
            <a
              href="https://github.com/MattGeiger/williamtemple-feed"
              target="_blank"
              rel="noopener noreferrer"
            >
              <SquareTerminal className="h-4 w-4" aria-hidden="true" />
              Source Code on GitHub
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function AboutPage() {
  const brand = useBrand()
  return (
    <div className="space-y-6 min-w-0 w-full pt-6">
      <div className="w-full min-w-0">
        <SectionHeader
          icon={Info}
          title={`About ${brand.identity.appName}`}
          description="A brief note about the project, its source, and its license."
        />
      </div>
      <AboutCard />
    </div>
  )
}
