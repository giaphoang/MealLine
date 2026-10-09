import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const executable = (candidate) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};

// Prefer the smaller headless-only distribution, but retain regular Chrome as
// a fallback. An explicit executable always takes precedence over discovery.
export function installedBrowser({
  platform = process.platform,
  arch = process.arch,
  cacheDir = path.join(os.homedir(), '.cache/puppeteer'),
  explicitPath = process.env.PUPPETEER_EXECUTABLE_PATH,
  systemPaths = platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : platform === 'linux'
      ? ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
      : [],
} = {}) {
  if (explicitPath) {
    if (!executable(explicitPath)) throw new Error(`PUPPETEER_EXECUTABLE_PATH is not executable: ${explicitPath}`);
    return explicitPath;
  }
  const suffix = platform === 'darwin'
    ? `mac-${arch === 'arm64' ? 'arm64' : 'x64'}`
    : platform === 'linux' && arch === 'x64' ? 'linux64' : undefined;
  if (suffix) {
    for (const family of ['chrome-headless-shell', 'chrome']) {
      const directory = path.join(cacheDir, family);
      if (!fs.existsSync(directory)) continue;
      for (const version of fs.readdirSync(directory).sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))) {
        const candidate = family === 'chrome-headless-shell'
          ? path.join(directory, version, `${family}-${suffix}`, family)
          : platform === 'darwin'
            ? path.join(directory, version, `chrome-${suffix}`, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')
            : path.join(directory, version, 'chrome-linux64/chrome');
        if (executable(candidate)) return candidate;
      }
    }
  }
  return systemPaths.find(executable);
}

export const browserHeadlessMode = (executablePath) =>
  executablePath && /(?:^|[\\/])chrome-headless-shell(?:\.exe)?$/.test(executablePath) ? 'shell' : 'chrome';
