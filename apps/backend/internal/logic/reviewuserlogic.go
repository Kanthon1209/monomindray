package logic

import (
	"context"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type ReviewUserLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewReviewUserLogic(ctx context.Context, svcCtx *svc.ServiceContext) *ReviewUserLogic {
	return &ReviewUserLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

func (l *ReviewUserLogic) Approve(req *types.ReviewUserRequest) (*types.ReviewUserResponse, error) {
	return l.setStatus(req.Id, model.StatusApproved)
}

func (l *ReviewUserLogic) Reject(req *types.ReviewUserRequest) (*types.ReviewUserResponse, error) {
	return l.setStatus(req.Id, model.StatusRejected)
}

func (l *ReviewUserLogic) setStatus(userID int64, status string) (*types.ReviewUserResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}

	adminID, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if userID == adminID {
		return nil, NewCodeError(400, "不能修改自己的审核状态")
	}

	user, err := l.svcCtx.UserModel.FindById(l.ctx, userID)
	if err != nil {
		l.Errorf("query user failed: %v", err)
		return nil, ErrInternal
	}
	if user == nil {
		return nil, NewCodeError(404, "用户不存在")
	}
	if user.Role == "admin" {
		return nil, NewCodeError(400, "不能修改管理员账号状态")
	}

	if err := l.svcCtx.UserModel.UpdateStatus(l.ctx, userID, status); err != nil {
		l.Errorf("update user status failed: %v", err)
		return nil, ErrInternal
	}

	user.Status = status
	return &types.ReviewUserResponse{User: toUserInfo(user)}, nil
}
