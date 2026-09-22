package logic

import (
	"context"
	"fmt"

	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
	"github.com/zeromicro/go-zero/core/stores/jwt"
)

type UpdateUserLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewUpdateUserLogic(ctx context.Context, svcCtx *svc.ServiceContext) *UpdateUserLogic {
	return &UpdateUserLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *UpdateUserLogic) UpdateUser(req *types.UserInfo) (*types.GetUserResponse, error) {
	claims, err := jwt.GetClaims(l.ctx)
	if err != nil {
		return nil, errorResponse("未授权", 401)
	}

	userIdIntf, ok := claims["userId"]
	if !ok {
		return nil, errorResponse("未授权", 401)
	}

	userIdFloat, ok := userIdIntf.(float64)
	if !ok {
		return nil, fmt.Errorf("invalid userId type")
	}
	userId := int64(userIdFloat)

	current, err := l.svcCtx.UserModel.FindById(l.ctx, userId)
	if err != nil {
		l.Errorf("query user by id failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}
	if current == nil {
		return nil, errorResponse("用户不存在", 404)
	}

	updatedUser := &model.User{
		Id:     userId,
		Name:   req.Name,
		Email:  req.Email,
		Avatar: req.Avatar,
	}
	if current.Role == "admin" {
		updatedUser.Role = req.Role
	} else {
		updatedUser.Role = current.Role
	}

	if err := l.svcCtx.UserModel.Update(l.ctx, updatedUser); err != nil {
		l.Errorf("update user failed: %v", err)
		return nil, errorResponse("服务器内部错误", 500)
	}

	return &types.GetUserResponse{
		User: types.UserInfo{
			Id:     updatedUser.Id,
			Name:   updatedUser.Name,
			Email:  updatedUser.Email,
			Role:   updatedUser.Role,
			Avatar: updatedUser.Avatar,
		},
	}, nil
}
