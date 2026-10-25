#!/usr/bin/env bash
# Run on ECS host (or via SSH). Reads DB creds from deploy/.env.
set -euo pipefail
ROOT="${MINDRAY_REMOTE_DIR:-/home/kanthon/mindray}"
DEPLOY="$ROOT/deploy"
ENV_FILE="$DEPLOY/.env"
XLSX_SRC="${1:-$ROOT/scripts/data/EQA_v1.xlsx}"
MODE="${2:-dry-run}"  # dry-run | commit

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE" >&2
  exit 1
fi
set -a
source <(grep -E '^(DB_USER|DB_PASSWORD|DB_NAME)=' "$ENV_FILE" || true)
set +a
DB_USER="${DB_USER:-mindray}"
DB_PASSWORD="${DB_PASSWORD:-mindray_secret}"
DB_NAME="${DB_NAME:-mindray}"

NET="$(docker inspect mindray-db -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' | head -1)"
if [[ -z "$NET" ]]; then
  echo "cannot find docker network for mindray-db" >&2
  exit 1
fi

WORK="$(mktemp -d /tmp/eqa-prune.XXXXXX)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

cp -f "$ROOT/scripts/prune_hospitals_to_eqa_sheet1.py" "$WORK/"
cp -f "$XLSX_SRC" "$WORK/EQA_v1.xlsx"

ARGS=(python /work/prune_hospitals_to_eqa_sheet1.py --xlsx /work/EQA_v1.xlsx --dsn "postgres://${DB_USER}:${DB_PASSWORD}@mindray-db:5432/${DB_NAME}?sslmode=disable")
if [[ "$MODE" == "commit" ]]; then
  ARGS+=(--commit)
else
  ARGS+=(--dry-run)
fi

echo "==> network=$NET mode=$MODE xlsx=$XLSX_SRC"
docker run --rm \
  --network "$NET" \
  -v "$WORK:/work:ro" \
  python:3.12-slim \
  bash -lc 'pip -q install --no-cache-dir openpyxl "psycopg[binary]" && '"$(printf '%q ' "${ARGS[@]}")"
