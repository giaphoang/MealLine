// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';
import { messageService } from '@/services/message';
import { adminService } from '@/services/admin';
import {
  DENIED_MESSAGE_MAX_LENGTH,
  type AccessMode,
  type AccessPolicy,
  type AdministratorSummary,
} from '@/types/admin';

interface AccessSettingsProps {
  policy: AccessPolicy | null;
  administrators: AdministratorSummary | null;
  isLoading: boolean;
  onChanged: () => void;
}

export function AccessSettings({
  policy,
  administrators,
  isLoading,
  onChanged,
}: AccessSettingsProps) {
  const [mode, setMode] = React.useState<AccessMode>('DOMAIN');
  const [deniedMessage, setDeniedMessage] = React.useState('');
  const [contactEmail, setContactEmail] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (policy) {
      setMode(policy.mode);
      setDeniedMessage(policy.deniedMessage);
      setContactEmail(policy.contactEmail);
    }
  }, [policy]);

  const isDirty =
    policy !== null &&
    (mode !== policy.mode ||
      deniedMessage !== policy.deniedMessage ||
      contactEmail !== policy.contactEmail);

  const switchingToAllowlist = mode === 'ALLOWLIST' && policy?.mode === 'DOMAIN';
  const tooFewAdministrators =
    switchingToAllowlist &&
    administrators !== null &&
    administrators.eligible < 2;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await adminService.updateAccessPolicy({
        mode,
        deniedMessage: deniedMessage.trim(),
        contactEmail: contactEmail.trim(),
      });
      messageService.success(
        mode === 'ALLOWLIST'
          ? 'Allowlist mode is on. Only people on the roster can sign in.'
          : 'Domain mode is on. Anyone with an organization address whose access is not revoked can sign in.'
      );
      onChanged();
    } catch (error) {
      // The server refuses an unsafe switch — no administrator on the roster,
      // or fewer than two who can sign in — with its own explanation.
      ErrorHandlerService.handleError(error, 'adminUpdateAccessPolicy');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !policy) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who can sign in</CardTitle>
        <CardDescription>
          Revoked accounts are blocked in either mode. Changing this affects
          sign-in only — it never changes what a signed-in person can see.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="access-mode">Sign-in mode</Label>
          <Select
            value={mode}
            onValueChange={value => setMode(value as AccessMode)}
          >
            <SelectTrigger id="access-mode" className="max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DOMAIN">
                Domain — anyone with an organization email address
              </SelectItem>
              <SelectItem value="ALLOWLIST">
                Allowlist — only people on the roster
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {mode === 'ALLOWLIST'
              ? 'A colleague whose mailbox is compromised cannot reach FEED unless they are on the roster. Add new staff with Invite before their first sign-in.'
              : 'Anyone whose organization mailbox works can sign in and gets a Staff account on first use.'}
          </p>
        </div>

        {switchingToAllowlist && (
          // `items-start` overrides the Alert root's `items-center` so the icon
          // sits on the first line, and the title/description are wrapped so
          // they stack rather than laying out along the root's flex row.
          <Alert
            variant={tooFewAdministrators ? 'destructive' : 'warning'}
            className="items-start"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <AlertTitle>
                {tooFewAdministrators
                  ? 'Not enough administrators to switch safely'
                  : 'Check the roster before switching'}
              </AlertTitle>
              <AlertDescription>
                {tooFewAdministrators
                  ? `Only ${administrators?.eligible ?? 0} administrator can sign in. Allowlist mode requires two, so a changed or lost mailbox cannot lock everyone out. Promote another administrator first.`
                  : 'After this change, anyone not on the roster is turned away — including colleagues with valid organization addresses. Confirm the roster is right first.'}
              </AlertDescription>
            </div>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="denied-message">Message for people turned away</Label>
          <Textarea
            id="denied-message"
            value={deniedMessage}
            maxLength={DENIED_MESSAGE_MAX_LENGTH}
            rows={3}
            className="max-w-2xl"
            onChange={event => setDeniedMessage(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {deniedMessage.length}/{DENIED_MESSAGE_MAX_LENGTH} characters. The
            contact address below is added to the end automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">Contact address</Label>
          <Input
            id="contact-email"
            type="email"
            className="max-w-md"
            placeholder="admin@example.org"
            value={contactEmail}
            onChange={event => setContactEmail(event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Shown to anyone who cannot sign in. Leave blank to show no contact.
          </p>
        </div>

        <div className="rounded-md border bg-muted/40 p-4">
          <p className="text-sm font-medium">They will see:</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {deniedMessage.trim() || 'FEED access is limited to authorized staff.'}
            {contactEmail.trim() ? ` Contact ${contactEmail.trim()} for access.` : ''}
          </p>
        </div>
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Button
          variant="secondary"
          disabled={!isDirty || isSaving}
          onClick={() => {
            setMode(policy.mode);
            setDeniedMessage(policy.deniedMessage);
            setContactEmail(policy.contactEmail);
          }}
        >
          Discard changes
        </Button>
        <Button
          disabled={!isDirty || isSaving || tooFewAdministrators}
          onClick={() => void handleSave()}
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}
