#!/usr/bin/env bash
# Drops and recreates the local database, then applies every migration in filename order.
set -euo pipefail
DB="${DB_NAME:-credit_savings}"
HOST="${PGHOST:-localhost}"
USER="${PGUSER:-postgres}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

psql -h "$HOST" -U "$USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists \"$DB\" with (force)" \
  -c "create database \"$DB\""

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "done: $DB is ready"
