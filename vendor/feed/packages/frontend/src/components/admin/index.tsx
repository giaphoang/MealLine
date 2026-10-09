// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { createPageTitleIcon } from '@/components/layout/page-title-icon';
import { ShieldUserIcon } from '@/components/ui/shield-user';
import { SectionHeader } from '@/components/shared/section-header';
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { adminService } from '@/services/admin';
import type {
  AccessPolicy,
  AdministratorSummary,
  RosterUser,
} from '@/types/admin';
import { AccessSettings } from './access-settings';
import { AuditHistory } from './audit-history';
import { UserRoster } from './user-roster';

const PageTitleShieldUserIcon = createPageTitleIcon(ShieldUserIcon);

/**
 * Administrator surfaces: who can use FEED, how sign-in works, and what has
 * been changed.
 *
 * Everything here is organization-wide. Roles authorize actions; they never
 * partition data — every signed-in person still sees the same inventory,
 * translations, templates, and analytics.
 */
export function AdminPage() {
  const { user } = useAuth();

  const [users, setUsers] = React.useState<RosterUser[]>([]);
  const [administrators, setAdministrators] =
    React.useState<AdministratorSummary | null>(null);
  const [policy, setPolicy] = React.useState<AccessPolicy | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [roster, access] = await Promise.all([
        adminService.getRoster(),
        adminService.getAccessPolicy(),
      ]);
      setUsers(roster.users);
      setAdministrators(roster.administrators);
      setPolicy(access.policy);
    } catch (error) {
      ErrorHandlerService.handleError(error, 'adminLoadRoster');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    // Matches Settings, Data Management, and the shared DataList: RootLayout's
    // <main> already supplies the horizontal padding (px-4 sm:px-6) and the
    // bottom padding, so a page adds only pt-6. `p-6` here double-padded the
    // page and inset it further than every other route.
    <div className="space-y-6 min-w-0 w-full pt-6">
      <SectionHeader
        title="Admin"
        description="Manage who can use FEED, choose how sign-in works, and review what administrators have changed."
        icon={PageTitleShieldUserIcon}
      />

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Staff</TabsTrigger>
          <TabsTrigger value="access">Sign-in</TabsTrigger>
          <TabsTrigger value="audit">History</TabsTrigger>
        </TabsList>

        <TabsContents>
          <TabsContent value="users" className="pt-4">
            <UserRoster
              users={users}
              administrators={administrators}
              isLoading={isLoading}
              currentUserEmail={user?.email}
              onChanged={() => void load()}
            />
          </TabsContent>

          <TabsContent value="access" className="pt-4">
            <AccessSettings
              policy={policy}
              administrators={administrators}
              isLoading={isLoading}
              onChanged={() => void load()}
            />
          </TabsContent>

          <TabsContent value="audit" className="pt-4">
            <AuditHistory />
          </TabsContent>
        </TabsContents>
      </Tabs>
    </div>
  );
}

export default AdminPage;
