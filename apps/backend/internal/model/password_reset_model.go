package model

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	PasswordResetPending  = "pending"
	PasswordResetApproved = "approved"
	PasswordResetRejected = "rejected"
	PasswordResetUsed     = "used"
	PasswordResetExpired  = "expired"
)

type PasswordResetRequest struct {
	Id             int64      `db:"id"`
	UserId         int64      `db:"user_id"`
	Email          string     `db:"email"`
	Status         string     `db:"status"`
	TokenHash      *string    `db:"token_hash"`
	TokenExpiresAt *time.Time `db:"token_expires_at"`
	TokenUsedAt    *time.Time `db:"token_used_at"`
	RequestedAt    time.Time  `db:"requested_at"`
	ReviewedBy     *int64     `db:"reviewed_by"`
	ReviewedAt     *time.Time `db:"reviewed_at"`
	RejectReason   string     `db:"reject_reason"`
	CreatedAt      time.Time  `db:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"`
	// Joined fields (list views)
	UserName string `db:"user_name"`
	UserRole string `db:"user_role"`
}

type PasswordResetListFilter struct {
	Status string
	Limit  int
	Offset int
}

type PasswordResetModel interface {
	FindById(ctx context.Context, id int64) (*PasswordResetRequest, error)
	FindPendingByUserId(ctx context.Context, userID int64) (*PasswordResetRequest, error)
	FindByTokenHash(ctx context.Context, tokenHash string) (*PasswordResetRequest, error)
	CountRecentByEmail(ctx context.Context, email string, since time.Time) (int64, error)
	InsertPending(ctx context.Context, userID int64, email string) (int64, error)
	TouchPending(ctx context.Context, id int64) error
	List(ctx context.Context, filter PasswordResetListFilter) ([]PasswordResetRequest, int64, error)
	Approve(ctx context.Context, id, reviewerID int64, tokenHash string, expiresAt time.Time) error
	Reject(ctx context.Context, id, reviewerID int64, reason string) error
	MarkUsed(ctx context.Context, id int64) error
	ExpireStaleApproved(ctx context.Context) error
	InvalidateApprovedForUser(ctx context.Context, userID int64, exceptID int64) error
	UpdateUserPassword(ctx context.Context, userID int64, passwordHash string) error
}

type passwordResetModel struct {
	conn *pgxpool.Pool
}

func NewPasswordResetModel(conn *pgxpool.Pool) PasswordResetModel {
	return &passwordResetModel{conn: conn}
}

const passwordResetSelectCols = `r.id, r.user_id, r.email, r.status, r.token_hash, r.token_expires_at,
	r.token_used_at, r.requested_at, r.reviewed_by, r.reviewed_at, r.reject_reason,
	r.created_at, r.updated_at`

func scanPasswordReset(row pgx.Row) (*PasswordResetRequest, error) {
	var r PasswordResetRequest
	err := row.Scan(
		&r.Id, &r.UserId, &r.Email, &r.Status, &r.TokenHash, &r.TokenExpiresAt,
		&r.TokenUsedAt, &r.RequestedAt, &r.ReviewedBy, &r.ReviewedAt, &r.RejectReason,
		&r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &r, nil
}

func (m *passwordResetModel) FindById(ctx context.Context, id int64) (*PasswordResetRequest, error) {
	r, err := scanPasswordReset(m.conn.QueryRow(ctx,
		`SELECT `+passwordResetSelectCols+` FROM password_reset_requests r WHERE r.id = $1`, id,
	))
	if err != nil {
		return nil, fmt.Errorf("find password reset by id: %w", err)
	}
	return r, nil
}

func (m *passwordResetModel) FindPendingByUserId(ctx context.Context, userID int64) (*PasswordResetRequest, error) {
	r, err := scanPasswordReset(m.conn.QueryRow(ctx,
		`SELECT `+passwordResetSelectCols+` FROM password_reset_requests r
		 WHERE r.user_id = $1 AND r.status = $2`, userID, PasswordResetPending,
	))
	if err != nil {
		return nil, fmt.Errorf("find pending password reset: %w", err)
	}
	return r, nil
}

func (m *passwordResetModel) FindByTokenHash(ctx context.Context, tokenHash string) (*PasswordResetRequest, error) {
	r, err := scanPasswordReset(m.conn.QueryRow(ctx,
		`SELECT `+passwordResetSelectCols+` FROM password_reset_requests r
		 WHERE r.token_hash = $1`, tokenHash,
	))
	if err != nil {
		return nil, fmt.Errorf("find password reset by token: %w", err)
	}
	return r, nil
}

func (m *passwordResetModel) CountRecentByEmail(ctx context.Context, email string, since time.Time) (int64, error) {
	var n int64
	err := m.conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM password_reset_requests
		 WHERE lower(email) = lower($1) AND requested_at >= $2`, email, since,
	).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count recent password resets: %w", err)
	}
	return n, nil
}

func (m *passwordResetModel) InsertPending(ctx context.Context, userID int64, email string) (int64, error) {
	var id int64
	err := m.conn.QueryRow(ctx,
		`INSERT INTO password_reset_requests (user_id, email, status, requested_at)
		 VALUES ($1, $2, $3, NOW()) RETURNING id`,
		userID, email, PasswordResetPending,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert password reset: %w", err)
	}
	return id, nil
}

func (m *passwordResetModel) TouchPending(ctx context.Context, id int64) error {
	_, err := m.conn.Exec(ctx,
		`UPDATE password_reset_requests SET requested_at = NOW() WHERE id = $1 AND status = $2`,
		id, PasswordResetPending,
	)
	if err != nil {
		return fmt.Errorf("touch pending password reset: %w", err)
	}
	return nil
}

func (m *passwordResetModel) List(ctx context.Context, filter PasswordResetListFilter) ([]PasswordResetRequest, int64, error) {
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	args := []any{}
	where := "WHERE 1=1"
	if filter.Status != "" {
		args = append(args, filter.Status)
		where += fmt.Sprintf(" AND r.status = $%d", len(args))
	}

	var total int64
	if err := m.conn.QueryRow(ctx,
		`SELECT COUNT(*) FROM password_reset_requests r `+where, args...,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count password resets: %w", err)
	}

	args = append(args, limit, offset)
	query := fmt.Sprintf(`
		SELECT %s, COALESCE(u.name, ''), COALESCE(u.role, '')
		FROM password_reset_requests r
		LEFT JOIN users u ON u.id = r.user_id
		%s
		ORDER BY r.requested_at DESC
		LIMIT $%d OFFSET $%d`, passwordResetSelectCols, where, len(args)-1, len(args))

	rows, err := m.conn.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list password resets: %w", err)
	}
	defer rows.Close()

	items := make([]PasswordResetRequest, 0)
	for rows.Next() {
		var r PasswordResetRequest
		if err := rows.Scan(
			&r.Id, &r.UserId, &r.Email, &r.Status, &r.TokenHash, &r.TokenExpiresAt,
			&r.TokenUsedAt, &r.RequestedAt, &r.ReviewedBy, &r.ReviewedAt, &r.RejectReason,
			&r.CreatedAt, &r.UpdatedAt, &r.UserName, &r.UserRole,
		); err != nil {
			return nil, 0, fmt.Errorf("scan password reset: %w", err)
		}
		items = append(items, r)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate password resets: %w", err)
	}
	return items, total, nil
}

func (m *passwordResetModel) Approve(ctx context.Context, id, reviewerID int64, tokenHash string, expiresAt time.Time) error {
	tag, err := m.conn.Exec(ctx, `
		UPDATE password_reset_requests
		SET status = $1,
		    token_hash = $2,
		    token_expires_at = $3,
		    reviewed_by = $4,
		    reviewed_at = NOW(),
		    reject_reason = ''
		WHERE id = $5 AND status = $6`,
		PasswordResetApproved, tokenHash, expiresAt, reviewerID, id, PasswordResetPending,
	)
	if err != nil {
		return fmt.Errorf("approve password reset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("approve password reset: not pending")
	}
	return nil
}

func (m *passwordResetModel) Reject(ctx context.Context, id, reviewerID int64, reason string) error {
	tag, err := m.conn.Exec(ctx, `
		UPDATE password_reset_requests
		SET status = $1,
		    reviewed_by = $2,
		    reviewed_at = NOW(),
		    reject_reason = $3,
		    token_hash = NULL,
		    token_expires_at = NULL
		WHERE id = $4 AND status = $5`,
		PasswordResetRejected, reviewerID, reason, id, PasswordResetPending,
	)
	if err != nil {
		return fmt.Errorf("reject password reset: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("reject password reset: not pending")
	}
	return nil
}

func (m *passwordResetModel) MarkUsed(ctx context.Context, id int64) error {
	_, err := m.conn.Exec(ctx, `
		UPDATE password_reset_requests
		SET status = $1, token_used_at = NOW()
		WHERE id = $2`, PasswordResetUsed, id)
	if err != nil {
		return fmt.Errorf("mark password reset used: %w", err)
	}
	return nil
}

func (m *passwordResetModel) ExpireStaleApproved(ctx context.Context) error {
	_, err := m.conn.Exec(ctx, `
		UPDATE password_reset_requests
		SET status = $1
		WHERE status = $2 AND token_expires_at IS NOT NULL AND token_expires_at < NOW()`,
		PasswordResetExpired, PasswordResetApproved,
	)
	if err != nil {
		return fmt.Errorf("expire password resets: %w", err)
	}
	return nil
}

func (m *passwordResetModel) InvalidateApprovedForUser(ctx context.Context, userID int64, exceptID int64) error {
	_, err := m.conn.Exec(ctx, `
		UPDATE password_reset_requests
		SET status = $1, token_hash = NULL, token_expires_at = NULL
		WHERE user_id = $2 AND status = $3 AND id <> $4`,
		PasswordResetExpired, userID, PasswordResetApproved, exceptID,
	)
	if err != nil {
		return fmt.Errorf("invalidate approved password resets: %w", err)
	}
	return nil
}

func (m *passwordResetModel) UpdateUserPassword(ctx context.Context, userID int64, passwordHash string) error {
	_, err := m.conn.Exec(ctx,
		`UPDATE users SET password = $1 WHERE id = $2`, passwordHash, userID,
	)
	if err != nil {
		return fmt.Errorf("update user password: %w", err)
	}
	return nil
}
