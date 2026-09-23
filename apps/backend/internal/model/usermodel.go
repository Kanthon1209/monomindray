package model

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	StatusPending  = "pending"
	StatusApproved = "approved"
	StatusRejected = "rejected"
)

type User struct {
	Id        int64     `db:"id"`
	Name      string    `db:"name"`
	Email     string    `db:"email"`
	Password  string    `db:"password"`
	Role      string    `db:"role"`
	Status    string    `db:"status"`
	Avatar    string    `db:"avatar"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

type UserListFilter struct {
	Status string
	Limit  int
	Offset int
}

type UserModel interface {
	FindByEmail(ctx context.Context, email string) (*User, error)
	FindById(ctx context.Context, id int64) (*User, error)
	Insert(ctx context.Context, user *User) (int64, error)
	Update(ctx context.Context, user *User) error
	UpdateStatus(ctx context.Context, id int64, status string) error
	List(ctx context.Context, filter UserListFilter) ([]User, int64, error)
}

type userModel struct {
	conn *pgxpool.Pool
}

func NewUserModel(conn *pgxpool.Pool) UserModel {
	return &userModel{conn: conn}
}

const userSelectCols = `id, name, email, password, role, status, avatar, created_at, updated_at`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(
		&u.Id, &u.Name, &u.Email, &u.Password, &u.Role, &u.Status, &u.Avatar, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

func (m *userModel) FindByEmail(ctx context.Context, email string) (*User, error) {
	u, err := scanUser(m.conn.QueryRow(ctx,
		`SELECT `+userSelectCols+` FROM users WHERE email = $1`, email,
	))
	if err != nil {
		return nil, fmt.Errorf("query user by email: %w", err)
	}
	return u, nil
}

func (m *userModel) FindById(ctx context.Context, id int64) (*User, error) {
	u, err := scanUser(m.conn.QueryRow(ctx,
		`SELECT `+userSelectCols+` FROM users WHERE id = $1`, id,
	))
	if err != nil {
		return nil, fmt.Errorf("query user by id: %w", err)
	}
	return u, nil
}

func (m *userModel) Insert(ctx context.Context, user *User) (int64, error) {
	status := user.Status
	if status == "" {
		status = StatusPending
	}
	query := `INSERT INTO users (name, email, password, role, status, avatar)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`
	var id int64
	err := m.conn.QueryRow(ctx, query,
		user.Name, user.Email, user.Password, user.Role, status, user.Avatar,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert user: %w", err)
	}
	return id, nil
}

func (m *userModel) Update(ctx context.Context, user *User) error {
	query := `UPDATE users SET name = $1, email = $2, role = $3, avatar = $4
		WHERE id = $5`
	_, err := m.conn.Exec(ctx, query,
		user.Name, user.Email, user.Role, user.Avatar, user.Id,
	)
	if err != nil {
		return fmt.Errorf("update user: %w", err)
	}
	return nil
}

func (m *userModel) UpdateStatus(ctx context.Context, id int64, status string) error {
	_, err := m.conn.Exec(ctx,
		`UPDATE users SET status = $1 WHERE id = $2`, status, id,
	)
	if err != nil {
		return fmt.Errorf("update user status: %w", err)
	}
	return nil
}

func (m *userModel) List(ctx context.Context, filter UserListFilter) ([]User, int64, error) {
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
		where += fmt.Sprintf(" AND status = $%d", len(args))
	}

	var total int64
	countQuery := `SELECT COUNT(*) FROM users ` + where
	if err := m.conn.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count users: %w", err)
	}

	args = append(args, limit, offset)
	listQuery := fmt.Sprintf(
		`SELECT %s FROM users %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d`,
		userSelectCols, where, len(args)-1, len(args),
	)
	rows, err := m.conn.Query(ctx, listQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var u User
		if err := rows.Scan(
			&u.Id, &u.Name, &u.Email, &u.Password, &u.Role, &u.Status, &u.Avatar, &u.CreatedAt, &u.UpdatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate users: %w", err)
	}
	return users, total, nil
}
