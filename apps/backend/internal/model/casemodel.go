package model

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Case struct {
	Id           int64     `db:"id"`
	HospitalId   int64     `db:"hospital_id"`
	DeviceId     *int64    `db:"device_id"`
	Title        string    `db:"title"`
	Summary      string    `db:"summary"`
	Content      string    `db:"content"`
	Status       string    `db:"status"`
	CollectedBy  *int64    `db:"collected_by"`
	CollectedAt  time.Time `db:"collected_at"`
	CreatedBy    *int64    `db:"created_by"`
	UpdatedBy    *int64    `db:"updated_by"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
	HospitalName string    `db:"hospital_name"`
	DeviceModel  string    `db:"device_model"`
}

type CaseFilter struct {
	HospitalId int64
	Status     string
	Keyword    string
	Limit      int
	Offset     int
}

type CaseModel interface {
	List(ctx context.Context, f CaseFilter) ([]Case, int64, error)
	FindById(ctx context.Context, id int64) (*Case, error)
	Insert(ctx context.Context, c *Case) (int64, error)
	Update(ctx context.Context, c *Case) error
	Delete(ctx context.Context, id int64) error
}

type caseModel struct{ conn *pgxpool.Pool }

func NewCaseModel(conn *pgxpool.Pool) CaseModel {
	return &caseModel{conn: conn}
}

func (m *caseModel) List(ctx context.Context, f CaseFilter) ([]Case, int64, error) {
	limit, offset := pageBounds(f.Limit, f.Offset)
	where := []string{"1=1"}
	args := []any{}
	if f.HospitalId > 0 {
		args = append(args, f.HospitalId)
		where = append(where, fmt.Sprintf("c.hospital_id=$%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("c.status=$%d", len(args)))
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(c.title ILIKE $%d OR c.summary ILIKE $%d)", n, n))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(*) FROM cases c WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := m.conn.Query(ctx, fmt.Sprintf(`
		SELECT c.id, c.hospital_id, c.device_id, c.title, c.summary, c.content, c.status,
		       c.collected_by, c.collected_at, c.created_by, c.updated_by, c.created_at, c.updated_at,
		       COALESCE(h.name,''), COALESCE(d.model,'')
		FROM cases c
		LEFT JOIN hospitals h ON h.id = c.hospital_id
		LEFT JOIN devices d ON d.id = c.device_id
		WHERE %s ORDER BY c.collected_at DESC, c.id DESC LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]Case, 0)
	for rows.Next() {
		var c Case
		if err := rows.Scan(
			&c.Id, &c.HospitalId, &c.DeviceId, &c.Title, &c.Summary, &c.Content, &c.Status,
			&c.CollectedBy, &c.CollectedAt, &c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt,
			&c.HospitalName, &c.DeviceModel,
		); err != nil {
			return nil, 0, err
		}
		items = append(items, c)
	}
	return items, total, rows.Err()
}

func (m *caseModel) FindById(ctx context.Context, id int64) (*Case, error) {
	var c Case
	err := m.conn.QueryRow(ctx, `
		SELECT c.id, c.hospital_id, c.device_id, c.title, c.summary, c.content, c.status,
		       c.collected_by, c.collected_at, c.created_by, c.updated_by, c.created_at, c.updated_at,
		       COALESCE(h.name,''), COALESCE(d.model,'')
		FROM cases c
		LEFT JOIN hospitals h ON h.id=c.hospital_id
		LEFT JOIN devices d ON d.id=c.device_id
		WHERE c.id=$1`, id).Scan(
		&c.Id, &c.HospitalId, &c.DeviceId, &c.Title, &c.Summary, &c.Content, &c.Status,
		&c.CollectedBy, &c.CollectedAt, &c.CreatedBy, &c.UpdatedBy, &c.CreatedAt, &c.UpdatedAt,
		&c.HospitalName, &c.DeviceModel,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (m *caseModel) Insert(ctx context.Context, c *Case) (int64, error) {
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO cases (hospital_id, device_id, title, summary, content, status, collected_by, collected_at, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
		c.HospitalId, c.DeviceId, c.Title, c.Summary, c.Content, c.Status, c.CollectedBy, c.CollectedAt, c.CreatedBy, c.UpdatedBy,
	).Scan(&id)
	return id, err
}

func (m *caseModel) Update(ctx context.Context, c *Case) error {
	_, err := m.conn.Exec(ctx, `
		UPDATE cases SET hospital_id=$1, device_id=$2, title=$3, summary=$4, content=$5, status=$6, updated_by=$7
		WHERE id=$8`,
		c.HospitalId, c.DeviceId, c.Title, c.Summary, c.Content, c.Status, c.UpdatedBy, c.Id,
	)
	return err
}

func (m *caseModel) Delete(ctx context.Context, id int64) error {
	_, err := m.conn.Exec(ctx, `DELETE FROM cases WHERE id=$1`, id)
	return err
}
