package logic

import (
	"context"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type ListUsersLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewListUsersLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ListUsersLogic {
	return &ListUsersLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ListUsersLogic) ListUsers(req *types.ListUsersRequest) (*types.ListUsersResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}

	status := req.Status
	if status != "" &&
		status != model.StatusPending &&
		status != model.StatusApproved &&
		status != model.StatusRejected {
		return nil, NewCodeError(400, "无效的状态筛选")
	}

	page := req.Page
	if page <= 0 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}

	users, total, err := l.svcCtx.UserModel.List(l.ctx, model.UserListFilter{
		Status: status,
		Limit:  pageSize,
		Offset: (page - 1) * pageSize,
	})
	if err != nil {
		l.Errorf("list users failed: %v", err)
		return nil, ErrInternal
	}

	items := make([]types.UserInfo, 0, len(users))
	for i := range users {
		items = append(items, toUserInfo(&users[i]))
	}

	return &types.ListUsersResponse{
		Total: total,
		Items: items,
	}, nil
}
