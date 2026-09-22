package logic

import (
	"errors"
	"net/http"
)

// CodeError 是一个带 HTTP 状态码的 error
type CodeError struct {
	Code   int    `json:"code"`
	Status int    `json:"-"`
	Msg    string `json:"msg"`
}

func (e *CodeError) Error() string {
	return e.Msg
}

func errorResponse(msg string, code int) error {
	return &CodeError{
		Code:   code,
		Status: code,
		Msg:    msg,
	}
}

// HTTPStatus 返回 HTTP 状态码（供 httpx 使用）
func HTTPStatus(err error) int {
	var ce *CodeError
	if errors.As(err, &ce) {
		return ce.Status
	}
	return http.StatusInternalServerError
}
