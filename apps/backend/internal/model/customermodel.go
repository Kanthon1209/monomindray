package model

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Customer struct {
	Id         int64     `db:"id"`
	HospitalId *int64    `db:"hospital_id"`
	Name       string    `db:"name"`
	Title      string    `db:"title"`
	Phone      string    `db:"phone"`
	Email      string    `db:"email"`
	Remark     string    `db:"remark"`
	CreatedBy  *int64    `db:"created_by"`
	UpdatedBy  *int64    `db:"updated_by"`
	CreatedAt  time.Time `db:"created_at"`
	UpdatedAt  time.Time `db:"updated_at"`
	HospitalName string  `db:"hospital_name"`
}

type CustomerFilter struct {
	HospitalId int64
	Keyword    string
	Limit      int
	Offset     int
}

type CustomerModel interface {
	List(ctx context.Context, f CustomerFilter) ([]Customer, int64, error)
	FindById(ctx context.Context, id int64) (*Customer, error)
	Insert(ctx context.Context, c *Customer) (int64, error)
	Update(ctx context.Context, c *Customer) error
	Delete(ctx context.Context, id int64) error
}

type customerModel struct{ conn *pgxpool.Pool }

func NewCustomerModel(conn *pgxpool.Pool) CustomerModel {
	return &customerModel{conn: conn}
}

func (m *customerModel) List(ctx context.Context, f CustomerFilter) ([]Customer, int64, error) {
	limit, offset := pageBounds(f.Limit, f.Offset)
	where := []string{"1=1"}
	args := []any{}
	if f.HospitalId > 0 {
		args = append(args, f.HospitalId)
		where = append(where, fmt.Sprintf("c.hospital_id=$%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(c.name ILIKE $%d OR c.phone ILIKE $%d OR c.email ILIKE $%d)", n, n, n))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(*) FROM customers c WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := m.conn.Query(ctx, fmt.Sprintf(`
		SELECT c.id, c.hospital_id, c.name, c.title, c.phone, c.email, c.remark,
		       c.created_by, c.updated_by, c.created_at, c.updated_at,
		       COALESCE(h.name, '')
		FROM customers c
		LEFT JOIN hospitals h ON h.id = c.hospital_id
		WHERE %s ORDER BY c.id DESC LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]Customer, 0)
	for rows.Next() {
		var c Customer
		if err := rows.Scan(
			&c.Id, &c.HospitalId, &c.Name, &c.Title, &c.Phone, &c.Email, &c.Remark,
			&c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt, &c.HospitalName,
		); err != nil {
			return nil, 0, err
		}
		items = append(items, c)
	}
	return items, total, rows.Err()
}

func (m *customerModel) FindById(ctx context.Context, id int64) (*Customer, error) {
	var c Customer
	err := m.conn.QueryRow(ctx, `
		SELECT c.id, c.hospital_id, c.name, c.title, c.phone, c.email, c.remark,
		       c.created_by, c.updated_by, c.created_at, c.updated_at, COALESCE(h.name,'')
		FROM customers c LEFT JOIN hospitals h ON h.id=c.hospital_id WHERE c.id=$1`, id).Scan(
		&c.Id, &c.HospitalId, &c.Name, &c.Title, &c.Phone, &c.Email, &c.Remark,
		&c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt, &c.HospitalName,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (m *customerModel) Insert(ctx context.Context, c *Customer) (int64, error) {
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO customers (hospital_id, name, title, phone, email, remark, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
		c.HospitalId, c.Name, c.Title, c.Phone, c.Email, c.Remark, c.CreatedBy, c.UpdatedBy,
	).Scan(&id)
	return id, err
}

func (m *customerModel) Update(ctx context.Context, c *Customer) error {
	_, err := m.conn.Exec(ctx, `
		UPDATE customers SET hospital_id=$1, name=$2, title=$3, phone=$4, email=$5, remark=$6, updated_by=$7
		WHERE id=$8`,
		c.HospitalId, c.Name, c.Title, c.Phone, c.Email, c.Remark, c.UpdatedBy, c.Id,
	)
	return err
}

func (m *customerModel) Delete(ctx context.Context, id int64) error {
	_, err := m.conn.Exec(ctx, `DELETE FROM customers WHERE id=$1`, id)
	return err
}

func pageBounds(limit, offset int) (int, int) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	return limit, offset
}
