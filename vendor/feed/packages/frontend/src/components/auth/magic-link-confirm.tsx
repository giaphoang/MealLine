// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import config from '@/config/config';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { useBrand } from '@/contexts/BrandContext';

/**
 * The human half of the magic-link flow.
 *
 * The emailed link lands here and consumes nothing. Pressing the button POSTs
 * the token, which is the only thing that spends it.
 *
 * **This must never submit on its own.** An effect that auto-posted on mount
 * would reintroduce exactly the failure this page exists to prevent: inbound
 * mail scanners fetch and render linked pages, so an automatic submit hands
 * the token straight back to the bot. The click is the mechanism, not
 * decoration — do not "improve" this by removing it.
 */
export function MagicLinkConfirmPage() {
  const brand = useBrand();
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';

  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const apiBase = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) || config.api.baseUrl
  ).replace(/\/$/, '');

  const handleConfirm = async () => {
    setStatus('verifying');
    setErrorMessage('');

    try {
      const response = await fetch(`${apiBase}/api/auth/magic-link/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'That sign-in link could not be used.');
      }

      // Full navigation rather than client routing, so the app boots with the
      // session cookie already set.
      window.location.href = import.meta.env.BASE_URL;
    } catch (error) {
      setStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'That sign-in link could not be used.'
      );
    }
  };

  if (!email || !token) {
    return (
      <AuthPageShell>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>That link is incomplete</CardTitle>
            <CardDescription>
              It may have been broken across lines by your email program.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to {brand.identity.appName}</CardTitle>
          <CardDescription>
            Confirm that you want to sign in as {email}.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'error' && errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            onClick={() => void handleConfirm()}
            disabled={status === 'verifying'}
          >
            {status === 'verifying' ? 'Signing you in…' : 'Sign in'}
          </Button>

          {status === 'error' && (
            <Button asChild variant="secondary" className="w-full">
              <Link to="/login">Request a new link</Link>
            </Button>
          )}

          <p className="text-center text-xs text-muted-foreground">
            This step is here so that automatic email scanners cannot use your
            sign-in link before you do.
          </p>
        </CardContent>
      </Card>
    </AuthPageShell>
  );
}

export default MagicLinkConfirmPage;
