#!/bin/bash
# MealLine one-shot Mac setup. Run once in Terminal:
#   bash ~/Documents/mealline/setup-mac.sh
# Afterwards: npm run dev   (terminal 1)   and   npm run worker   (terminal 2)
set -euo pipefail
cd "$(dirname "$0")"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1. Install it first."; exit 1; }; }
need node; need npm; need psql || true

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew not found. Install it from https://brew.sh first, then re-run."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Installing PostgreSQL 16 via Homebrew..."
  brew install postgresql@16
  brew services start postgresql@16
  echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zprofile
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
fi

# Wait for postgres to accept connections
for i in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
  sleep 2
  if [ "$i" = "30" ]; then echo "PostgreSQL did not start. Check: brew services list"; exit 1; fi
done

# Create the demo database (idempotent)
psql -h 127.0.0.1 -p 5432 -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='mealline'" | grep -q 1 \
  || psql -h 127.0.0.1 -p 5432 -d postgres -c "CREATE DATABASE mealline;"

# .env for local Mac use
cat > .env <<'EOF'
PUBLIC_BASE_URL=http://localhost:3000
MEALLINE_DATABASE_URL=postgresql://127.0.0.1:5432/mealline
EOF

echo "Installing dependencies..."
npm install --no-audit --no-fund

echo "Migrating and seeding..."
npm run migrate
npm run seed

echo ""
echo "MealLine is ready. Run in two terminals:"
echo "  cd ~/Documents/mealline && npm run dev       # app at http://localhost:3000"
echo "  cd ~/Documents/mealline && npm run worker    # notification worker"
echo ""
echo "Demo staff sign-in is documented in README.md (Demo access)."
