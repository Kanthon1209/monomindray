package logic

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"time"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
	"golang.org/x/crypto/bcrypt"
)

const (
	passwordResetTokenTTL   = 24 * time.Hour
	passwordResetRateWindow = time.Hour
	passwordResetRateMax    = 5
	passwordResetPathPrefix = "/reset-password?token="
)

type PasswordResetLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewPasswordResetLogic(ctx context.Context, svcCtx *svc.ServiceContext) *PasswordResetLogic {
	return &PasswordResetLogic{
		Logger: logx.WithContext(ctx),
		ctx:    ctx,
		svcCtx: svcCtx,
	}
}

// Request creates (or refreshes) a pending admin-mediated reset request.
// Always returns a generic success message to avoid account enumeration.
func (l *PasswordResetLogic) Request(req *types.PasswordResetRequestBody) (*types.PasswordResetRequestResponse, error) {
	email := strings.TrimSpace(req.Email)
	okMsg := &types.PasswordResetRequestResponse{
		Message: "若该账号存在，重置申请已提交，请等待管理员审核。审核通过后管理员会把重置链接发给你。",
	}
	if email == "" || !strings.Contains(email, "@") {
		return nil, NewCodeError(400, "请输入有效的邮箱账号")
	}

	recent, err := l.svcCtx.PasswordResetModel.CountRecentByEmail(l.ctx, email, time.Now().Add(-passwordResetRateWindow))
	if err != nil {
		l.Errorf("count recent password resets: %v", err)
		return nil, ErrInternal
	}
	if recent >= passwordResetRateMax {
		return nil, NewCodeError(429, "申请过于频繁，请稍后再试")
	}

	user, err := l.svcCtx.UserModel.FindByEmail(l.ctx, email)
	if err != nil {
		l.Errorf("find user for password reset: %v", err)
		return nil, ErrInternal
	}
	if user == nil {
		return okMsg, nil
	}
	// Only approved accounts can reset; still return generic message.
	if user.Status != model.StatusApproved {
		return okMsg, nil
	}

	pending, err := l.svcCtx.PasswordResetModel.FindPendingByUserId(l.ctx, user.Id)
	if err != nil {
		l.Errorf("find pending password reset: %v", err)
		return nil, ErrInternal
	}
	if pending != nil {
		if err := l.svcCtx.PasswordResetModel.TouchPending(l.ctx, pending.Id); err != nil {
			l.Errorf("touch pending password reset: %v", err)
			return nil, ErrInternal
		}
		return okMsg, nil
	}

	if _, err := l.svcCtx.PasswordResetModel.InsertPending(l.ctx, user.Id, user.Email); err != nil {
		l.Errorf("insert password reset: %v", err)
		return nil, ErrInternal
	}
	return okMsg, nil
}

func (l *PasswordResetLogic) List(req *types.ListPasswordResetRequestsRequest) (*types.ListPasswordResetRequestsResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	_ = l.svcCtx.PasswordResetModel.ExpireStaleApproved(l.ctx)

	page := req.Page
	if page <= 0 {
		page = 1
	}
	pageSize := req.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 50
	}
	items, total, err := l.svcCtx.PasswordResetModel.List(l.ctx, model.PasswordResetListFilter{
		Status: strings.TrimSpace(req.Status),
		Limit:  pageSize,
		Offset: (page - 1) * pageSize,
	})
	if err != nil {
		l.Errorf("list password resets: %v", err)
		return nil, ErrInternal
	}
	out := make([]types.PasswordResetInfo, 0, len(items))
	for i := range items {
		out = append(out, toPasswordResetInfo(&items[i], ""))
	}
	return &types.ListPasswordResetRequestsResponse{Total: total, Items: out}, nil
}

func (l *PasswordResetLogic) Approve(req *types.ReviewPasswordResetRequest) (*types.ReviewPasswordResetResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	adminID, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}

	row, err := l.svcCtx.PasswordResetModel.FindById(l.ctx, req.Id)
	if err != nil {
		l.Errorf("find password reset: %v", err)
		return nil, ErrInternal
	}
	if row == nil {
		return nil, NewCodeError(404, "重置申请不存在")
	}
	if row.Status != model.PasswordResetPending {
		return nil, NewCodeError(400, "该申请已处理，无法再次通过")
	}

	user, err := l.svcCtx.UserModel.FindById(l.ctx, row.UserId)
	if err != nil {
		l.Errorf("find user: %v", err)
		return nil, ErrInternal
	}
	if user == nil || user.Status != model.StatusApproved {
		return nil, NewCodeError(400, "目标账号不可用，无法发放重置链接")
	}

	rawToken, tokenHash, err := generatePasswordResetToken()
	if err != nil {
		l.Errorf("generate reset token: %v", err)
		return nil, ErrInternal
	}
	expiresAt := time.Now().Add(passwordResetTokenTTL)

	if err := l.svcCtx.PasswordResetModel.InvalidateApprovedForUser(l.ctx, row.UserId, row.Id); err != nil {
		l.Errorf("invalidate prior tokens: %v", err)
		return nil, ErrInternal
	}
	if err := l.svcCtx.PasswordResetModel.Approve(l.ctx, row.Id, adminID, tokenHash, expiresAt); err != nil {
		l.Errorf("approve password reset: %v", err)
		return nil, NewCodeError(400, "审核失败，请刷新后重试")
	}

	row.Status = model.PasswordResetApproved
	row.TokenExpiresAt = &expiresAt
	now := time.Now()
	row.ReviewedAt = &now
	row.ReviewedBy = &adminID
	row.UserName = user.Name
	row.UserRole = user.Role

	info := toPasswordResetInfo(row, rawToken)
	return &types.ReviewPasswordResetResponse{Item: info}, nil
}

func (l *PasswordResetLogic) Reject(req *types.ReviewPasswordResetRequest) (*types.ReviewPasswordResetResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	adminID, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}

	row, err := l.svcCtx.PasswordResetModel.FindById(l.ctx, req.Id)
	if err != nil {
		l.Errorf("find password reset: %v", err)
		return nil, ErrInternal
	}
	if row == nil {
		return nil, NewCodeError(404, "重置申请不存在")
	}
	if row.Status != model.PasswordResetPending {
		return nil, NewCodeError(400, "该申请已处理，无法再次拒绝")
	}

	reason := strings.TrimSpace(req.Reason)
	if len(reason) > 512 {
		reason = reason[:512]
	}
	if err := l.svcCtx.PasswordResetModel.Reject(l.ctx, row.Id, adminID, reason); err != nil {
		l.Errorf("reject password reset: %v", err)
		return nil, NewCodeError(400, "操作失败，请刷新后重试")
	}

	user, _ := l.svcCtx.UserModel.FindById(l.ctx, row.UserId)
	row.Status = model.PasswordResetRejected
	row.RejectReason = reason
	now := time.Now()
	row.ReviewedAt = &now
	row.ReviewedBy = &adminID
	if user != nil {
		row.UserName = user.Name
		row.UserRole = user.Role
	}
	return &types.ReviewPasswordResetResponse{Item: toPasswordResetInfo(row, "")}, nil
}

func (l *PasswordResetLogic) Validate(req *types.PasswordResetValidateRequest) (*types.PasswordResetValidateResponse, error) {
	token := strings.TrimSpace(req.Token)
	if token == "" {
		return &types.PasswordResetValidateResponse{Valid: false, Msg: "链接无效"}, nil
	}
	_ = l.svcCtx.PasswordResetModel.ExpireStaleApproved(l.ctx)

	row, err := l.svcCtx.PasswordResetModel.FindByTokenHash(l.ctx, hashPasswordResetToken(token))
	if err != nil {
		l.Errorf("validate reset token: %v", err)
		return nil, ErrInternal
	}
	if row == nil || row.Status != model.PasswordResetApproved {
		return &types.PasswordResetValidateResponse{Valid: false, Msg: "链接无效或已失效"}, nil
	}
	if row.TokenExpiresAt == nil || time.Now().After(*row.TokenExpiresAt) {
		_ = l.svcCtx.PasswordResetModel.ExpireStaleApproved(l.ctx)
		return &types.PasswordResetValidateResponse{Valid: false, Msg: "链接已过期，请重新申请"}, nil
	}
	return &types.PasswordResetValidateResponse{
		Valid: true,
		Email: maskEmail(row.Email),
	}, nil
}

func (l *PasswordResetLogic) Confirm(req *types.PasswordResetConfirmRequest) (*types.PasswordResetConfirmResponse, error) {
	token := strings.TrimSpace(req.Token)
	if token == "" {
		return nil, NewCodeError(400, "链接无效")
	}
	if len(req.Password) < 8 {
		return nil, NewCodeError(400, "密码至少 8 位")
	}
	_ = l.svcCtx.PasswordResetModel.ExpireStaleApproved(l.ctx)

	row, err := l.svcCtx.PasswordResetModel.FindByTokenHash(l.ctx, hashPasswordResetToken(token))
	if err != nil {
		l.Errorf("confirm reset find: %v", err)
		return nil, ErrInternal
	}
	if row == nil || row.Status != model.PasswordResetApproved {
		return nil, NewCodeError(400, "链接无效或已使用")
	}
	if row.TokenExpiresAt == nil || time.Now().After(*row.TokenExpiresAt) {
		_ = l.svcCtx.PasswordResetModel.ExpireStaleApproved(l.ctx)
		return nil, NewCodeError(400, "链接已过期，请重新申请")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		l.Errorf("hash new password: %v", err)
		return nil, ErrInternal
	}
	if err := l.svcCtx.PasswordResetModel.UpdateUserPassword(l.ctx, row.UserId, string(hashed)); err != nil {
		l.Errorf("update password: %v", err)
		return nil, ErrInternal
	}
	if err := l.svcCtx.PasswordResetModel.MarkUsed(l.ctx, row.Id); err != nil {
		l.Errorf("mark reset used: %v", err)
		return nil, ErrInternal
	}
	return &types.PasswordResetConfirmResponse{Message: "密码已更新，请使用新密码登录"}, nil
}

func generatePasswordResetToken() (raw string, hash string, err error) {
	buf := make([]byte, 32)
	if _, err = rand.Read(buf); err != nil {
		return "", "", err
	}
	raw = hex.EncodeToString(buf)
	return raw, hashPasswordResetToken(raw), nil
}

func hashPasswordResetToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func maskEmail(email string) string {
	at := strings.IndexByte(email, '@')
	if at <= 0 {
		return "***"
	}
	local := email[:at]
	domain := email[at:]
	if len(local) <= 2 {
		return local[:1] + "***" + domain
	}
	return local[:1] + "***" + local[len(local)-1:] + domain
}

func toPasswordResetInfo(r *model.PasswordResetRequest, rawToken string) types.PasswordResetInfo {
	info := types.PasswordResetInfo{
		Id:           r.Id,
		UserId:       r.UserId,
		Name:         r.UserName,
		Email:        r.Email,
		Role:         r.UserRole,
		Status:       r.Status,
		RequestedAt:  r.RequestedAt.UTC().Format(time.RFC3339),
		RejectReason: r.RejectReason,
	}
	if r.ReviewedAt != nil {
		info.ReviewedAt = r.ReviewedAt.UTC().Format(time.RFC3339)
	}
	if r.ReviewedBy != nil {
		info.ReviewedBy = *r.ReviewedBy
	}
	if r.TokenExpiresAt != nil {
		info.TokenExpiresAt = r.TokenExpiresAt.UTC().Format(time.RFC3339)
	}
	if rawToken != "" {
		info.ResetToken = rawToken
		info.ResetPath = passwordResetPathPrefix + rawToken
	}
	return info
}
