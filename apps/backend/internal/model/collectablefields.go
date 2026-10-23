package model

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// CollectableField is one entry in the survey-bindable field catalog.
type CollectableField struct {
	Code          string          `db:"code"`
	Domain        string          `db:"domain"`
	StorageTarget string          `db:"storage_target"`
	ValueType     string          `db:"value_type"`
	Label         string          `db:"label"`
	Section       string          `db:"section"`
	EnumValues    json.RawMessage `db:"enum_values"`
	OptionsSource string          `db:"options_source"`
	IsActive      bool            `db:"is_active"`
	SortOrder     int             `db:"sort_order"`
	CreatedAt     time.Time       `db:"created_at"`
	UpdatedAt     time.Time       `db:"updated_at"`
}

type CollectableFieldModel interface {
	List(ctx context.Context, domain string, activeOnly bool) ([]CollectableField, error)
	FindByStorageTarget(ctx context.Context, target string) (*CollectableField, error)
	ExistsActiveTarget(ctx context.Context, target string) (bool, error)
	ActiveTargetSet(ctx context.Context) (map[string]CollectableField, error)
}

type collectableFieldModel struct{ conn *pgxpool.Pool }

func NewCollectableFieldModel(conn *pgxpool.Pool) CollectableFieldModel {
	return &collectableFieldModel{conn: conn}
}

func (m *collectableFieldModel) List(ctx context.Context, domain string, activeOnly bool) ([]CollectableField, error) {
	q := `SELECT code, domain, storage_target, value_type, label, section, enum_values,
	             options_source, is_active, sort_order, created_at, updated_at
	      FROM collectable_fields WHERE 1=1`
	args := []any{}
	argN := 1
	domain = strings.TrimSpace(domain)
	if domain != "" && !strings.EqualFold(domain, "all") {
		q += fmt.Sprintf(` AND domain = $%d`, argN)
		args = append(args, domain)
		argN++
	}
	if activeOnly {
		q += ` AND is_active = TRUE`
	}
	q += ` ORDER BY domain, sort_order, code`
	rows, err := m.conn.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanCollectableFields(rows)
}

func (m *collectableFieldModel) FindByStorageTarget(ctx context.Context, target string) (*CollectableField, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return nil, nil
	}
	row := m.conn.QueryRow(ctx, `
		SELECT code, domain, storage_target, value_type, label, section, enum_values,
		       options_source, is_active, sort_order, created_at, updated_at
		FROM collectable_fields WHERE storage_target = $1`, target)
	f, err := scanCollectableField(row)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	return f, err
}

func (m *collectableFieldModel) ExistsActiveTarget(ctx context.Context, target string) (bool, error) {
	target = strings.TrimSpace(target)
	if target == "" {
		return false, nil
	}
	var ok bool
	err := m.conn.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM collectable_fields
			WHERE storage_target = $1 AND is_active = TRUE
		)`, target).Scan(&ok)
	return ok, err
}

func (m *collectableFieldModel) ActiveTargetSet(ctx context.Context) (map[string]CollectableField, error) {
	rows, err := m.List(ctx, "", true)
	if err != nil {
		return nil, err
	}
	out := make(map[string]CollectableField, len(rows))
	for _, r := range rows {
		out[r.StorageTarget] = r
	}
	return out, nil
}

func scanCollectableFields(rows pgx.Rows) ([]CollectableField, error) {
	out := make([]CollectableField, 0)
	for rows.Next() {
		var f CollectableField
		var enums []byte
		if err := rows.Scan(
			&f.Code, &f.Domain, &f.StorageTarget, &f.ValueType, &f.Label, &f.Section,
			&enums, &f.OptionsSource, &f.IsActive, &f.SortOrder, &f.CreatedAt, &f.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if len(enums) == 0 {
			enums = []byte("[]")
		}
		f.EnumValues = json.RawMessage(enums)
		out = append(out, f)
	}
	return out, rows.Err()
}

type scannable interface {
	Scan(dest ...any) error
}

func scanCollectableField(row scannable) (*CollectableField, error) {
	var f CollectableField
	var enums []byte
	if err := row.Scan(
		&f.Code, &f.Domain, &f.StorageTarget, &f.ValueType, &f.Label, &f.Section,
		&enums, &f.OptionsSource, &f.IsActive, &f.SortOrder, &f.CreatedAt, &f.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if len(enums) == 0 {
		enums = []byte("[]")
	}
	f.EnumValues = json.RawMessage(enums)
	return &f, nil
}
