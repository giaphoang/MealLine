#!/bin/bash
# Nourish one-shot setup: database + migration + seed data
set -euo pipefail
cd "$(dirname "$0")"

exec node --experimental-strip-types ./scripts/setup.mjs
