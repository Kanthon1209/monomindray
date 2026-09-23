#!/usr/bin/env bash
# 本机构建产物并 scp 到 ECS（不经 git / Actions）。
# Windows 请优先用: pwsh ./scripts/deploy-ecs.ps1
#
# 用法:
#   ./scripts/deploy-ecs.sh
#   ./scripts/deploy-ecs.sh web
#   SKIP_BUILD=1 ./scripts/deploy-ecs.sh
#   SKIP_MIGRATE=1 ./scripts/deploy-ecs.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-all}"
HOST="${MINDRAY_SSH_HOST:-mindray}"
REMOTE_DIR="${MINDRAY_REMOTE_DIR:-/home/kanthon/mindray}"
SKIP_BUILD="${SKIP_BUILD:-0}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

need_api=0
need_web=0
services=""
case "$TARGET" in
  all) need_api=1; need_web=1; services="api web" ;;
  api) need_api=1; services="api" ;;
  web) need_web=1; services="web" ;;
  *) echo "usage: $0 [all|api|web]" >&2; exit 1 ;;
esac

step() { printf '\n==> %s\n' "$*"; }

mkdir -p deploy/artifacts

if [[ "$SKIP_BUILD" != "1" ]]; then
  if [[ "$need_api" == "1" ]]; then
    step "交叉编译 API (linux/amd64)"
    (cd apps/backend && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
      go build -trimpath -ldflags "-s -w" -o ../../deploy/artifacts/mindray-api .)
  fi
  if [[ "$need_web" == "1" ]]; then
    step "构建前端 (Next.js standalone)"
    (cd apps/frontend &&
      [[ -d node_modules ]] || npm ci
      NEXT_PUBLIC_API_URL= npm run build)
  fi
fi

[[ "$need_api" == "1" && -f deploy/artifacts/mindray-api ]] || {
  [[ "$need_api" != "1" ]] || { echo "缺少 deploy/artifacts/mindray-api" >&2; exit 1; }
}
[[ "$need_web" == "1" && -d apps/frontend/.next/standalone && -d apps/frontend/.next/static ]] || {
  [[ "$need_web" != "1" ]] || { echo "缺少 frontend .next/standalone|static" >&2; exit 1; }
}

step "打包同步产物"
stamp="$(date +%Y%m%d-%H%M%S)"
tgz="deploy/mindray-ecs-sync-${stamp}.tgz"
pack=(
  deploy/Dockerfile.api
  deploy/Dockerfile.web
  deploy/docker-compose.ecs.yml
  deploy/Caddyfile
  apps/backend/migrations
  apps/backend/etc
  scripts/goose-up.sh
)
[[ "$need_api" == "1" ]] && pack+=(deploy/artifacts/mindray-api)
[[ "$need_web" == "1" ]] && pack+=(
  apps/frontend/.next/standalone
  apps/frontend/.next/static
  apps/frontend/public
)
tar -czf "$tgz" "${pack[@]}"
ls -lh "$tgz"

step "上传到 ${HOST}:/tmp"
remote_tgz="/tmp/$(basename "$tgz")"
scp "$tgz" "${HOST}:${remote_tgz}"

migrate_block=""
if [[ "$SKIP_MIGRATE" != "1" ]]; then
  migrate_block=$'\n'"cd '$REMOTE_DIR'"$'\n'"./scripts/goose-up.sh up"
fi

step "ECS 解压 / goose up / 重启: ${services}"
ssh "$HOST" bash -s <<EOF
set -euo pipefail
cd '$REMOTE_DIR'
tar -xzf '$remote_tgz'
rm -f '$remote_tgz'
[[ -f deploy/artifacts/mindray-api ]] && chmod +x deploy/artifacts/mindray-api
chmod +x scripts/goose-up.sh
cd deploy
docker compose -f docker-compose.ecs.yml --env-file .env up -d postgres
sleep 2
$migrate_block
cd '$REMOTE_DIR/deploy'
docker compose -f docker-compose.ecs.yml --env-file .env up -d --build $services
sleep 2
docker compose -f docker-compose.ecs.yml ps
curl -sS -o /dev/null -w 'dashboard=%{http_code}\n' http://127.0.0.1/dashboard || true
echo DONE
EOF

rm -f "$tgz"
step "完成（goose up + services；正式发布请 push main → Actions）"
