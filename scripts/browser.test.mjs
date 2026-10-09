import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installedBrowser, browserHeadlessMode } from './browser.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nourish-browser-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const binary = (relative, mode = 0o700) => {
    const location = path.join(directory, relative);
    fs.mkdirSync(path.dirname(location), { recursive: true });
    fs.writeFileSync(location, 'fixture executable', { mode });
    return location;
  };
  return { directory, binary, options: { platform: 'darwin', arch: 'arm64', cacheDir: directory, explicitPath: undefined, systemPaths: [] } };
}

test('prefers the newest compatible headless shell over full Chrome', (t) => {
  const { binary, options } = fixture(t);
  binary('chrome/mac_arm-140.0.1/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  binary('chrome-headless-shell/mac_arm-99.0.1/chrome-headless-shell-mac-arm64/chrome-headless-shell');
  const expected = binary('chrome-headless-shell/mac_arm-136.0.1/chrome-headless-shell-mac-arm64/chrome-headless-shell');
  assert.equal(installedBrowser(options), expected);
  assert.equal(browserHeadlessMode(expected), 'shell');
});

test('ignores empty caches, non-executable files, and the wrong architecture', (t) => {
  const { binary, directory, options } = fixture(t);
  fs.mkdirSync(path.join(directory, 'chrome-headless-shell/mac_arm-999.0.1'), { recursive: true });
  binary('chrome-headless-shell/mac_arm-140.0.1/chrome-headless-shell-mac-arm64/chrome-headless-shell', 0o600);
  binary('chrome-headless-shell/mac-140.0.1/chrome-headless-shell-mac-x64/chrome-headless-shell');
  const expected = binary('chrome/mac_arm-136.0.1/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  assert.equal(installedBrowser(options), expected);
  assert.equal(browserHeadlessMode(expected), 'chrome');
});

test('falls back to installed system Chrome when the cache is absent', (t) => {
  const { binary, options } = fixture(t);
  const expected = binary('system/Chrome');
  assert.equal(installedBrowser({ ...options, systemPaths: [expected] }), expected);
});

test('honors valid explicit paths and rejects invalid ones', (t) => {
  const { binary, directory, options } = fixture(t);
  const expected = binary('custom/Chrome');
  assert.equal(installedBrowser({ ...options, explicitPath: expected }), expected);
  assert.throws(() => installedBrowser({ ...options, explicitPath: path.join(directory, 'missing') }), /not executable/);
});

test('returns undefined when no installed browser is available', (t) => {
  assert.equal(installedBrowser(fixture(t).options), undefined);
});
