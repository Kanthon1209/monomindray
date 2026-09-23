#!/bin/bash
set -e
echo "==== LOGIN ===="
curl -sS -w "\nHTTP=%{http_code}\n" -X POST http://127.0.0.1/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mindray.com","password":"admin123"}' | tee /tmp/login.json
echo
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' /tmp/login.json | head -1)
echo "TOKEN_LEN=${#TOKEN}"
echo "==== PROFILE ===="
curl -sS -w "\nHTTP=%{http_code}\n" http://127.0.0.1/api/v1/user/profile \
  -H "Authorization: Bearer ${TOKEN}"
echo
echo "==== SIGNUP ===="
curl -sS -w "\nHTTP=%{http_code}\n" -X POST http://127.0.0.1/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"name":"Tester","email":"tester@mindray.com","password":"password123"}'
echo
echo "==== USERS ===="
docker exec mindray-db psql -U mindray -d mindray -c 'select id,email,role from users;'
echo "==== WEB ===="
curl -sS -o /dev/null -w "WEB=%{http_code}\n" http://127.0.0.1/login
