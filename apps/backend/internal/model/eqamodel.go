package model

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type FieldRegistry struct {
	Code       string          `db:"code"`
	Name       string          `db:"name"`
	ValueType  string          `db:"value_type"`
	ParentCode *string         `db:"parent_code"`
	EnumValues json.RawMessage `db:"enum_values"`
	SortOrder  int             `db:"sort_order"`
	CreatedAt  time.Time       `db:"created_at"`
	UpdatedAt  time.Time       `db:"updated_at"`
}

type EqaParticipation struct {
	Id           int64     `db:"id"`
	HospitalId   int64     `db:"hospital_id"`
	HospitalName string    `db:"hospital_name"`
	Year         int       `db:"year"`
	Scope        string    `db:"scope"`
	Tags         []string  `db:"tags"`
	OwnerUserId  *int64    `db:"owner_user_id"`
	OwnerName    string    `db:"owner_name"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
	ItemCount    int64     `db:"item_count"`
}

type EqaParticipationItem struct {
	Id              int64     `db:"id"`
	ParticipationId int64     `db:"participation_id"`
	FieldCode       string    `db:"field_code"`
	FieldName       string    `db:"field_name"`
	Value           bool      `db:"value"`
	CreatedAt       time.Time `db:"created_at"`
	UpdatedAt       time.Time `db:"updated_at"`
}

type EqaDashboardStats struct {
	TotalParticipations int64
	ByScope             []EqaScopeCount
	TopItems            []EqaItemCount
	OwnerProgress       []EqaOwnerProgress
	CoverageHospitals   int64
}

type EqaScopeCount struct {
	Scope string
	Count int64
}

type EqaItemCount struct {
	FieldCode string
	FieldName string
	Count     int64
}

type EqaOwnerProgress struct {
	OwnerUserId   *int64
	OwnerName     string
	Participation int64
	ItemCount     int64
}

type EqaModel interface {
	ListFields(ctx context.Context) ([]FieldRegistry, error)
	ListParticipations(ctx context.Context, year int, scope string, hospitalID, ownerID int64, limit, offset int) ([]EqaParticipation, int64, error)
	FindParticipation(ctx context.Context, id int64) (*EqaParticipation, error)
	FindParticipationByKey(ctx context.Context, hospitalID int64, year int, scope string) (*EqaParticipation, error)
	CreateParticipation(ctx context.Context, p *EqaParticipation) (*EqaParticipation, error)
	UpdateParticipation(ctx context.Context, p *EqaParticipation) (*EqaParticipation, error)
	DeleteParticipation(ctx context.Context, id int64) error
	ListItems(ctx context.Context, participationID int64) ([]EqaParticipationItem, error)
	ReplaceItems(ctx context.Context, participationID int64, items []EqaParticipationItem) error
	UpsertItem(ctx context.Context, participationID int64, fieldCode string, value bool) error
	AddChangeLog(ctx context.Context, participationID, hospitalID *int64, actorID int64, action string, detail map[string]any) error
	Dashboard(ctx context.Context, year int) (*EqaDashboardStats, error)
}

type eqaModel struct{ conn *pgxpool.Pool }

func NewEqaModel(conn *pgxpool.Pool) EqaModel { return &eqaModel{conn: conn} }

func (m *eqaModel) ListFields(ctx context.Context) ([]FieldRegistry, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT code, name, value_type, parent_code, COALESCE(enum_values, '[]'::jsonb), sort_order, created_at, updated_at
		FROM field_registry ORDER BY sort_order, code`)
	if err != nil {
		return nil, fmt.Errorf("list fields: %w", err)
	}
	defer rows.Close()
	out := make([]FieldRegistry, 0)
	for rows.Next() {
		var f FieldRegistry
		var enum []byte
		if err := rows.Scan(&f.Code, &f.Name, &f.ValueType, &f.ParentCode, &enum, &f.SortOrder, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		f.EnumValues = json.RawMessage(enum)
		out = append(out, f)
	}
	return out, rows.Err()
}

func (m *eqaModel) ListParticipations(ctx context.Context, year int, scope string, hospitalID, ownerID int64, limit, offset int) ([]EqaParticipation, int64, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	where := "WHERE 1=1"
	args := []any{}
	if year > 0 {
		args = append(args, year)
		where += fmt.Sprintf(" AND p.year = $%d", len(args))
	}
	if scope != "" {
		args = append(args, scope)
		where += fmt.Sprintf(" AND p.scope = $%d", len(args))
	}
	if hospitalID > 0 {
		args = append(args, hospitalID)
		where += fmt.Sprintf(" AND p.hospital_id = $%d", len(args))
	}
	if ownerID > 0 {
		args = append(args, ownerID)
		where += fmt.Sprintf(" AND p.owner_user_id = $%d", len(args))
	}
	var total int64
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(*) FROM eqa_participation p `+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	q := fmt.Sprintf(`
		SELECT p.id, p.hospital_id, COALESCE(h.name,''), p.year, p.scope, COALESCE(p.tags,'{}'), p.owner_user_id,
		       COALESCE(u.name,''), p.created_at, p.updated_at,
		       (SELECT COUNT(*) FROM eqa_participation_items i WHERE i.participation_id = p.id AND i.value = TRUE)
		FROM eqa_participation p
		LEFT JOIN hospitals h ON h.id = p.hospital_id
		LEFT JOIN users u ON u.id = p.owner_user_id
		%s
		ORDER BY p.year DESC, p.hospital_id, p.scope
		LIMIT $%d OFFSET $%d`, where, len(args)-1, len(args))
	rows, err := m.conn.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]EqaParticipation, 0)
	for rows.Next() {
		var p EqaParticipation
		if err := rows.Scan(&p.Id, &p.HospitalId, &p.HospitalName, &p.Year, &p.Scope, &p.Tags, &p.OwnerUserId,
			&p.OwnerName, &p.CreatedAt, &p.UpdatedAt, &p.ItemCount); err != nil {
			return nil, 0, err
		}
		if p.Tags == nil {
			p.Tags = []string{}
		}
		out = append(out, p)
	}
	return out, total, rows.Err()
}

func (m *eqaModel) scanParticipation(row pgx.Row) (*EqaParticipation, error) {
	var p EqaParticipation
	err := row.Scan(&p.Id, &p.HospitalId, &p.HospitalName, &p.Year, &p.Scope, &p.Tags, &p.OwnerUserId,
		&p.OwnerName, &p.CreatedAt, &p.UpdatedAt, &p.ItemCount)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	if p.Tags == nil {
		p.Tags = []string{}
	}
	return &p, nil
}

const participationSelect = `
	SELECT p.id, p.hospital_id, COALESCE(h.name,''), p.year, p.scope, COALESCE(p.tags,'{}'), p.owner_user_id,
	       COALESCE(u.name,''), p.created_at, p.updated_at,
	       (SELECT COUNT(*) FROM eqa_participation_items i WHERE i.participation_id = p.id AND i.value = TRUE)
	FROM eqa_participation p
	LEFT JOIN hospitals h ON h.id = p.hospital_id
	LEFT JOIN users u ON u.id = p.owner_user_id`

func (m *eqaModel) FindParticipation(ctx context.Context, id int64) (*EqaParticipation, error) {
	return m.scanParticipation(m.conn.QueryRow(ctx, participationSelect+` WHERE p.id=$1`, id))
}

func (m *eqaModel) FindParticipationByKey(ctx context.Context, hospitalID int64, year int, scope string) (*EqaParticipation, error) {
	return m.scanParticipation(m.conn.QueryRow(ctx, participationSelect+` WHERE p.hospital_id=$1 AND p.year=$2 AND p.scope=$3`, hospitalID, year, scope))
}

func (m *eqaModel) CreateParticipation(ctx context.Context, p *EqaParticipation) (*EqaParticipation, error) {
	tags := p.Tags
	if tags == nil {
		tags = []string{}
	}
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO eqa_participation (hospital_id, year, scope, tags, owner_user_id)
		VALUES ($1,$2,$3,$4,$5) RETURNING id`,
		p.HospitalId, p.Year, p.Scope, tags, p.OwnerUserId).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("create participation: %w", err)
	}
	return m.FindParticipation(ctx, id)
}

func (m *eqaModel) UpdateParticipation(ctx context.Context, p *EqaParticipation) (*EqaParticipation, error) {
	tags := p.Tags
	if tags == nil {
		tags = []string{}
	}
	_, err := m.conn.Exec(ctx, `
		UPDATE eqa_participation SET year=$1, scope=$2, tags=$3, owner_user_id=$4 WHERE id=$5`,
		p.Year, p.Scope, tags, p.OwnerUserId, p.Id)
	if err != nil {
		return nil, err
	}
	return m.FindParticipation(ctx, p.Id)
}

func (m *eqaModel) DeleteParticipation(ctx context.Context, id int64) error {
	_, err := m.conn.Exec(ctx, `DELETE FROM eqa_participation WHERE id=$1`, id)
	return err
}

func (m *eqaModel) ListItems(ctx context.Context, participationID int64) ([]EqaParticipationItem, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT i.id, i.participation_id, i.field_code, COALESCE(f.name,''), i.value, i.created_at, i.updated_at
		FROM eqa_participation_items i
		LEFT JOIN field_registry f ON f.code = i.field_code
		WHERE i.participation_id=$1 ORDER BY f.sort_order, i.field_code`, participationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]EqaParticipationItem, 0)
	for rows.Next() {
		var it EqaParticipationItem
		if err := rows.Scan(&it.Id, &it.ParticipationId, &it.FieldCode, &it.FieldName, &it.Value, &it.CreatedAt, &it.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (m *eqaModel) ReplaceItems(ctx context.Context, participationID int64, items []EqaParticipationItem) error {
	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM eqa_participation_items WHERE participation_id=$1`, participationID); err != nil {
		return err
	}
	for _, it := range items {
		if _, err := tx.Exec(ctx, `
			INSERT INTO eqa_participation_items (participation_id, field_code, value)
			VALUES ($1,$2,$3)
			ON CONFLICT (participation_id, field_code) DO UPDATE SET value=EXCLUDED.value`,
			participationID, it.FieldCode, it.Value); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (m *eqaModel) UpsertItem(ctx context.Context, participationID int64, fieldCode string, value bool) error {
	_, err := m.conn.Exec(ctx, `
		INSERT INTO eqa_participation_items (participation_id, field_code, value)
		VALUES ($1,$2,$3)
		ON CONFLICT (participation_id, field_code) DO UPDATE SET value=EXCLUDED.value`,
		participationID, fieldCode, value)
	return err
}

func (m *eqaModel) AddChangeLog(ctx context.Context, participationID, hospitalID *int64, actorID int64, action string, detail map[string]any) error {
	b, _ := json.Marshal(detail)
	if b == nil {
		b = []byte("{}")
	}
	_, err := m.conn.Exec(ctx, `
		INSERT INTO eqa_change_log (participation_id, hospital_id, actor_user_id, action, detail)
		VALUES ($1,$2,$3,$4,$5::jsonb)`, participationID, hospitalID, actorID, action, b)
	return err
}

func (m *eqaModel) Dashboard(ctx context.Context, year int) (*EqaDashboardStats, error) {
	stats := &EqaDashboardStats{}
	yearFilter := ""
	args := []any{}
	if year > 0 {
		args = append(args, year)
		yearFilter = fmt.Sprintf(" WHERE year = $%d", len(args))
	}
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(*) FROM eqa_participation`+yearFilter, args...).Scan(&stats.TotalParticipations); err != nil {
		return nil, err
	}
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(DISTINCT hospital_id) FROM eqa_participation`+yearFilter, args...).Scan(&stats.CoverageHospitals); err != nil {
		return nil, err
	}
	rows, err := m.conn.Query(ctx, `SELECT scope, COUNT(*) FROM eqa_participation`+yearFilter+` GROUP BY scope ORDER BY scope`, args...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var s EqaScopeCount
		if err := rows.Scan(&s.Scope, &s.Count); err != nil {
			rows.Close()
			return nil, err
		}
		stats.ByScope = append(stats.ByScope, s)
	}
	rows.Close()

	itemArgs := []any{}
	itemJoin := ""
	if year > 0 {
		itemArgs = append(itemArgs, year)
		itemJoin = fmt.Sprintf(" JOIN eqa_participation p ON p.id = i.participation_id AND p.year = $%d", len(itemArgs))
	} else {
		itemJoin = " JOIN eqa_participation p ON p.id = i.participation_id"
	}
	rows, err = m.conn.Query(ctx, `
		SELECT i.field_code, COALESCE(f.name,i.field_code), COUNT(*)
		FROM eqa_participation_items i`+itemJoin+`
		LEFT JOIN field_registry f ON f.code = i.field_code
		WHERE i.value = TRUE
		GROUP BY i.field_code, f.name
		ORDER BY COUNT(*) DESC, i.field_code
		LIMIT 10`, itemArgs...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var it EqaItemCount
		if err := rows.Scan(&it.FieldCode, &it.FieldName, &it.Count); err != nil {
			rows.Close()
			return nil, err
		}
		stats.TopItems = append(stats.TopItems, it)
	}
	rows.Close()

	rows, err = m.conn.Query(ctx, `
		SELECT p.owner_user_id, COALESCE(u.name, '(未分配)'), COUNT(DISTINCT p.id),
		       COUNT(i.id) FILTER (WHERE i.value = TRUE)
		FROM eqa_participation p
		LEFT JOIN users u ON u.id = p.owner_user_id
		LEFT JOIN eqa_participation_items i ON i.participation_id = p.id
		`+func() string {
		if year > 0 {
			return "WHERE p.year = $1"
		}
		return ""
	}()+`
		GROUP BY p.owner_user_id, u.name
		ORDER BY COUNT(DISTINCT p.id) DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var o EqaOwnerProgress
		if err := rows.Scan(&o.OwnerUserId, &o.OwnerName, &o.Participation, &o.ItemCount); err != nil {
			return nil, err
		}
		stats.OwnerProgress = append(stats.OwnerProgress, o)
	}
	return stats, rows.Err()
}
