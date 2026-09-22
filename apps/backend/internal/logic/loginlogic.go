package logic

import (
	"context"
	"errors"
	"net/http"

	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
	"github.com/zeromicro/go-zero/core/stores/jwt"
	"golang.org/x/crypto/bcrypt"
)

type LoginLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewLoginLogic(ctx context.Context, svcCtx *svc.ServiceContext) *LoginLogic {
	return &LoginLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *LoginLogic) Login(req *types.LoginRequest) (*types.LoginResponse, error) {
	user, err := l.svcCtx.UserModel.FindByEmail(l.ctx, req.Email)
	if err != nil {
		l.Errorf("query user by email failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}
	if user == nil {
		return nil, errorResponse("邮箱或密码不正确", 401)
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return nil, errorResponse("邮箱或密码不正确", 401)
	}

	// 生成 JWT
	token, err := jwt.Sign(
		[]byte(l.svcCtx.Config.Auth.AccessSecret),
		int64(l.svcCtx.Config.Auth.ExpireAfter),
		jwt.WithKey("userId", user.Id),
		jwt.WithKey("role", user.Role),
	)
	if err != nil {
		l.Errorf("sign jwt failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}

	return &types.LoginResponse{
		Token: token,
		User: types.UserInfo{
			Id:     user.Id,
			Name:   user.Name,
			Email:  user.Email,
			Role:   user.Role,
			Avatar: user.Avatar,
		},
	}, nil
}
