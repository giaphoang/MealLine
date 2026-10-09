// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

import { Prisma } from '@prisma/client';
import prisma from '../../db';
import {
  AuditAction,
  AuditTargetType,
  AUDIT_TARGET_TYPES,
} from './authorization';

/**
 * Accepts either the shared client or a transaction client, so an audit entry
 * can be written in the same transaction as the mutation it records. A grant
 * that succeeds while its audit row is rolled back would leave the roster's
 * history silently wrong.
 */
type PrismaLike = Prisma.TransactionClient | typeof prisma;

export interface AuditActor {
  /** Null for non-interactive actors (migration, CLI). */
  userId: string | null;
  /** Email, or a `SYSTEM_ACTORS` label. Retained if the actor is later deleted. */
  label: string;
}

export interface AuditEntryInput {
  actor: AuditActor;
  action: AuditAction;
  targetType?: AuditTargetType;
  targetId?: string | null;
  targetLabel?: string | null;
  detail?: Prisma.InputJsonValue;
}

export interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  action?: string;
  actorUserId?: string;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export class AdminAuditService {
  /**
   * Append one privileged-action record: actor, target, action, timestamp.
   *
   * Pass `client` when recording inside a transaction.
   */
  static async record(
    entry: AuditEntryInput,
    client: PrismaLike = prisma
  ): Promise<void> {
    await client.adminAuditLog.create({
      data: {
        actorUserId: entry.actor.userId,
        actorLabel: entry.actor.label,
        action: entry.action,
        targetType: entry.targetType ?? AUDIT_TARGET_TYPES.USER,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel ?? null,
        detail: entry.detail ?? Prisma.JsonNull,
      },
    });
  }

  /**
   * Read the audit history, newest first.
   */
  static async list(options: AuditQueryOptions = {}) {
    const take = Math.min(
      Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1),
      MAX_PAGE_SIZE
    );
    const skip = Math.max(options.offset ?? 0, 0);

    const where: Prisma.AdminAuditLogWhereInput = {};
    if (options.action) {
      where.action = options.action;
    }
    if (options.actorUserId) {
      where.actorUserId = options.actorUserId;
    }

    const [entries, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    return { entries, total, limit: take, offset: skip };
  }
}
