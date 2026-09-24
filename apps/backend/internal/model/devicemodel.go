package model

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Device struct {
	Id           int64
	HospitalId   int64
	HospitalName string
	Brand        string
	Category     string
	Model        string
	SerialNo     string
	Status       string
	InstalledAt  *time.Time
	Remark       string
	CreatedBy    *int64
	UpdatedBy    *int64
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type DeviceFilter struct {
	HospitalID int64
	Brand      string
	Category   string
	Status     string
	Keyword    string
	Limit      int
	Offset     int
}

type DeviceModel interface {
	List(ctx context.Context, f DeviceFilter) ([]Device, int64, error)
	ListByHospital(ctx context.Context, hospitalID int64) ([]Device, error)
	FindById(ctx context.Context, id int64) (*Device, error)
	FindByHospitalSerial(ctx context.Context, hospitalID int64, serial string) (*Device, error)
	Insert(ctx context.Context, d *Device) (int64, error)
	Update(ctx context.Context, d *Device) error
	Delete(ctx context.Context, id int64) error
}

type deviceModel struct{ conn *pgxpool.Pool }

func NewDeviceModel(conn *pgxpool.Pool) DeviceModel {
	return &deviceModel{conn: conn}
}

func (m *deviceModel) List(ctx context.Context, f DeviceFilter) ([]Device, int64, error) {
	limit, offset := f.Limit, f.Offset
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	where := []string{"1=1"}
	args := []any{}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if f.HospitalID > 0 {
		add("d.hospital_id = $%d", f.HospitalID)
	}
	if b := strings.TrimSpace(f.Brand); b != "" {
		if b == "竞品" {
			where = append(where, "d.brand <> '迈瑞'")
		} else {
			add("d.brand = $%d", b)
		}
	}
	if c := strings.TrimSpace(f.Category); c != "" {
		add("d.category = $%d", c)
	}
	if s := strings.TrimSpace(f.Status); s != "" {
		add("d.status = $%d", s)
	}
	if kw := strings.TrimSpace(f.Keyword); kw != "" {
		args = append(args, "%"+kw+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(
			"(d.model ILIKE $%d OR d.serial_no ILIKE $%d OR d.brand ILIKE $%d OR h.name ILIKE $%d)",
			n, n, n, n,
		))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := m.conn.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM devices d
		JOIN hospitals h ON h.id = d.hospital_id
		WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count devices: %w", err)
	}

	args = append(args, limit, offset)
	rows, err := m.conn.Query(ctx, fmt.Sprintf(`
		SELECT d.id, d.hospital_id, COALESCE(h.name,''), COALESCE(d.brand,'迈瑞'), d.category, d.model, d.serial_no,
		       d.status, d.installed_at, d.remark, d.created_by, d.updated_by, d.created_at, d.updated_at
		FROM devices d
		JOIN hospitals h ON h.id = d.hospital_id
		WHERE %s
		ORDER BY d.id DESC
		LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list devices: %w", err)
	}
	defer rows.Close()
	items := make([]Device, 0)
	for rows.Next() {
		var d Device
		if err := rows.Scan(
			&d.Id, &d.HospitalId, &d.HospitalName, &d.Brand, &d.Category, &d.Model, &d.SerialNo,
			&d.Status, &d.InstalledAt, &d.Remark, &d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		items = append(items, d)
	}
	return items, total, rows.Err()
}

func (m *deviceModel) ListByHospital(ctx context.Context, hospitalID int64) ([]Device, error) {
	items, _, err := m.List(ctx, DeviceFilter{HospitalID: hospitalID, Limit: 500})
	return items, err
}

func (m *deviceModel) FindById(ctx context.Context, id int64) (*Device, error) {
	var d Device
	err := m.conn.QueryRow(ctx, `
		SELECT d.id, d.hospital_id, COALESCE(h.name,''), COALESCE(d.brand,'迈瑞'), d.category, d.model, d.serial_no,
		       d.status, d.installed_at, d.remark, d.created_by, d.updated_by, d.created_at, d.updated_at
		FROM devices d
		JOIN hospitals h ON h.id = d.hospital_id
		WHERE d.id=$1`, id).Scan(
		&d.Id, &d.HospitalId, &d.HospitalName, &d.Brand, &d.Category, &d.Model, &d.SerialNo,
		&d.Status, &d.InstalledAt, &d.Remark, &d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("find device: %w", err)
	}
	return &d, nil
}

func (m *deviceModel) FindByHospitalSerial(ctx context.Context, hospitalID int64, serial string) (*Device, error) {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return nil, nil
	}
	var d Device
	err := m.conn.QueryRow(ctx, `
		SELECT d.id, d.hospital_id, COALESCE(h.name,''), COALESCE(d.brand,'迈瑞'), d.category, d.model, d.serial_no,
		       d.status, d.installed_at, d.remark, d.created_by, d.updated_by, d.created_at, d.updated_at
		FROM devices d
		JOIN hospitals h ON h.id = d.hospital_id
		WHERE d.hospital_id=$1 AND d.serial_no=$2
		ORDER BY d.id LIMIT 1`, hospitalID, serial).Scan(
		&d.Id, &d.HospitalId, &d.HospitalName, &d.Brand, &d.Category, &d.Model, &d.SerialNo,
		&d.Status, &d.InstalledAt, &d.Remark, &d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("find device by serial: %w", err)
	}
	return &d, nil
}

func (m *deviceModel) Insert(ctx context.Context, d *Device) (int64, error) {
	brand := strings.TrimSpace(d.Brand)
	if brand == "" {
		brand = "迈瑞"
	}
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO devices (hospital_id, brand, category, model, serial_no, status, installed_at, remark, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
		d.HospitalId, brand, d.Category, d.Model, d.SerialNo, d.Status, d.InstalledAt, d.Remark, d.CreatedBy, d.UpdatedBy,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert device: %w", err)
	}
	return id, nil
}

func (m *deviceModel) Update(ctx context.Context, d *Device) error {
	brand := strings.TrimSpace(d.Brand)
	if brand == "" {
		brand = "迈瑞"
	}
	_, err := m.conn.Exec(ctx, `
		UPDATE devices SET hospital_id=$1, brand=$2, category=$3, model=$4, serial_no=$5, status=$6, installed_at=$7, remark=$8, updated_by=$9
		WHERE id=$10`,
		d.HospitalId, brand, d.Category, d.Model, d.SerialNo, d.Status, d.InstalledAt, d.Remark, d.UpdatedBy, d.Id,
	)
	if err != nil {
		return fmt.Errorf("update device: %w", err)
	}
	return nil
}

func (m *deviceModel) Delete(ctx context.Context, id int64) error {
	_, err := m.conn.Exec(ctx, `DELETE FROM devices WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("delete device: %w", err)
	}
	return nil
}
