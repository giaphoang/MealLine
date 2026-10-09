// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useAuth } from "@/contexts/AuthContext";
import { LoginPage as LoginForm } from "@/components/auth/login-page";
import { Navigate } from "react-router-dom";
import { AuthPageShell } from '@/components/auth/auth-page-shell';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();

  // Avoid redirect loops while session status is loading
  if (isLoading) {
    return null;
  }
  
  // If already authenticated, redirect to dashboard
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthPageShell>
      <LoginForm />
    </AuthPageShell>
  );
}
