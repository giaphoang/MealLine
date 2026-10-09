import { describe, expect, test, vi } from 'vitest';
import {
  errorHandler,
  INTERNAL_FAILURE_MESSAGE,
  type AppError,
} from '../../src/middleware/error-handler';

const runHandler = (error: AppError) => {
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })), json } as never;
  errorHandler(error, { path: '/api/test', method: 'GET' } as never, res, vi.fn() as never);
  return json.mock.calls[0][0] as { error: { message: string; code: string } };
};

describe('global error handler', () => {
  test('withholds an internal failure message instead of forwarding it', () => {
    // The exact shape that leaked into a toast during procurement work: an
    // absolute server path, the query that failed, and schema internals.
    const prismaError = new Error(
      'Invalid `prisma.procurementOrderRevision.findMany()` invocation in\n' +
      '/Users/russbook/williamtemple-feed/packages/backend/src/services/procurement/index.ts:812:47\n' +
      'Unknown argument `supersededByImportId`.'
    ) as AppError;

    const body = runHandler(prismaError);

    expect(body.error.message).not.toContain('prisma.');
    expect(body.error.message).not.toContain('/Users/');
    expect(body.error.message).not.toContain('supersededByImportId');
    expect(body.error.message).toBe(INTERNAL_FAILURE_MESSAGE);
  });

  test('points a stuck user at the issue tracker rather than a named person', () => {
    const body = runHandler(new Error('Error querying the database') as AppError);

    expect(body.error.message).toContain(
      'https://github.com/MattGeiger/williamtemple-feed/issues'
    );
    expect(body.error.message).not.toContain('let Matt know');
  });

  test('withholds an unexpected runtime failure the same way', () => {
    const body = runHandler(
      new TypeError("Cannot read properties of undefined (reading 'weightHundredths')") as AppError
    );
    expect(body.error.message).not.toMatch(/undefined|weightHundredths/);
  });

  // ISSUES.md #80. The gate used to stop at 499, so a route that had gone to
  // the trouble of naming the language and saying whether retrying helps had
  // its message thrown away and replaced with the generic text. An explicit
  // statusCode is the author's signature; the range is not.
  test('forwards a curated message on a 5xx the route chose deliberately', () => {
    const providerError = new Error(
      'The translation service is busy right now (high demand for Chinese). This is temporary '
      + '-- wait about a minute, then click Generate again. No work was lost.'
    ) as AppError;
    providerError.statusCode = 503;
    providerError.code = 'AI_TRANSLATION_BUSY';

    const body = runHandler(providerError);

    expect(body.error.message).toContain('high demand for Chinese');
    expect(body.error.message).not.toBe(INTERNAL_FAILURE_MESSAGE);
    expect(body.error.code).toBe('AI_TRANSLATION_BUSY');
  });

  test('a 5xx with no statusCode is still withheld', () => {
    // The distinction that keeps the gate safe: nobody chose this status.
    const body = runHandler(
      new Error('connect ECONNREFUSED 127.0.0.1:5432 while querying Translation') as AppError
    );
    expect(body.error.message).toBe(INTERNAL_FAILURE_MESSAGE);
  });

  test('still forwards a curated message the application wrote for the user', () => {
    const importError = new Error(
      'This file does not match either standardized OFB export. Choose a Completed Orders or Agency Pickups CSV from the OFB exporter and retry.'
    ) as AppError;
    importError.statusCode = 400;
    importError.code = 'UNRECOGNIZED_OFB_EXPORT';

    const body = runHandler(importError);

    expect(body.error.message).toContain('Choose a Completed Orders or Agency Pickups CSV');
    expect(body.error.code).toBe('UNRECOGNIZED_OFB_EXPORT');
  });
});
