#!/bin/bash
set -e
echo "==== LOGIN ADMIN ===="
curl -sS -X POST http://127.0.0.1/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@mindray.com","password":"admin123"}' | tee /tmp/admin.json
echo
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' /tmp/admin.json | head -1)

echo "==== LIST PENDING ===="
curl -sS "http://127.0.0.1/api/v1/admin/users?status=pending" \
  -H "Authorization: Bearer $TOKEN"
echo

echo "==== SIGNUP NEW ===="
EMAIL="pending_$(date +%s)@mindray.com"
curl -sS -X POST http://127.0.0.1/api/v1/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"待审用户\",\"email\":\"$EMAIL\",\"password\":\"password123\"}"
echo

echo "==== PENDING LOGIN SHOULD FAIL ===="
curl -sS -w "\nHTTP=%{http_code}\n" -X POST http://127.0.0.1/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"
echo

echo "==== LIST PENDING AGAIN ===="
curl -sS "http://127.0.0.1/api/v1/admin/users?status=pending" \
  -H "Authorization: Bearer $TOKEN" | tee /tmp/pending.json
echo
UID=$(python3 - <<'PY'
import json
data=json.load(open('/tmp/pending.json'))
items=data.get('items') or []
print(items[0]['id'] if items else '')
PY
)
echo "APPROVE_ID=$UID"
if [ -n "$UID" ]; then
  echo "==== APPROVE ===="
  curl -sS -X POST "http://127.0.0.1/api/v1/admin/users/$UID/approve" \
    -H "Authorization: Bearer $TOKEN"
  echo
  echo "==== LOGIN AFTER APPROVE ===="
  curl -sS -w "\nHTTP=%{http_code}\n" -X POST http://127.0.0.1/api/v1/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"password123\"}"
  echo
fi

echo "==== USERS PAGE ===="
curl -sS -o /dev/null -w "WEB=%{http_code}\n" http://127.0.0.1/dashboard/users
