// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger

import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, PackageCheck } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { operationalReportsService } from '@/services/operational-reports';
import { OperationalAnalyticsResult } from '@/types/operational-reports';
import { useTerminology } from '@/contexts/TerminologyContext';

export function DashboardOperationalCards() {
  const terminology = useTerminology();
  const [data, setData] = React.useState<OperationalAnalyticsResult | null>(null);

  React.useEffect(() => {
    let active = true;
    operationalReportsService.query({ preset: 'last-90-days' })
      .then((result) => active && setData(result))
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (!data) {
    return <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link to="/analytics" className="rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Card className="h-full transition-colors hover:translation-options-column">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unavailable Items</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data.summary.unavailableNow}</p>
            <p className="text-xs text-muted-foreground">{terminology.format('Not currently offered to {clients}')}</p>
          </CardContent>
        </Card>
      </Link>
      <Link to="/analytics" className="rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Card className="h-full transition-colors hover:translation-options-column">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Limited Supply</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{data.summary.limitedSupplyNow}</p>
            <p className="text-xs text-muted-foreground">Items staff marked under supply pressure</p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
