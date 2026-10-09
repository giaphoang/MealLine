#!/bin/bash
# Start the shared PostgreSQL instance (binaries provisioned via the pgserver
# wheel into /home/foodfit/pgvenv; data in /home/foodfit/pgdata).
# Run after a VM restart:  scripts/start-postgres.sh
set -e
PGBIN=/home/foodfit/pgvenv/lib/python3.12/site-packages/pgserver/pginstall/bin
if [ ! -x "$PGBIN/pg_ctl" ]; then
  echo "PostgreSQL binaries not found at $PGBIN"
  exit 1
fi
su foodfit -c "$PGBIN/pg_ctl -D /home/foodfit/pgdata -l /home/foodfit/pg.log start" 2>/dev/null || true
echo "PostgreSQL should be running on 127.0.0.1:5432"
