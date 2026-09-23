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

type Hospital struct {
	Id           int64             `db:"id"`
	Name         string            `db:"name"`
	Province     string            `db:"province"`
	City         string            `db:"city"`
	District     string            `db:"district"`
	Level        string            `db:"level"`
	Type         string            `db:"type"`
	Status       string            `db:"status"`
	Address      string            `db:"address"`
	Remark       string            `db:"remark"`
	Archive      map[string]string `db:"archive"`
	CreatedBy    *int64            `db:"created_by"`
	UpdatedBy    *int64            `db:"updated_by"`
	CreatedAt    time.Time         `db:"created_at"`
	UpdatedAt    time.Time         `db:"updated_at"`
	DeviceCount  int               `db:"device_count"`
	DeviceModels []string          `db:"device_models"`
}

type HospitalFilter struct {
	Province       string
	City           string
	Cities         []string
	Level          string
	Type           string
	Status         string
	DeviceCategory string
	DeviceModel    string
	Keyword        string
	Limit          int
	Offset         int
}

type ProvinceCount struct {
	Name  string `db:"name"`
	Value int    `db:"value"`
}

type HospitalModel interface {
	List(ctx context.Context, f HospitalFilter) ([]Hospital, int64, error)
	FindById(ctx context.Context, id int64) (*Hospital, error)
	FindByNameProvinceCity(ctx context.Context, name, province, city string) (*Hospital, error)
	Insert(ctx context.Context, h *Hospital) (int64, error)
	Update(ctx context.Context, h *Hospital) error
	Delete(ctx context.Context, id int64) error
	ProvinceStats(ctx context.Context, regionProvinces []string) ([]ProvinceCount, error)
	CityStats(ctx context.Context, province string, cities []string) ([]ProvinceCount, error)
}

type hospitalModel struct {
	conn *pgxpool.Pool
}

func NewHospitalModel(conn *pgxpool.Pool) HospitalModel {
	return &hospitalModel{conn: conn}
}

func (m *hospitalModel) List(ctx context.Context, f HospitalFilter) ([]Hospital, int64, error) {
	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	where := []string{"1=1"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}

	if f.Province != "" {
		add("h.province = $%d", f.Province)
	}
	if f.City != "" {
		add("h.city = $%d", f.City)
	}
	if len(f.Cities) > 0 {
		add("h.city = ANY($%d)", f.Cities)
	}
	if f.Level != "" {
		add("h.level = $%d", f.Level)
	}
	if f.Type != "" {
		add("h.type = $%d", f.Type)
	}
	if f.Status != "" {
		add("h.status = $%d", f.Status)
	}
	if f.Keyword != "" {
		args = append(args, "%"+f.Keyword+"%")
		n := len(args)
		where = append(where, fmt.Sprintf("(h.name ILIKE $%d OR h.city ILIKE $%d OR h.province ILIKE $%d)", n, n, n))
	}
	if f.DeviceCategory != "" {
		add(`EXISTS (SELECT 1 FROM devices d WHERE d.hospital_id = h.id AND d.status = 'active' AND d.category = $%d)`, f.DeviceCategory)
	}
	if f.DeviceModel != "" {
		add(`EXISTS (SELECT 1 FROM devices d WHERE d.hospital_id = h.id AND d.status = 'active' AND d.model = $%d)`, f.DeviceModel)
	}

	whereSQL := strings.Join(where, " AND ")

	var total int64
	countSQL := `SELECT COUNT(*) FROM hospitals h WHERE ` + whereSQL
	if err := m.conn.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count hospitals: %w", err)
	}

	args = append(args, limit, offset)
	listSQL := fmt.Sprintf(`
		SELECT h.id, h.name, h.province, h.city, h.district, h.level, h.type, h.status,
		       h.address, h.remark, COALESCE(h.archive, '{}'::jsonb), h.created_by, h.updated_by, h.created_at, h.updated_at,
		       COALESCE(v.device_count, 0), COALESCE(v.device_models, ARRAY[]::TEXT[])
		FROM hospitals h
		LEFT JOIN v_hospital_dashboard v ON v.id = h.id
		WHERE %s
		ORDER BY h.province, h.city, h.name
		LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args))

	rows, err := m.conn.Query(ctx, listSQL, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list hospitals: %w", err)
	}
	defer rows.Close()

	items := make([]Hospital, 0)
	for rows.Next() {
		var h Hospital
		var archiveRaw []byte
		if err := rows.Scan(
			&h.Id, &h.Name, &h.Province, &h.City, &h.District, &h.Level, &h.Type, &h.Status,
			&h.Address, &h.Remark, &archiveRaw, &h.CreatedBy, &h.UpdatedBy, &h.CreatedAt, &h.UpdatedAt,
			&h.DeviceCount, &h.DeviceModels,
		); err != nil {
			return nil, 0, fmt.Errorf("scan hospital: %w", err)
		}
		h.Archive = decodeArchive(archiveRaw)
		if h.DeviceModels == nil {
			h.DeviceModels = []string{}
		}
		items = append(items, h)
	}
	return items, total, rows.Err()
}

func (m *hospitalModel) FindById(ctx context.Context, id int64) (*Hospital, error) {
	var h Hospital
	var archiveRaw []byte
	err := m.conn.QueryRow(ctx, `
		SELECT h.id, h.name, h.province, h.city, h.district, h.level, h.type, h.status,
		       h.address, h.remark, COALESCE(h.archive, '{}'::jsonb), h.created_by, h.updated_by, h.created_at, h.updated_at,
		       COALESCE(v.device_count, 0), COALESCE(v.device_models, ARRAY[]::TEXT[])
		FROM hospitals h
		LEFT JOIN v_hospital_dashboard v ON v.id = h.id
		WHERE h.id = $1`, id).Scan(
		&h.Id, &h.Name, &h.Province, &h.City, &h.District, &h.Level, &h.Type, &h.Status,
		&h.Address, &h.Remark, &archiveRaw, &h.CreatedBy, &h.UpdatedBy, &h.CreatedAt, &h.UpdatedAt,
		&h.DeviceCount, &h.DeviceModels,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("find hospital: %w", err)
	}
	h.Archive = decodeArchive(archiveRaw)
	if h.DeviceModels == nil {
		h.DeviceModels = []string{}
	}
	return &h, nil
}

func (m *hospitalModel) FindByNameProvinceCity(ctx context.Context, name, province, city string) (*Hospital, error) {
	var h Hospital
	var archiveRaw []byte
	err := m.conn.QueryRow(ctx, `
		SELECT h.id, h.name, h.province, h.city, h.district, h.level, h.type, h.status,
		       h.address, h.remark, COALESCE(h.archive, '{}'::jsonb), h.created_by, h.updated_by, h.created_at, h.updated_at,
		       COALESCE(v.device_count, 0), COALESCE(v.device_models, ARRAY[]::TEXT[])
		FROM hospitals h
		LEFT JOIN v_hospital_dashboard v ON v.id = h.id
		WHERE h.name=$1 AND h.province=$2 AND h.city=$3`, name, province, city).Scan(
		&h.Id, &h.Name, &h.Province, &h.City, &h.District, &h.Level, &h.Type, &h.Status,
		&h.Address, &h.Remark, &archiveRaw, &h.CreatedBy, &h.UpdatedBy, &h.CreatedAt, &h.UpdatedAt,
		&h.DeviceCount, &h.DeviceModels,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("find hospital by name: %w", err)
	}
	h.Archive = decodeArchive(archiveRaw)
	if h.DeviceModels == nil {
		h.DeviceModels = []string{}
	}
	return &h, nil
}

func decodeArchive(raw []byte) map[string]string {
	out := map[string]string{}
	if len(raw) == 0 {
		return out
	}
	var generic map[string]any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return out
	}
	for k, v := range generic {
		if v == nil {
			continue
		}
		out[k] = fmt.Sprint(v)
	}
	return out
}

func (m *hospitalModel) Insert(ctx context.Context, h *Hospital) (int64, error) {
	archiveJSON, err := json.Marshal(h.Archive)
	if err != nil {
		return 0, fmt.Errorf("marshal archive: %w", err)
	}
	if h.Archive == nil {
		archiveJSON = []byte("{}")
	}
	var id int64
	err = m.conn.QueryRow(ctx, `
		INSERT INTO hospitals (name, province, city, district, level, type, status, address, remark, archive, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) RETURNING id`,
		h.Name, h.Province, h.City, h.District, h.Level, h.Type, h.Status, h.Address, h.Remark, archiveJSON, h.CreatedBy, h.UpdatedBy,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert hospital: %w", err)
	}
	return id, nil
}

func (m *hospitalModel) Update(ctx context.Context, h *Hospital) error {
	archiveJSON, err := json.Marshal(h.Archive)
	if err != nil {
		return fmt.Errorf("marshal archive: %w", err)
	}
	if h.Archive == nil {
		archiveJSON = []byte("{}")
	}
	_, err = m.conn.Exec(ctx, `
		UPDATE hospitals SET name=$1, province=$2, city=$3, district=$4, level=$5, type=$6,
		status=$7, address=$8, remark=$9, archive=$10::jsonb, updated_by=$11 WHERE id=$12`,
		h.Name, h.Province, h.City, h.District, h.Level, h.Type, h.Status, h.Address, h.Remark, archiveJSON, h.UpdatedBy, h.Id,
	)
	if err != nil {
		return fmt.Errorf("update hospital: %w", err)
	}
	return nil
}

func (m *hospitalModel) Delete(ctx context.Context, id int64) error {
	_, err := m.conn.Exec(ctx, `DELETE FROM hospitals WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("delete hospital: %w", err)
	}
	return nil
}

func (m *hospitalModel) ProvinceStats(ctx context.Context, regionProvinces []string) ([]ProvinceCount, error) {
	var rows pgx.Rows
	var err error
	if len(regionProvinces) == 0 {
		rows, err = m.conn.Query(ctx, `
			SELECT province AS name, COUNT(*)::INT AS value
			FROM hospitals GROUP BY province ORDER BY province`)
	} else {
		rows, err = m.conn.Query(ctx, `
			SELECT province AS name, COUNT(*)::INT AS value
			FROM hospitals WHERE province = ANY($1)
			GROUP BY province ORDER BY province`, regionProvinces)
	}
	if err != nil {
		return nil, fmt.Errorf("province stats: %w", err)
	}
	defer rows.Close()

	out := make([]ProvinceCount, 0)
	for rows.Next() {
		var p ProvinceCount
		if err := rows.Scan(&p.Name, &p.Value); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (m *hospitalModel) CityStats(ctx context.Context, province string, cities []string) ([]ProvinceCount, error) {
	var rows pgx.Rows
	var err error
	if len(cities) == 0 {
		rows, err = m.conn.Query(ctx, `
			SELECT city AS name, COUNT(*)::INT AS value
			FROM hospitals WHERE province = $1
			GROUP BY city ORDER BY city`, province)
	} else {
		rows, err = m.conn.Query(ctx, `
			SELECT city AS name, COUNT(*)::INT AS value
			FROM hospitals WHERE province = $1 AND city = ANY($2)
			GROUP BY city ORDER BY city`, province, cities)
	}
	if err != nil {
		return nil, fmt.Errorf("city stats: %w", err)
	}
	defer rows.Close()

	out := make([]ProvinceCount, 0)
	for rows.Next() {
		var p ProvinceCount
		if err := rows.Scan(&p.Name, &p.Value); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
