#!/usr/bin/env bash
# Run on ECS host (or via SSH). Reads DB creds from deploy/.env.
set -euo pipefail
ROOT="${MINDRAY_REMOTE_DIR:-/home/kanthon/mindray}"
DEPLOY="$ROOT/deploy"
ENV_FILE="$DEPLOY/.env"
XLSX_SRC="${1:-$ROOT/scripts/data/eqa-customers.xlsx}"
MODE="${2:-commit}"  # commit | dry-run

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a
# Prefer DB_* from .env; ignore unrelated
source <(grep -E '^(DB_USER|DB_PASSWORD|DB_NAME)=' "$ENV_FILE" || true)
set +a
DB_USER="${DB_USER:-mindray}"
DB_PASSWORD="${DB_PASSWORD:-mindray_secret}"
DB_NAME="${DB_NAME:-mindray}"

# Discover compose network (…_mindray)
NET="$(docker inspect mindray-db -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
if [[ -z "$NET" ]]; then
  echo "cannot find docker network for mindray-db" >&2
  exit 1
fi

WORK="$(mktemp -d /tmp/eqa-import.XXXXXX)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

cp -f "$ROOT/scripts/eqa_xlsx_import.py" "$WORK/"
cp -f "$XLSX_SRC" "$WORK/eqa-customers.xlsx"

ARGS=(python /work/eqa_xlsx_import.py --xlsx /work/eqa-customers.xlsx --dsn "postgres://${DB_USER}:${DB_PASSWORD}@mindray-db:5432/${DB_NAME}?sslmode=disable")
if [[ "$MODE" == "dry-run" ]]; then
  ARGS+=(--dry-run)
else
  ARGS+=(--commit)
fi

echo "==> network=$NET mode=$MODE"
docker run --rm \
  --network "$NET" \
  -v "$WORK:/work:ro" \
  python:3.12-slim \
  bash -lc 'pip -q install --no-cache-dir openpyxl "psycopg[binary]" && '"$(printf '%q ' "${ARGS[@]}")"
