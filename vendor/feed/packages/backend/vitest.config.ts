/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // The Shopping List Builder's preview-pdf tests launch Chromium and render
    // a real PDF. That takes ~5.6s on this hardware — already past Vitest's
    // 5000ms default in a *serial* run, so they passed only when they happened
    // to land under the line, and any extra load (parallel workers, a dev
    // server, a build) pushed them over. The failures moved between runs and
    // read as unrelated flakiness; they were one timeout that is too short for
    // what these tests genuinely do.
    //
    // 30s is deliberately generous. A browser launch plus a full render is
    // multi-second work by nature, and a false failure costs more than a slow
    // one: it teaches people to re-run the suite until it is green.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '__tests_archive__/**/*'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '__tests_archive__/**/*'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
