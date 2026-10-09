import { describe, expect, test } from 'vitest';
import { ErrorHandlerService } from '@/services/error/ErrorHandlerService';

const presentable = (message: string, hasServerCode = false): boolean =>
  (ErrorHandlerService as unknown as {
    isUserPresentableMessage: (value: string, hasServerCode?: boolean) => boolean;
  }).isUserPresentableMessage(message, hasServerCode);

describe('toast messages never carry developer artifacts', () => {
  test('rejects the Prisma dump that leaked during procurement work', () => {
    expect(presentable(
      "\nInvalid `prisma.procurementOrderRevision.findMany()` invocation in\n" +
      "/Users/russbook/williamtemple-feed/packages/backend/src/services/procurement/index.ts:812:47\n\n" +
      "Unknown argument `supersededByImportId`. Available options are marked with ?."
    )).toBe(false);
  });

  test('rejects paths, SQL, driver codes, and oversized blobs', () => {
    expect(presentable('SQLITE_BUSY: database is locked')).toBe(false);
    expect(presentable('connect ECONNREFUSED 127.0.0.1:3001')).toBe(false);
    expect(presentable('SELECT * FROM ProcurementLine WHERE id = 1')).toBe(false);
    expect(presentable('Error in /Users/russbook/williamtemple-feed/packages/backend/src/db.ts')).toBe(false);
    expect(presentable('Cannot find module at node_modules/@prisma/client')).toBe(false);
    expect(presentable(`Something failed. ${'detail '.repeat(60)}`)).toBe(false);
  });

  test('still surfaces curated ASK-aligned messages', () => {
    expect(presentable(
      'This file does not match either standardized OFB export. Choose a Completed Orders or Agency Pickups CSV from the OFB exporter and retry.'
    )).toBe(true);
    expect(presentable('Row 14 has an invalid Pickup Time. Export the pickup range again and retry the import.')).toBe(true);
    expect(presentable('Choose an OFB CSV smaller than 5 MB.')).toBe(true);
  });
});

describe('length is a proxy for "looks like a dump", not for "too long to help"', () => {
  // ISSUES.md #60: the two-administrator refusal ran to 251 characters, and
  // this cap replaced the entire explanation with "An unexpected error
  // occurred. Please try again." — the exact opposite of ASK.
  const longButCurated =
    'Changing sam@example.org to Staff would leave 1 administrator who can sign in. ' +
    'Allowlist mode needs two, so one lost mailbox cannot lock everyone out. ' +
    'Promote another administrator first, or switch to Domain mode. ' +
    'This sentence exists only to push the message past the limit.';

  test('an over-long message the server labelled is still shown', () => {
    expect(longButCurated.length).toBeGreaterThan(240);
    // A code means one of our own routes wrote this prose deliberately.
    expect(presentable(longButCurated, true)).toBe(true);
  });

  test('the same message without a code is still capped', () => {
    // Unlabelled long text is exactly what a leaked dump looks like.
    expect(presentable(longButCurated, false)).toBe(false);
  });

  test('a code does not excuse an actual developer artifact', () => {
    // The code exemption lifts the length cap, not the shape checks.
    expect(presentable('SQLITE_BUSY: database is locked', true)).toBe(false);
    expect(presentable('Error at /Users/x/packages/backend/src/db.ts', true)).toBe(false);
    expect(presentable('{"error":"nope"}', true)).toBe(false);
  });
});
