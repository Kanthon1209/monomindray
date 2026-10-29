#!/usr/bin/env bash
# Apply scripts/seed_test_hospitals.sql on ECS (run on host, or via: ssh mindray 'bash -s' < this).
set -euo pipefail
ROOT="${MINDRAY_REMOTE_DIR:-/home/kanthon/mindray}"
SQL_SRC="${1:-$ROOT/scripts/seed_test_hospitals.sql}"
ENV_FILE="${ROOT}/deploy/.env"

if [[ ! -f "$SQL_SRC" ]]; then
  echo "missing SQL: $SQL_SRC" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source <(grep -E '^(DB_USER|DB_PASSWORD|DB_NAME)=' "$ENV_FILE" || true)
set +a
DB_USER="${DB_USER:-mindray}"
DB_NAME="${DB_NAME:-mindray}"

if ! docker ps --format '{{.Names}}' | grep -qx 'mindray-db'; then
  echo "container mindray-db is not running" >&2
  exit 1
fi

echo "==> seeding test hospitals from $SQL_SRC"
docker exec -i mindray-db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" < "$SQL_SRC"
echo "==> done"
