#!/bin/bash
# MealLine one-shot setup: database + migration + seed data
set -euo pipefail
cd "$(dirname "$0")"

# Reuse an installed browser rather than downloading another Chromium copy.
if node --input-type=module -e 'import { installedBrowser } from "./scripts/browser.mjs"; process.exit(installedBrowser() ? 0 : 1)'; then
  export PUPPETEER_SKIP_DOWNLOAD=true
fi
npm install --cache "$PWD/.nourish/npm-cache" --prefer-offline --no-audit --no-fund

exec node --experimental-strip-types ./scripts/setup.mjs
