package logic

import (
	"context"
	"strings"

	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
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
	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	if name == "" || email == "" || len(req.Password) < 8 {
		return nil, NewCodeError(400, "请填写有效的昵称、邮箱，密码至少 8 位")
	}

	existing, err := l.svcCtx.UserModel.FindByEmail(l.ctx, email)
	if err != nil {
		l.Errorf("query user by email failed: %v", err)
		return nil, ErrInternal
	}
	if existing != nil {
		return nil, NewCodeError(409, "该邮箱已被注册")
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		l.Errorf("hash password failed: %v", err)
		return nil, ErrInternal
	}

	newUser := &model.User{
		Name:     name,
		Email:    email,
		Password: string(hashedPassword),
		Role:     "collector",
		Status:   model.StatusPending,
	}

	userID, err := l.svcCtx.UserModel.Insert(l.ctx, newUser)
	if err != nil {
		l.Errorf("insert user failed: %v", err)
		return nil, ErrInternal
	}

	return &types.SignupResponse{
		Message: "注册成功，请等待管理员审核通过后再登录",
		User: types.UserInfo{
			Id:     userID,
			Name:   name,
			Email:  email,
			Role:   "collector",
			Status: model.StatusPending,
		},
	}, nil
}
