package logic

import (
	"context"
	"net/mail"
	"strings"
	"unicode/utf8"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

// Roles used across the system (users.role has no DB check constraint).
var validUserRoles = map[string]bool{"admin": true, "collector": true}

var validUserStatuses = map[string]bool{
	model.StatusPending:  true,
	model.StatusApproved: true,
	model.StatusRejected: true,
}

type AdminUserLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewAdminUserLogic(ctx context.Context, svcCtx *svc.ServiceContext) *AdminUserLogic {
	return &AdminUserLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

// Update lets an admin edit another user's profile, role and status.
func (l *AdminUserLogic) Update(req *types.AdminUpdateUserRequest) (*types.ReviewUserResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	adminID, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}

	current, err := l.svcCtx.UserModel.FindById(l.ctx, req.Id)
	if err != nil {
		l.Errorf("query user failed: %v", err)
		return nil, ErrInternal
	}
	if current == nil {
		return nil, NewCodeError(404, "用户不存在")
	}

	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	role := strings.TrimSpace(req.Role)
	status := strings.TrimSpace(req.Status)
	if role == "" {
		role = current.Role
	}
	if status == "" {
		status = current.Status
	}

	if name == "" {
		return nil, NewCodeError(400, "姓名不能为空")
	}
	if utf8.RuneCountInString(name) > 64 {
		return nil, NewCodeError(400, "姓名不能超过 64 个字符")
	}
	if email == "" {
		return nil, NewCodeError(400, "邮箱不能为空")
	}
	if len(email) > 255 {
		return nil, NewCodeError(400, "邮箱过长")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return nil, NewCodeError(400, "邮箱格式不正确")
	}
	if !validUserRoles[role] {
		return nil, NewCodeError(400, "无效的角色")
	}
	if !validUserStatuses[status] {
		return nil, NewCodeError(400, "无效的状态")
	}
	if req.Id == adminID && (role != current.Role || status != current.Status) {
		return nil, NewCodeError(400, "不能修改自己的角色或状态")
	}

	if email != current.Email {
		existing, err := l.svcCtx.UserModel.FindByEmail(l.ctx, email)
		if err != nil {
			l.Errorf("query user by email failed: %v", err)
			return nil, ErrInternal
		}
		if existing != nil && existing.Id != req.Id {
			return nil, NewCodeError(409, "该邮箱已被其他用户使用")
		}
	}

	avatar := strings.TrimSpace(req.Avatar)
	if avatar == "" {
		avatar = current.Avatar
	}
	updated := &model.User{
		Id: req.Id, Name: name, Email: email, Role: role, Status: status,
		Avatar: avatar, CreatedAt: current.CreatedAt,
	}
	if err := l.svcCtx.UserModel.AdminUpdate(l.ctx, updated); err != nil {
		l.Errorf("admin update user failed: %v", err)
		return nil, ErrInternal
	}
	return &types.ReviewUserResponse{User: toUserInfo(updated)}, nil
}

// Delete hard-deletes a user; admins cannot delete themselves.
func (l *AdminUserLogic) Delete(req *types.ReviewUserRequest) (*types.AdminDeleteUserResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	adminID, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if req.Id == adminID {
		return nil, NewCodeError(400, "不能删除自己的账号")
	}
	user, err := l.svcCtx.UserModel.FindById(l.ctx, req.Id)
	if err != nil {
		l.Errorf("query user failed: %v", err)
		return nil, ErrInternal
	}
	if user == nil {
		return nil, NewCodeError(404, "用户不存在")
	}
	if err := l.svcCtx.UserModel.Delete(l.ctx, req.Id); err != nil {
		l.Errorf("delete user failed: %v", err)
		return nil, ErrInternal
	}
	return &types.AdminDeleteUserResponse{Id: req.Id}, nil
}
