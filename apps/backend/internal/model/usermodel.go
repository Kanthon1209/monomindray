package model

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	Id        int64     `db:"id"`
	Name      string    `db:"name"`
	Email     string    `db:"email"`
	Password  string    `db:"password"`
	Role      string    `db:"role"`
	Avatar    string    `db:"avatar"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

type UserModel interface {
	FindByEmail(ctx context.Context, email string) (*User, error)
	FindById(ctx context.Context, id int64) (*User, error)
	Insert(ctx context.Context, user *User) (int64, error)
	Update(ctx context.Context, user *User) error
}

type userModel struct {
	conn *pgxpool.Pool
}

func NewUserModel(conn *pgxpool.Pool) UserModel {
	return &userModel{conn: conn}
}

func (m *userModel) FindByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	query := `SELECT id, name, email, password, role, avatar, created_at, updated_at
		FROM users WHERE email = $1`
	err := m.conn.QueryRow(ctx, query, email).Scan(
		&u.Id, &u.Name, &u.Email, &u.Password, &u.Role, &u.Avatar, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query user by email: %w", err)
	}
	return &u, nil
}

func (m *userModel) FindById(ctx context.Context, id int64) (*User, error) {
	var u User
	query := `SELECT id, name, email, password, role, avatar, created_at, updated_at
		FROM users WHERE id = $1`
	err := m.conn.QueryRow(ctx, query, id).Scan(
		&u.Id, &u.Name, &u.Email, &u.Password, &u.Role, &u.Avatar, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query user by id: %w", err)
	}
	return &u, nil
}

func (m *userModel) Insert(ctx context.Context, user *User) (int64, error) {
	query := `INSERT INTO users (name, email, password, role, avatar)
		VALUES ($1, $2, $3, $4, $5) RETURNING id`
	var id int64
	err := m.conn.QueryRow(ctx, query,
		user.Name, user.Email, user.Password, user.Role, user.Avatar,
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
