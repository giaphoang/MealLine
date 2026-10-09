// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Matt Geiger
//
// FEED — Food Equity & Efficient Delivery. Application code licensed
// under AGPL-3.0-or-later; see LICENSE. William Temple House branding is
// not covered by this license; see TRADEMARKS.md.

/**
 * The error shape a route uses when it has something a person can act on.
 *
 * `middleware/error-handler.ts` treats an explicit `statusCode` as the
 * author's signature: an error carrying one has its message passed through to
 * the client, and an error without one is an accident (a Prisma fault, a
 * `TypeError`) whose message is withheld behind `INTERNAL_FAILURE_MESSAGE`.
 * That gate is why curated copy must travel as a `statusCode` rather than as
 * a bare `Error` (ISSUES.md #80).
 *
 * `code` is the machine-readable half, echoed to the client as `error.code`
 * and read there as `ApiError.code`, so a client can branch on the kind of
 * failure instead of matching on message text.
 *
 * This lived inside `routes/shopping-list-builder.ts` until the translation
 * and document routes needed the same thing. One definition, so the three
 * surfaces cannot drift into three different envelopes.
 */
export interface AppRouteError extends Error {
  statusCode?: number;
  /** Machine-readable code echoed to the client as `error.code`. */
  code?: string;
}

export const createRouteError = (
  message: string,
  statusCode = 400,
  code?: string,
): AppRouteError => {
  const error = new Error(message) as AppRouteError;
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};
