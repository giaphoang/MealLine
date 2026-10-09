// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
// Native animate-ui icons: TableActionMenu drives them through AnimateIconContext,
// which imperative-ref icons cannot read — they would ignore the `animate` and
// `animateOnHover` triggers and only respond to hovering the glyph itself.
// See docs/motion/ICON_ANIMATIONS.md, "Action Menu Icons".
//
// Role actions use the shield family; access actions use the person/ban family.
// Keeping the two kinds visually distinct is why "Change to Staff" and
// "Revoke access" no longer share an icon.
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { BanIcon } from '@/components/animate-ui/icons/ban';
import { ShieldCheckIcon } from '@/components/animate-ui/icons/shield-check';
import { ShieldMinusIcon } from '@/components/animate-ui/icons/shield-minus';
import { Trash2Icon } from '@/components/animate-ui/icons/trash-2';
import { UserRoundCheckIcon } from '@/components/animate-ui/icons/user-round-check';
import { UserRoundPlusIcon } from '@/components/animate-ui/icons/user-round-plus';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { TableActionMenu } from '@/components/ui/table-action-menu';
import type { TableRowAction } from '@/types/table';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { adminService } from '@/services/admin';
import type { AdministratorSummary, RosterUser } from '@/types/admin';
import { formatDate } from '@/lib/formatting/date';
import { EnhancedDataTable } from '@/components/ui/enhanced-data-table';
import type { ColumnDef } from '@tanstack/react-table';

interface UserRosterProps {
  users: RosterUser[];
  administrators: AdministratorSummary | null;
  isLoading: boolean;
  currentUserEmail: string | undefined;
  onChanged: () => void;
}

/** A person's sign-in history, in the terms an administrator prunes by. */
const signInSummary = (user: RosterUser): string => {
  if (user.lastLoginAt) {
    return formatDate(user.lastLoginAt);
  }
  // Invited but never signed in — distinct from "has an account but has not
  // signed in since last sign-in was first recorded".
  return user.emailVerified ? 'Not since this update' : 'Not yet signed in';
};

type PendingConfirm = {
  title: string;
  description: string;
  actionLabel: string;
  destructive?: boolean;
  run: () => Promise<void>;
};

export function UserRoster({
  users,
  administrators,
  isLoading,
  currentUserEmail,
  onChanged,
}: UserRosterProps) {
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [confirm, setConfirm] = React.useState<PendingConfirm | null>(null);

  const runGuarded = async (operation: () => Promise<void>, context: string) => {
    setIsSubmitting(true);
    try {
      await operation();
      onChanged();
    } catch (error) {
      // Guard refusals arrive as 409s carrying their own explanation — the
      // last-administrator rule, or the Allowlist two-administrator minimum.
      ErrorHandlerService.handleError(error, context);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInvite = async () => {
    await runGuarded(async () => {
      const result = await adminService.invite(inviteEmail.trim());
      setInviteOpen(false);
      setInviteEmail('');

      if (result.invitationEmailSent) {
        messageService.success(
          `${result.user.email} was added as Staff and sent an invitation.`
        );
      } else {
        messageService.info(
          `${result.user.email} was added as Staff, but the invitation email could not be sent. Let them know they can sign in.`
        );
      }
    }, 'adminInviteUser');
  };

  const actionsFor = (user: RosterUser): TableRowAction[] => {
    const isSelf = user.email === currentUserEmail;
    const isAdmin = user.role === 'ADMINISTRATOR';
    const isRevoked = user.accessState === 'REVOKED';

    return [
      isAdmin
        ? {
            label: 'Change to Staff',
            icon: ShieldMinusIcon,
            onClick: () =>
              setConfirm({
                title: `Change ${user.email} to Staff?`,
                description: isSelf
                  ? 'You will lose access to the Admin page immediately. Another administrator will have to restore it.'
                  : 'They keep full access to FEED, but can no longer manage staff access or view this history.',
                actionLabel: 'Change to Staff',
                run: () =>
                  runGuarded(
                    () => adminService.setRole(user.id, 'STAFF').then(() => {
                      messageService.success(`${user.email} is now Staff.`);
                    }),
                    'adminSetRole'
                  ),
              }),
          }
        : {
            label: 'Make Administrator',
            icon: ShieldCheckIcon,
            onClick: () =>
              setConfirm({
                title: `Make ${user.email} an Administrator?`,
                description:
                  'Administrators can manage staff access, change how sign-in works, and review the activity history.',
                actionLabel: 'Make Administrator',
                run: () =>
                  runGuarded(
                    () =>
                      adminService.setRole(user.id, 'ADMINISTRATOR').then(() => {
                        messageService.success(
                          `${user.email} is now an Administrator.`
                        );
                      }),
                    'adminSetRole'
                  ),
              }),
          },
      isRevoked
        ? {
            label: 'Restore access',
            icon: UserRoundCheckIcon,
            onClick: () =>
              runGuarded(
                () =>
                  adminService.setAccess(user.id, 'ALLOWED').then(() => {
                    messageService.success(`${user.email} can sign in again.`);
                  }),
                'adminSetAccess'
              ),
          }
        : {
            label: 'Revoke access',
            icon: BanIcon,
            variant: 'destructive' as const,
            onClick: () =>
              setConfirm({
                title: `Revoke access for ${user.email}?`,
                description:
                  'They are signed out on their next action and cannot sign in again until access is restored. This holds whichever sign-in mode is active.',
                actionLabel: 'Revoke access',
                destructive: true,
                run: () =>
                  runGuarded(
                    () =>
                      adminService.setAccess(user.id, 'REVOKED').then(() => {
                        messageService.success(
                          `${user.email} can no longer sign in.`
                        );
                      }),
                    'adminSetAccess'
                  ),
              }),
          },
      {
        label: 'Remove from roster',
        icon: Trash2Icon,
        variant: 'destructive' as const,
        onClick: () =>
          setConfirm({
            title: `Remove ${user.email}?`,
            description:
              'This deletes their roster row and its sign-in history. If their mailbox still works, signing in would create a new Staff account — revoke access instead if you want a durable block.',
            actionLabel: 'Remove',
            destructive: true,
            run: () =>
              runGuarded(
                () =>
                  adminService.removeUser(user.id).then(() => {
                    messageService.success(`${user.email} was removed.`);
                  }),
                'adminRemoveUser'
              ),
          }),
      },
    ];
  };

  /**
   * The roster renders through EnhancedDataTable like every other table.
   *
   * It was hand-rolled — five rows, no sorting or filtering, so a plain
   * <Table> looked like the simpler choice. What it actually bought was a
   * second table to maintain, and it drifted immediately: an unlabelled 48px
   * actions header where every other table names the column and pins it to 72.
   * Widths, alignment, and the actions column now come from the standard
   * (docs/layout/table-standard.md) rather than from this file.
   */
  const columns = React.useMemo<ColumnDef<RosterUser>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        size: 300,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.email}
            {row.original.email === currentUserEmail && (
              <span className="ml-2 text-xs text-muted-foreground">(you)</span>
            )}
          </span>
        ),
      },
      {
        accessorKey: 'role',
        header: 'Role',
        size: 130,
        cell: ({ row }) => (
          <Badge variant={row.original.role === 'ADMINISTRATOR' ? 'default' : 'secondary'}>
            {row.original.role === 'ADMINISTRATOR' ? 'Administrator' : 'Staff'}
          </Badge>
        ),
      },
      {
        accessorKey: 'accessState',
        header: 'Access',
        size: 120,
        cell: ({ row }) => (
          <Badge variant={row.original.accessState === 'REVOKED' ? 'destructive' : 'outline'}>
            {row.original.accessState === 'REVOKED' ? 'Revoked' : 'Allowed'}
          </Badge>
        ),
      },
      {
        id: 'lastSignIn',
        header: 'Last sign-in',
        size: 180,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{signInSummary(row.original)}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableHiding: false,
        size: 72,
        cell: ({ row }) => (
          <TableActionMenu
            actions={actionsFor(row.original)}
            isLoading={isSubmitting}
            size="sm"
          />
        ),
      },
    ],
    // `actionsFor` closes over the confirm/submit handlers, so it is rebuilt
    // each render; the columns follow it rather than going stale.
    [currentUserEmail, actionsFor, isSubmitting]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {administrators ? (
            <>
              {administrators.eligible} administrator
              {administrators.eligible === 1 ? '' : 's'} can sign in.{' '}
              {administrators.mode === 'ALLOWLIST'
                ? 'Allowlist mode requires at least 2.'
                : 'Domain mode requires at least 1.'}
            </>
          ) : (
            <Skeleton className="h-4 w-64" />
          )}
        </div>
        {/* Wrap the Button, not the icon: `asChild` attaches the handlers to
            the direct child, so wrapping the icon would only animate on hover
            of the glyph's own box and never on the label. Matches the
            TableFeatureBar pattern. */}
        <AnimateIcon asChild animateOnHover animateOnTap>
          <Button onClick={() => setInviteOpen(true)} disabled={isSubmitting}>
            <UserRoundPlusIcon className="mr-2 h-4 w-4" />
            Invite
          </Button>
        </AnimateIcon>
      </div>

      <EnhancedDataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        // A roster is a known set, not a search result: a filter box and a
        // column picker over five rows is chrome without a job.
        enableFiltering={false}
        enableColumnVisibility={false}
        emptyMessage="No one is on the roster yet."
      />

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite someone to FEED</DialogTitle>
            <DialogDescription>
              They are added as Staff and emailed a link to the sign-in page. The
              email contains no sign-in code — they request one themselves.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="invite-email">Work email address</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder="name@example.org"
              value={inviteEmail}
              onChange={event => setInviteEmail(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && inviteEmail.trim()) {
                  event.preventDefault();
                  void handleInvite();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleInvite()}
              disabled={!inviteEmail.trim() || isSubmitting}
            >
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={open => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm?.destructive
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : undefined
              }
              onClick={() => {
                const pending = confirm;
                setConfirm(null);
                void pending?.run();
              }}
            >
              {confirm?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
