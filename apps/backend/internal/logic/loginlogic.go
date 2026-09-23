package logic

import (
	"context"
	"strings"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
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
	if strings.TrimSpace(req.Email) == "" || req.Password == "" {
		return nil, NewCodeError(400, "邮箱和密码不能为空")
	}

	user, err := l.svcCtx.UserModel.FindByEmail(l.ctx, req.Email)
	if err != nil {
		l.Errorf("query user by email failed: %v", err)
		return nil, ErrInternal
	}
	if user == nil {
		return nil, ErrBadCredential
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return nil, ErrBadCredential
	}

	switch user.Status {
	case model.StatusPending:
		return nil, NewCodeError(403, "账号待管理员审核，通过后方可登录")
	case model.StatusRejected:
		return nil, NewCodeError(403, "账号未通过审核，请联系管理员")
	case model.StatusApproved:
		// ok
	default:
		return nil, NewCodeError(403, "账号状态异常，请联系管理员")
	}

	token, err := authx.SignToken(
		l.svcCtx.Config.Auth.AccessSecret,
		l.svcCtx.Config.Auth.ExpireAfter,
		user.Id,
		user.Role,
	)
	if err != nil {
		l.Errorf("sign jwt failed: %v", err)
		return nil, ErrInternal
	}

	return &types.LoginResponse{
		Token: token,
		User:  toUserInfo(user),
	}, nil
}
