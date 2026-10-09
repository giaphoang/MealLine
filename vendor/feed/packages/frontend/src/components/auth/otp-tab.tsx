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
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/components/ui/use-toast";
import config from "@/config/config";
import { useBrand } from '@/contexts/BrandContext';

// `requestFailed` is distinct from `error` on purpose. A failure to *send* a
// code must keep the user on the email step — advancing to the code entry
// screen would claim "Code sent to <address>" next to a message explaining
// they are not allowed to sign in, which is what a revoked account used to
// see. `error` covers a failed *verification*, where staying on the code
// screen is right because the next action is to re-enter the code.
type OTPStatus =
  | "idle"
  | "requesting"
  | "requestFailed"
  | "sent"
  | "verifying"
  | "error";

export function OTPTab() {
  const brand = useBrand();
  const apiBase =
    ((import.meta.env.VITE_API_BASE_URL as string | undefined) || config.api.baseUrl).replace(/\/$/, '');
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [status, setStatus] = useState<OTPStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const { toast } = useToast();

  const handleRequestOTP = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("requesting");
    setErrorMessage("");
    setOtpCode("");

    try {
      const response = await fetch(`${apiBase}/api/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to send verification code');
      }

      // Simulate success
      setStatus("sent");
      toast({
        title: "Verification code sent",
        description: "Check your email for the 6-digit code (expires in 3 minutes).",
      });
    } catch (error) {
      setStatus("requestFailed");
      const message = error instanceof Error ? error.message : "Unable to send verification code";
      setErrorMessage(message);
      toast({
        variant: "destructive",
        title: "Could not send code",
        description: message,
      });
    }
  };

  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("verifying");
    setErrorMessage("");

    try {
      const response = await fetch(`${apiBase}/api/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
        credentials: 'include'
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Verification failed');
      }

      const data = await response.json();

      toast({
        title: "Verification successful",
        description: "Signing you in...",
      });

      // Redirect to dashboard after brief delay
      setTimeout(() => {
        window.location.href = import.meta.env.BASE_URL;
      }, 500);
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "Verification failed. Please try again.";
      setErrorMessage(message);
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: message,
      });
    }
  };

  const handleChangeEmail = () => {
    setStatus("idle");
    setOtpCode("");
    setErrorMessage("");
  };

  // Show the email step until a code has actually been sent. A failed request
  // stays here and reports why, rather than advancing to a code prompt for a
  // code that was never sent.
  if (status === "idle" || status === "requesting" || status === "requestFailed") {
    return (
      <form onSubmit={handleRequestOTP} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="otp-email">Work email</Label>
          <Input
            id="otp-email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              // Clear a stale refusal as soon as they change the address.
              if (status === "requestFailed") {
                setStatus("idle");
                setErrorMessage("");
              }
            }}
            placeholder={brand.staff.emailPlaceholder}
            className="bg-white dark:bg-slate-950"
            required
            disabled={status === "requesting"}
          />
        </div>

        {status === "requestFailed" && errorMessage && (
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={status === "requesting"}>
          {status === "requesting" ? "Sending..." : "Send 6-digit code"}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          We'll email you a 6-digit code that expires in 3 minutes.
        </p>
      </form>
    );
  }

  // Show OTP input form after code is sent
  return (
    <form onSubmit={handleVerifyOTP} className="space-y-4">
      <div className="space-y-3">
        <Label htmlFor="otp-code" className="text-center block">Enter 6-digit code</Label>
        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={otpCode}
            onChange={(value) => setOtpCode(value)}
            disabled={status === "verifying"}
          >
            <InputOTPGroup className="gap-2">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <InputOTPSlot key={idx} index={idx} className="h-11 w-11" />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <p className="text-xs text-muted-foreground text-center">Code sent to {email}</p>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleChangeEmail}
          className="flex-1"
          disabled={status === "verifying"}
        >
          Change email
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={status === "verifying" || otpCode.length !== 6}
        >
          {status === "verifying" ? "Verifying..." : "Verify"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Codes expire after 3 minutes. Five failed attempts trigger a short lockout.
      </p>
    </form>
  );
}
