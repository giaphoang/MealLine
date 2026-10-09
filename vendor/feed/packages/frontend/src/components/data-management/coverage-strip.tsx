// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

// Shows what FEED can currently see across imported and synchronized sources.
//
// The two OFB channels are reported on different schedules: Warehouse orders
// appear as they are delivered, while Fresh Alliance pickups appear only after
// someone has entered them into the OFB portal. That entry competes with direct
// service work at a short-staffed agency, so a Fresh Alliance window commonly
// trails the Warehouse window by weeks.
//
// This surface is therefore deliberately descriptive. It states the observed
// window and, where useful, offers a refresh — it never implies lateness,
// incompleteness as fault, or a coverage target. A gap measures available
// data-entry time, not performance. The food arrived and was distributed
// whether or not anyone had time to type it in. See
// docs/data-management/procurement-unification-plan.md (D12).

import { Card, CardContent } from '@/components/ui/card';
import type { DataManagementCoverage } from '@/services/data-import';
import type { ProcurementDataStatus } from '@/types/procurement';

interface CoverageStripProps {
  status: ProcurementDataStatus | null;
  serviceCoverage: DataManagementCoverage | null;
  formatDate: (isoDate: string) => string;
}

interface ChannelRowProps {
  label: string;
  description: string;
  coverage: {
    recordCount: number;
    rangeStart: string | null;
    rangeEnd: string | null;
  };
  singularUnit: string;
  pluralUnit: string;
  formatDate: (isoDate: string) => string;
}

function ChannelRow({
  label,
  description,
  coverage,
  singularUnit,
  pluralUnit,
  formatDate,
}: ChannelRowProps) {
  const { recordCount, rangeStart, rangeEnd } = coverage;
  const hasWindow = recordCount > 0 && rangeStart && rangeEnd;

  return (
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-medium">{label}</p>
      {hasWindow ? (
        <>
          <p className="text-sm text-muted-foreground">
            {formatDate(rangeStart)} – {formatDate(rangeEnd)}
          </p>
          <p className="text-xs text-muted-foreground">
            {recordCount.toLocaleString()} {recordCount === 1 ? singularUnit : pluralUnit}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">Not imported yet</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </>
      )}
    </div>
  );
}

export function DataCoverageStrip({ status, serviceCoverage, formatDate }: CoverageStripProps) {
  // Tolerates a status payload without coverage — an older cached response, or
  // a browser session held open across a backend deploy. A missing window is
  // not worth taking the page down for.
  if (!status?.coverage || !serviceCoverage) return null;
  const { warehouse, freshAlliance } = status.coverage;
  if (!warehouse || !freshAlliance) return null;

  const procurementWindow = (coverage: typeof warehouse) => ({
    recordCount: coverage.eventCount,
    rangeStart: coverage.earliestDeliveryDate,
    rangeEnd: coverage.latestDeliveryDate,
  });

  return (
    <Card>
      <CardContent className="grid gap-6 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <ChannelRow
          label="OFB Warehouse"
          description="Import a Completed Orders export to see this window."
          coverage={procurementWindow(warehouse)}
          singularUnit="event"
          pluralUnit="events"
          formatDate={formatDate}
        />
        <ChannelRow
          label="Fresh Food Alliance"
          description="Import an Agency Pickups export to see this window."
          coverage={procurementWindow(freshAlliance)}
          singularUnit="event"
          pluralUnit="events"
          formatDate={formatDate}
        />
        <ChannelRow
          label="SIMC Visits"
          description="Import a SIMC service-visit export to see this window."
          coverage={serviceCoverage.simcVisits}
          singularUnit="visit"
          pluralUnit="visits"
          formatDate={formatDate}
        />
        <ChannelRow
          label="Link2Feed Visits"
          description="Import a Link2Feed visits export to see this window."
          coverage={serviceCoverage.link2feedVisits}
          singularUnit="visit"
          pluralUnit="visits"
          formatDate={formatDate}
        />
        <ChannelRow
          label="LOTTO Queue Sessions"
          description="Synchronize or import LOTTO queue history to see this window."
          coverage={serviceCoverage.lottoQueueSessions}
          singularUnit="session"
          pluralUnit="sessions"
          formatDate={formatDate}
        />
      </CardContent>
    </Card>
  );
}
