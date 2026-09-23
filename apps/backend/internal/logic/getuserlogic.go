package logic

import (
	"context"

	"mindray/internal/authx"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type GetUserLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewGetUserLogic(ctx context.Context, svcCtx *svc.ServiceContext) *GetUserLogic {
	return &GetUserLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *GetUserLogic) GetUser() (*types.GetUserResponse, error) {
	userID, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}

	user, err := l.svcCtx.UserModel.FindById(l.ctx, userID)
	if err != nil {
		l.Errorf("query user by id failed: %v", err)
		return nil, ErrInternal
	}
	if user == nil {
		return nil, NewCodeError(404, "用户不存在")
	}

	return &types.GetUserResponse{User: toUserInfo(user)}, nil
}
