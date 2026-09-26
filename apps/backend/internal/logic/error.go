package logic

import (
	"context"
	"errors"
	"net/http"
	"time"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/types"
)

// CodeError carries an HTTP status and a client-facing message.
type CodeError struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

func (e *CodeError) Error() string {
	return e.Msg
}

func NewCodeError(code int, msg string) *CodeError {
	return &CodeError{Code: code, Msg: msg}
}

var (
	ErrUnauthorized  = NewCodeError(http.StatusUnauthorized, "未授权")
	ErrForbidden     = NewCodeError(http.StatusForbidden, "无权访问")
	ErrBadCredential = NewCodeError(http.StatusUnauthorized, "邮箱或密码不正确")
	ErrInternal      = NewCodeError(http.StatusInternalServerError, "服务器内部错误")
)

// HTTPStatus maps errors to HTTP status codes for httpx.
func HTTPStatus(err error) int {
	var ce *CodeError
	if errors.As(err, &ce) {
		return ce.Code
	}
	return http.StatusInternalServerError
}

func toUserInfo(u *model.User) types.UserInfo {
	createdAt := ""
	if !u.CreatedAt.IsZero() {
		createdAt = u.CreatedAt.UTC().Format(time.RFC3339)
	}
	return types.UserInfo{
		Id:        u.Id,
		Name:      u.Name,
		Email:     u.Email,
		Role:      u.Role,
		Status:    u.Status,
		Avatar:    u.Avatar,
		CreatedAt: createdAt,
	}
}

func requireAdmin(role string) error {
	if role != "admin" {
		return ErrForbidden
	}
	return nil
}

// RequireAdminRole is the exported form used by HTTP middleware.
func RequireAdminRole(role string) error {
	return requireAdmin(role)
}

// requireAdminCtx rejects non-admin JWT callers (采集员不可访问管理端数据接口).
func requireAdminCtx(ctx context.Context) error {
	return requireAdmin(authx.RoleFromCtx(ctx))
}
