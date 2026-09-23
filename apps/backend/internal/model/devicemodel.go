package model

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Device struct {
	Id          int64      `db:"id"`
	HospitalId  int64      `db:"hospital_id"`
	Category    string     `db:"category"`
	Model       string     `db:"model"`
	SerialNo    string     `db:"serial_no"`
	Status      string     `db:"status"`
	InstalledAt *time.Time `db:"installed_at"`
	Remark      string     `db:"remark"`
	CreatedBy   *int64     `db:"created_by"`
	UpdatedBy   *int64     `db:"updated_by"`
	CreatedAt   time.Time  `db:"created_at"`
	UpdatedAt   time.Time  `db:"updated_at"`
}

type DeviceModel interface {
	ListByHospital(ctx context.Context, hospitalID int64) ([]Device, error)
	FindById(ctx context.Context, id int64) (*Device, error)
	Insert(ctx context.Context, d *Device) (int64, error)
	Update(ctx context.Context, d *Device) error
	Delete(ctx context.Context, id int64) error
}

type deviceModel struct{ conn *pgxpool.Pool }

func NewDeviceModel(conn *pgxpool.Pool) DeviceModel {
	return &deviceModel{conn: conn}
}

func (m *deviceModel) ListByHospital(ctx context.Context, hospitalID int64) ([]Device, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT id, hospital_id, category, model, serial_no, status, installed_at, remark,
		       created_by, updated_by, created_at, updated_at
		FROM devices WHERE hospital_id=$1 ORDER BY id`, hospitalID)
	if err != nil {
		return nil, fmt.Errorf("list devices: %w", err)
	}
	defer rows.Close()
	return scanDevices(rows)
}

func (m *deviceModel) FindById(ctx context.Context, id int64) (*Device, error) {
	var d Device
	err := m.conn.QueryRow(ctx, `
		SELECT id, hospital_id, category, model, serial_no, status, installed_at, remark,
		       created_by, updated_by, created_at, updated_at
		FROM devices WHERE id=$1`, id).Scan(
		&d.Id, &d.HospitalId, &d.Category, &d.Model, &d.SerialNo, &d.Status, &d.InstalledAt, &d.Remark,
		&d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("find device: %w", err)
	}
	return &d, nil
}

func (m *deviceModel) Insert(ctx context.Context, d *Device) (int64, error) {
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO devices (hospital_id, category, model, serial_no, status, installed_at, remark, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
		d.HospitalId, d.Category, d.Model, d.SerialNo, d.Status, d.InstalledAt, d.Remark, d.CreatedBy, d.UpdatedBy,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert device: %w", err)
	}
	return id, nil
}

func (m *deviceModel) Update(ctx context.Context, d *Device) error {
	_, err := m.conn.Exec(ctx, `
		UPDATE devices SET category=$1, model=$2, serial_no=$3, status=$4, installed_at=$5, remark=$6, updated_by=$7
		WHERE id=$8`,
		d.Category, d.Model, d.SerialNo, d.Status, d.InstalledAt, d.Remark, d.UpdatedBy, d.Id,
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

func scanDevices(rows pgx.Rows) ([]Device, error) {
	items := make([]Device, 0)
	for rows.Next() {
		var d Device
		if err := rows.Scan(
			&d.Id, &d.HospitalId, &d.Category, &d.Model, &d.SerialNo, &d.Status, &d.InstalledAt, &d.Remark,
			&d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, d)
	}
	return items, rows.Err()
}
