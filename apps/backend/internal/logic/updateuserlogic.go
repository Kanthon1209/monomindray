package logic

import (
	"context"
	"strings"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
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

func (l *UpdateUserLogic) UpdateUser(req *types.UpdateUserRequest) (*types.GetUserResponse, error) {
	userID, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}

	current, err := l.svcCtx.UserModel.FindById(l.ctx, userID)
	if err != nil {
		l.Errorf("query user by id failed: %v", err)
		return nil, ErrInternal
	}
	if current == nil {
		return nil, NewCodeError(404, "用户不存在")
	}

	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	if name == "" {
		return nil, NewCodeError(400, "昵称不能为空")
	}
	if email == "" {
		return nil, NewCodeError(400, "邮箱不能为空")
	}

	if email != current.Email {
		existing, err := l.svcCtx.UserModel.FindByEmail(l.ctx, email)
		if err != nil {
			l.Errorf("query user by email failed: %v", err)
			return nil, ErrInternal
		}
		if existing != nil && existing.Id != userID {
			return nil, NewCodeError(409, "该邮箱已被注册")
		}
	}

	updated := &model.User{
		Id:     userID,
		Name:   name,
		Email:  email,
		Avatar: strings.TrimSpace(req.Avatar),
		Role:   current.Role,
	}

	if err := l.svcCtx.UserModel.Update(l.ctx, updated); err != nil {
		l.Errorf("update user failed: %v", err)
		return nil, ErrInternal
	}

	return &types.GetUserResponse{User: toUserInfo(updated)}, nil
}
