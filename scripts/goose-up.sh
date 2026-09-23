#!/usr/bin/env bash
# Apply pending SQL migrations with pressly/goose against the running mindray-db container.
# Used by: scripts/deploy-ecs.* (sync) and .github/workflows/ci-cd.yml (Actions).
#
# Usage (from repo root on the ECS host):
#   ./scripts/goose-up.sh
#   ./scripts/goose-up.sh status
#
# Env overrides: DB_USER DB_PASSWORD DB_NAME GOOSE_BIN GOOSE_VERSION

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CMD="${1:-up}"
GOOSE_VERSION="${GOOSE_VERSION:-v3.24.3}"
GOOSE_BIN="${GOOSE_BIN:-/tmp/goose-${GOOSE_VERSION}-linux-amd64}"
MIGRATIONS_DIR="${ROOT}/apps/backend/migrations"
ENV_FILE="${ROOT}/deploy/.env"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "missing migrations dir: $MIGRATIONS_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE (need DB_USER / DB_PASSWORD / DB_NAME)" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# strip Windows CRLF if present
# shellcheck disable=SC1091
source <(sed 's/\r$//' "$ENV_FILE")
set +a

DB_USER="${DB_USER:-mindray}"
DB_PASSWORD="${DB_PASSWORD:-mindray_secret}"
DB_NAME="${DB_NAME:-mindray}"

if ! docker ps --format '{{.Names}}' | grep -qx 'mindray-db'; then
  echo "container mindray-db is not running; start postgres first" >&2
  exit 1
fi

# Wait until postgres accepts connections
for i in $(seq 1 30); do
  if docker exec mindray-db pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "postgres not ready" >&2
    exit 1
  fi
  sleep 1
done

if [[ ! -x "$GOOSE_BIN" ]]; then
  echo "==> downloading goose ${GOOSE_VERSION}"
  curl -fsSL -o "$GOOSE_BIN" \
    "https://github.com/pressly/goose/releases/download/${GOOSE_VERSION}/goose_linux_x86_64"
  chmod +x "$GOOSE_BIN"
fi

NET="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' mindray-db | awk 'NR==1{print; exit}')"
if [[ -z "$NET" ]]; then
  echo "cannot resolve docker network for mindray-db" >&2
  exit 1
fi

DSN="host=mindray-db user=${DB_USER} password=${DB_PASSWORD} dbname=${DB_NAME} sslmode=disable"

echo "==> goose ${CMD} (dir=${MIGRATIONS_DIR}, network=${NET})"
docker run --rm \
  --network "$NET" \
  -v "${GOOSE_BIN}:/goose:ro" \
  -v "${MIGRATIONS_DIR}:/migrations:ro" \
  --entrypoint /goose \
  alpine:3.20 \
  -dir /migrations postgres "$DSN" "$CMD"
