package authx

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

const claimUserID = "userId"
const claimRole = "role"

// SignToken issues an HS256 JWT compatible with go-zero rest.WithJwt.
func SignToken(secret string, expireSeconds int64, userID int64, role string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		claimUserID: float64(userID),
		claimRole:   role,
		"iat":       now.Unix(),
		"exp":       now.Add(time.Duration(expireSeconds) * time.Second).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// UserIDFromCtx reads userId claim injected by go-zero JWT middleware.
func UserIDFromCtx(ctx context.Context) (int64, error) {
	v := ctx.Value(claimUserID)
	if v == nil {
		return 0, fmt.Errorf("missing userId claim")
	}
	switch n := v.(type) {
	case float64:
		return int64(n), nil
	case int64:
		return n, nil
	case int:
		return int64(n), nil
	case jsonNumber:
		i, err := n.Int64()
		return i, err
	default:
		return 0, fmt.Errorf("invalid userId type %T", v)
	}
}

// RoleFromCtx reads role claim if present.
func RoleFromCtx(ctx context.Context) string {
	v := ctx.Value(claimRole)
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

// jsonNumber mirrors encoding/json.Number without importing encoding/json in hot path.
type jsonNumber interface {
	Int64() (int64, error)
}
