// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import config from '@/config/config';
import { BaseApiService, parseContentDispositionFilename } from '@/services/base';
import type {
  AccessPolicy,
  AccessPolicyUpdate,
  AdministratorSummary,
  AuditPage,
  CleanSlateOptions,
  CleanSlateResult,
  DatabaseSummary,
  InviteResult,
  RestorePreview,
  RestoreResult,
  RestoreUnitId,
  RestoreUnitInfo,
  RosterUser,
  UserAccessState,
  UserRole,
} from '@/types/admin';

/**
 * Administrator-only API surface.
 *
 * Every method unwraps the server's envelope to the inner value — including
 * the mutations. Returning the raw envelope from a mutation while the GET
 * unwrapped correctly is a real bug this project has shipped before (see
 * AGENTS.md on `FoodItemService`): the malformed object lands in state and
 * crashes the next render, but only after a save.
 */
class AdminService extends BaseApiService {
  constructor() {
    super(config.api.endpoints.admin.base);
  }

  async getRoster(): Promise<{
    users: RosterUser[];
    administrators: AdministratorSummary;
  }> {
    const response = await this.get<{
      users: RosterUser[];
      administrators: AdministratorSummary;
    }>(config.api.endpoints.admin.users);
    return {
      users: response.users,
      administrators: response.administrators,
    };
  }

  async invite(email: string): Promise<InviteResult> {
    const response = await this.post<InviteResult>(
      config.api.endpoints.admin.invite,
      { email }
    );
    return {
      user: response.user,
      invitationEmailSent: response.invitationEmailSent,
    };
  }

  async setRole(id: string, role: UserRole): Promise<RosterUser> {
    const response = await this.put<{ user: RosterUser }>(
      config.api.endpoints.admin.userRole(id),
      { role }
    );
    return response.user;
  }

  async setAccess(
    id: string,
    accessState: UserAccessState
  ): Promise<RosterUser> {
    const response = await this.put<{ user: RosterUser }>(
      config.api.endpoints.admin.userAccess(id),
      { accessState }
    );
    return response.user;
  }

  async removeUser(id: string): Promise<RosterUser> {
    const response = await this.delete<{ user: RosterUser }>(
      config.api.endpoints.admin.userById(id)
    );
    return response.user;
  }

  async getAccessPolicy(): Promise<{
    policy: AccessPolicy;
    administrators: AdministratorSummary;
  }> {
    const response = await this.get<{
      policy: AccessPolicy;
      administrators: AdministratorSummary;
    }>(config.api.endpoints.admin.accessPolicy);
    return {
      policy: response.policy,
      administrators: response.administrators,
    };
  }

  async updateAccessPolicy(update: AccessPolicyUpdate): Promise<AccessPolicy> {
    const response = await this.put<{ policy: AccessPolicy }>(
      config.api.endpoints.admin.accessPolicy,
      update
    );
    return response.policy;
  }

  /**
   * Fetch the sanitized backup and hand it to the browser as a download.
   *
   * Not routed through BaseApiService: that layer parses JSON into an object,
   * and the point here is to save the bytes the server produced — re-serialising
   * a parsed object could change formatting and invalidate the manifest
   * checksum a reader is meant to verify against.
   */
  async getDatabaseSummary(): Promise<DatabaseSummary> {
    const response = await this.get<{ summary: DatabaseSummary }>(
      config.api.endpoints.admin.databaseSummary
    );
    return response.summary;
  }

  /**
   * Save the sanitized backup to disk.
   *
   * Deliberately not routed through BaseApiService: that layer parses JSON into
   * an object, and re-serialising it could change formatting and invalidate the
   * manifest checksum a reader is meant to verify the file against. The bytes
   * the server produced are the bytes that get saved.
   */
  async downloadBackup(): Promise<{ filename: string }> {
    const response = await fetch(
      `${config.api.baseUrl}${config.api.endpoints.admin.base}${config.api.endpoints.admin.backup}`,
      { credentials: 'include' }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(
        body?.error?.message ?? 'FEED could not prepare the backup. Try again in a moment.'
      );
    }

    const text = await response.text();
    const filename =
      parseContentDispositionFilename(response.headers.get('Content-Disposition')) ??
      'feed-backup.json';

    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(url);
    }

    return { filename };
  }

  async getAudit(options: { limit?: number; offset?: number } = {}): Promise<AuditPage> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const response = await this.get<{
      auditEntries: AuditPage['entries'];
      total: number;
      limit: number;
      offset: number;
    }>(`${config.api.endpoints.admin.audit}${query ? `?${query}` : ''}`);

    return {
      entries: response.auditEntries,
      total: response.total,
      limit: response.limit,
      offset: response.offset,
    };
  }

  /** What a partial restore can select, and what each unit drags in with it. */
  async getRestoreUnits(): Promise<RestoreUnitInfo[]> {
    const response = await this.get<{ units: RestoreUnitInfo[] }>(
      config.api.endpoints.admin.restoreUnits
    );
    return response.units;
  }

  /**
   * Inspect a backup file without changing anything.
   *
   * Multipart rather than BaseApiService's JSON path, and deliberately a
   * separate round trip from the restore itself: the administrator sees what
   * the file holds before anything is replaced, which is the difference between
   * a confirmation and a dare.
   */
  async validateBackup(file: File): Promise<RestorePreview> {
    const body = new FormData();
    body.append('file', file);

    const response = await fetch(
      `${config.api.baseUrl}${config.api.endpoints.admin.base}${config.api.endpoints.admin.restoreValidate}`,
      { method: 'POST', credentials: 'include', body }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ?? 'FEED could not read that file. Try another backup.'
      );
    }

    return payload.summary as RestorePreview;
  }

  /**
   * Replace the selected units from the file, then let FEED restart.
   *
   * The server responds once the swap is done and exits a moment later, so a
   * network error after this resolves is expected rather than alarming — it is
   * the restart.
   */
  async restoreBackup(file: File, units: RestoreUnitId[]): Promise<RestoreResult> {
    const body = new FormData();
    body.append('file', file);
    units.forEach(unit => body.append('units', unit));

    const response = await fetch(
      `${config.api.baseUrl}${config.api.endpoints.admin.base}${config.api.endpoints.admin.restore}`,
      { method: 'POST', credentials: 'include', body }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ?? 'The restore did not run. Your data has not been changed.'
      );
    }

    return payload.restored as RestoreResult;
  }

  /**
   * Discard the current data and return to a seeded starting state.
   *
   * Not a restore, despite sharing its machinery: there is no file to go back
   * to, only the snapshot FEED takes before the swap. The caller is expected to
   * have said so plainly before getting here.
   */
  async resetToCleanSlate(options: CleanSlateOptions): Promise<CleanSlateResult> {
    const response = await fetch(
      `${config.api.baseUrl}${config.api.endpoints.admin.base}${config.api.endpoints.admin.restoreReset}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      }
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ?? 'The reset did not run. Your data has not been changed.'
      );
    }

    return payload.reset as CleanSlateResult;
  }
}

export const adminService = new AdminService();
