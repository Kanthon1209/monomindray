package middleware

import (
	"net/http"

	"mindray/internal/authx"
	"mindray/internal/logic"

	"github.com/zeromicro/go-zero/rest/httpx"
)

// AdminOnly rejects non-admin JWT callers before handlers run.
func AdminOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := logic.RequireAdminRole(authx.RoleFromCtx(r.Context())); err != nil {
			httpx.ErrorCtx(r.Context(), w, err)
			return
		}
		next(w, r)
	}
}
