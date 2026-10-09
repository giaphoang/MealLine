#!/bin/bash
# One-command live Twilio phone test on the Mac.
# Usage:  bash ~/Documents/mealline/run-phone-test.sh
# Expects .env to contain TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.
# Prints the two webhook URLs to paste into the Twilio console.
# Also writes the tunnel URL to /tmp/mealline-tunnel-url.txt for automation.
set -euo pipefail
cd "$(dirname "$0")"
rm -f /tmp/mealline-tunnel-url.txt
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; exit 1; }
command -v node >/dev/null || { echo "Installing Node.js..."; brew install node; }
command -v cloudflared >/dev/null || { echo "Installing cloudflared..."; brew install cloudflared; }
if ! command -v psql >/dev/null; then
  if [ -x "/Library/PostgreSQL/16/bin/psql" ]; then
    export PATH="/Library/PostgreSQL/16/bin:$PATH"
  elif [ -x "/Library/PostgreSQL/17/bin/psql" ]; then
    export PATH="/Library/PostgreSQL/17/bin:$PATH"
  else
    echo "Installing PostgreSQL 16..."
    brew install postgresql@16
    brew services start postgresql@16
  fi
fi

[ -d node_modules ] || { echo "Installing dependencies..."; npm install --no-audit --no-fund; }

if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "Starting PostgreSQL..."
  (brew services start postgresql@16 2>/dev/null || brew services start postgresql@17 2>/dev/null || true)
  sleep 6
fi
pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 || { echo "PostgreSQL is not running. Start it and re-run."; exit 1; }
psql -h 127.0.0.1 -p 5432 -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='mealline'" | grep -q 1 \
  || psql -h 127.0.0.1 -p 5432 -d postgres -c "CREATE DATABASE mealline;"

[ -f .env ] || { echo "Missing .env"; exit 1; }
grep -qE "^TWILIO_AUTH_TOKEN=.+" .env || { echo ".env needs TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"; exit 1; }

set -a; source .env; set +a
: "${MEALLINE_DATABASE_URL:=postgresql://127.0.0.1:5432/mealline}"
export MEALLINE_DATABASE_URL
npm run migrate
npm run seed

echo "Starting app..."
rm -f /tmp/mealline-dev.log
(cd "$(pwd)" && npm run dev > /tmp/mealline-dev.log 2>&1 &)
sleep 12
# Next.js picks another port if 3000 is taken (e.g. FoodFit). Detect the real one.
APP_PORT=$(grep -oE "http://localhost:[0-9]+" /tmp/mealline-dev.log | head -1 | grep -oE "[0-9]+" || true)
[ -n "$APP_PORT" ] || APP_PORT=3000
curl -s -o /dev/null --max-time 5 "http://127.0.0.1:$APP_PORT/" \
  || { echo "App failed to start on port $APP_PORT. See /tmp/mealline-dev.log"; exit 1; }
echo "App is on port $APP_PORT"

echo "Opening public tunnel..."
pkill -f "cloudflared tunnel" 2>/dev/null || true
rm -f /tmp/mealline-tunnel.log
(cloudflared tunnel --url "http://127.0.0.1:$APP_PORT" > /tmp/mealline-tunnel.log 2>&1 &)
TUNNEL=""
for _ in $(seq 1 30); do
  TUNNEL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/mealline-tunnel.log | grep -v "^https://api\." | head -1)
  [ -n "$TUNNEL" ] && break
  sleep 2
done
[ -n "$TUNNEL" ] || { echo "Tunnel failed. See /tmp/mealline-tunnel.log"; exit 1; }
echo "$TUNNEL" > /tmp/mealline-tunnel-url.txt

# Webhook signature validation + TwiML action URLs derive the public host from
# the incoming request, so no restart is needed when the tunnel URL changes.
echo "Starting worker..."
(cd "$(pwd)" && npm run worker > /tmp/mealline-worker.log 2>&1 &)

echo ""
echo "=== MealLine live phone test is up ==="
echo "  Staff site: http://localhost:$APP_PORT/staff"
echo "  Tunnel:     $TUNNEL"
echo ""
echo "In the Twilio console, on your phone number's Voice settings:"
echo "  A call comes in -> Webhook -> $TUNNEL/api/voice/inbound  (HTTP POST)"
echo "  Call status changes       -> $TUNNEL/api/voice/status"
echo ""
echo "Then call your Twilio number from your verified mobile."
echo "Full call script: docs/phone-test.md"
