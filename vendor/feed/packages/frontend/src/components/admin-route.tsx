// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Link, Navigate, Outlet } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Gate for administrator-only routes.
 *
 * A Staff user who follows a link here gets an explanation rather than a silent
 * bounce to the dashboard — being redirected with no reason reads as a broken
 * link. This is presentation: the server enforces authority on every
 * `/api/admin` route independently.
 */
export const AdminRoute = () => {
  const { isAuthenticated, isAdministrator, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdministrator) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Administrators only</CardTitle>
            </div>
            <CardDescription>
              This organization-level configuration is limited to administrators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If you need access to this area, ask an administrator to update
              your role.
            </p>
            <Button asChild variant="secondary">
              <Link to="/">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
};
