#!/bin/bash
set -euo pipefail
cd /home/kanthon/mindray
docker exec -i mindray-db psql -U mindray -d mindray < apps/backend/migrations/005_hospital_archive.sql
cd deploy
docker compose -f docker-compose.ecs.yml --env-file .env up -d --build api web
sleep 2
docker logs mindray-api --tail 15
curl -s -o /dev/null -w "web=%{http_code}\n" http://127.0.0.1/dashboard
echo DONE
