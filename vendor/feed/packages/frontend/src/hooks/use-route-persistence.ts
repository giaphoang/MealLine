// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ROUTE_STORAGE_KEY = 'last_route';
const INTENTIONAL_DASHBOARD_KEY = 'intentional_dashboard';

/**
 * Custom hook to maintain route persistence across page refreshes
 * Saves the current route to localStorage whenever it changes
 */
export function useRoutePersistence() {
  const location = useLocation();
  
  // Handle route storage for persistence
  useEffect(() => {
    // Don't store login/logout routes
    if (location.pathname === '/login' || location.pathname === '/logout') {
      return;
    }
    
    // Check if we're on the dashboard
    if (location.pathname === '/') {
      // Check if this was an intentional navigation to dashboard
      const intentionalDashboard = sessionStorage.getItem(INTENTIONAL_DASHBOARD_KEY);
      
      if (intentionalDashboard === 'true') {
        // If intentional, clear the stored route
        localStorage.removeItem(ROUTE_STORAGE_KEY);
        // And clear the intentional flag
        sessionStorage.removeItem(INTENTIONAL_DASHBOARD_KEY);
      }
      return;
    }
    
    // Store any non-dashboard route
    localStorage.setItem(ROUTE_STORAGE_KEY, location.pathname);
  }, [location.pathname]);
  
  return null;
}

/**
 * Helper function to mark dashboard navigation as intentional
 * Call this function before navigating to dashboard
 */
export function markDashboardNavigation() {
  sessionStorage.setItem(INTENTIONAL_DASHBOARD_KEY, 'true');
}