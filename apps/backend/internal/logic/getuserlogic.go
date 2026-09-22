package logic

import (
	"context"
	"fmt"

	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
	"github.com/zeromicro/go-zero/core/stores/jwt"
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
	// 从 JWT claims 中获取 userId
	claims, err := jwt.GetClaims(l.ctx)
	if err != nil {
		l.Errorf("get jwt claims failed: %v", err)
		return nil, errorResponse("未授权", 401)
	}

	userIdIntf, ok := claims["userId"]
	if !ok {
		return nil, errorResponse("未授权", 401)
	}

	// 类型转换（JWT decode 后数字是 float64）
	userIdFloat, ok := userIdIntf.(float64)
	if !ok {
		return nil, fmt.Errorf("invalid userId type")
	}
	userId := int64(userIdFloat)

	user, err := l.svcCtx.UserModel.FindById(l.ctx, userId)
	if err != nil {
		l.Errorf("query user by id failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}
	if user == nil {
		return nil, errorResponse("用户不存在", 404)
	}

	return &types.GetUserResponse{
		User: types.UserInfo{
			Id:     user.Id,
			Name:   user.Name,
			Email:  user.Email,
			Role:   user.Role,
			Avatar: user.Avatar,
		},
	}, nil
}
