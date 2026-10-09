// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import React, { createContext, useContext, useState, useEffect } from 'react';
import config from '@/config/config';
import type { UserRole, UserAccessState } from '@/types/admin';

interface User {
  name: string;
  email: string;
  role: UserRole;
  accessState: UserAccessState;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  /**
   * Whether to show administrator surfaces. Presentation only — every
   * privileged route enforces authority independently on the server, and a
   * hidden menu item is not a security boundary.
   */
  isAdministrator: boolean;
  checkSession: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  isAdministrator: false,
  checkSession: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const apiBase = ((import.meta as any).env.VITE_API_BASE_URL || config.api.baseUrl).replace(/\/$/, '');

  const checkSession = async () => {
    try {
      const response = await fetch(`${apiBase}/api/auth/session`, {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.authenticated && data.user) {
        setIsAuthenticated(true);
        setUser({
          name: data.user.email.split('@')[0], // Use email prefix as name
          email: data.user.email,
          // The server reads these from the database on every request, so a
          // demotion or revocation is reflected on the next session check
          // rather than whenever the seven-day token happens to expire.
          role: (data.user.role as UserRole) ?? 'STAFF',
          accessState: (data.user.accessState as UserAccessState) ?? 'ALLOWED'
        });
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch(`${apiBase}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setIsAuthenticated(false);
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        isLoading,
        isAdministrator: user?.role === 'ADMINISTRATOR',
        checkSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
