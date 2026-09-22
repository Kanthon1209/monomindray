package logic

import (
	"context"

	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
	"github.com/zeromicro/go-zero/core/stores/jwt"
	"golang.org/x/crypto/bcrypt"
)

type SignupLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewSignupLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SignupLogic {
	return &SignupLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *SignupLogic) Signup(req *types.SignupRequest) (*types.SignupResponse, error) {
	// 检查邮箱是否已注册
	existing, err := l.svcCtx.UserModel.FindByEmail(l.ctx, req.Email)
	if err != nil {
		l.Errorf("query user by email failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}
	if existing != nil {
		return nil, errorResponse("该邮箱已被注册", 409)
	}

	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		l.Errorf("hash password failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}

	// 创建用户
	newUser := &model.User{
		Name:     req.Name,
		Email:    req.Email,
		Password: string(hashedPassword),
		Role:     "collector",
	}

	userId, err := l.svcCtx.UserModel.Insert(l.ctx, newUser)
	if err != nil {
		l.Errorf("insert user failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}

	// 生成 JWT
	token, err := jwt.Sign(
		[]byte(l.svcCtx.Config.Auth.AccessSecret),
		int64(l.svcCtx.Config.Auth.ExpireAfter),
		jwt.WithKey("userId", userId),
		jwt.WithKey("role", "collector"),
	)
	if err != nil {
		l.Errorf("sign jwt failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}

	return &types.SignupResponse{
		Token: token,
		User: types.UserInfo{
			Id:    userId,
			Name:  req.Name,
			Email: req.Email,
			Role:  "collector",
		},
	}, nil
}
