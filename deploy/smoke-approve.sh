#!/bin/bash
set -e
TOKEN=$(sed -n 's/.*"token":"\([^"]*\)".*/\1/p' /tmp/admin.json | head -1)
echo "==== APPROVE 3 ===="
curl -sS -X POST http://127.0.0.1/api/v1/admin/users/3/approve \
  -H "Authorization: Bearer $TOKEN"
echo
echo "==== LOGIN APPROVED ===="
curl -sS -w "\nHTTP=%{http_code}\n" -X POST http://127.0.0.1/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"pending_1790087051@mindray.com","password":"password123"}'
echo
echo "==== APPROVE 2 ===="
curl -sS -X POST http://127.0.0.1/api/v1/admin/users/2/approve \
  -H "Authorization: Bearer $TOKEN"
echo
