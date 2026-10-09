// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";
import config from "@/config/config";
import { useBrand } from '@/contexts/BrandContext';

export function MagicLinkTab() {
  const brand = useBrand();
  const apiBase =
    ((import.meta.env.VITE_API_BASE_URL as string | undefined) || config.api.baseUrl).replace(/\/$/, '');
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const { toast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("idle");
    setErrorMessage("");
    setIsLoading(true);

    try {
      const response = await fetch(`${apiBase}/api/auth/magic-link/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to send magic link');
      }

      // Simulate success
      setStatus("sent");
      toast({
        title: "Magic link sent",
        description: "Check your email for the sign-in link (expires in 10 minutes).",
      });
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "Unable to send magic link";
      setErrorMessage(message);
      toast({
        variant: "destructive",
        title: "Could not send magic link",
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="magic-email">Work email</Label>
        <Input
          id="magic-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={brand.staff.emailPlaceholder}
          className="bg-white dark:bg-slate-950"
          required
          disabled={isLoading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? "Sending..." : "Send magic link"}
      </Button>

      {status === "sent" && (
        <Alert>
          <AlertDescription>
            Check your email for the sign-in link. It expires in 10 minutes.
          </AlertDescription>
        </Alert>
      )}

      {status === "error" && errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground text-center">
        We'll email you a sign-in link that expires in 10 minutes.
      </p>
    </form>
  );
}
