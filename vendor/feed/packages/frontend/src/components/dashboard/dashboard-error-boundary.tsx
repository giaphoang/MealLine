// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Component, ErrorInfo, ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from "@/components/ui/icons";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Dashboard-specific error boundary with React Query integration
 * Provides error recovery and cache reset functionality
 */
class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <QueryErrorResetBoundary>
          {({ reset }) => (
            <Card className="mx-auto max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/20">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <CardTitle>Dashboard Error</CardTitle>
                <CardDescription>
                  {this.state.error?.message || 'An unexpected error occurred while loading dashboard data.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button
                  onClick={() => {
                    reset();
                    this.setState({ hasError: false, error: undefined });
                  }}
                  className="w-full"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          )}
        </QueryErrorResetBoundary>
      );
    }

    return this.props.children;
  }
}

export default DashboardErrorBoundary;
