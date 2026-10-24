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
	Id                 int64
	HospitalId         int64
	HospitalName       string
	Brand              string
	Category           string
	AssayLineCode      string
	Model              string
	SerialNo           string
	Status             string
	InstalledAt        *time.Time
	EnabledAt          *time.Time
	Remark             string
	ServiceEvaluation  string
	ItemCodes          []string
	CreatedBy          *int64
	UpdatedBy          *int64
	CreatedAt          time.Time
	UpdatedAt          time.Time
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
	ReplaceDeviceAssayItems(ctx context.Context, deviceID int64, itemCodes []string) error
	ListDeviceAssayCodes(ctx context.Context, deviceID int64) ([]string, error)
	ListDeviceAssayCodesByHospital(ctx context.Context, hospitalID int64) (map[int64][]string, error)
	SyncHospitalAssaysFromDevices(ctx context.Context, hospitalID int64) error
}

type deviceModel struct{ conn *pgxpool.Pool }

func NewDeviceModel(conn *pgxpool.Pool) DeviceModel {
	return &deviceModel{conn: conn}
}

// CategoryFromAssayLine maps assay line codes to legacy devices.category enum.
func CategoryFromAssayLine(line string) string {
	switch strings.TrimSpace(line) {
	case "biochem":
		return "biochem"
	case "immuno":
		return "immuno"
	case "coag":
		return "coag"
	case "heme":
		return "hematology"
	default:
		return ""
	}
}

func deviceSelectCols() string {
	return `d.id, d.hospital_id, COALESCE(h.name,''), COALESCE(d.brand,'迈瑞'), d.category,
		COALESCE(d.assay_line_code,''), d.model, d.serial_no,
		d.status, d.installed_at, d.enabled_at, d.remark, COALESCE(d.service_evaluation,''),
		d.created_by, d.updated_by, d.created_at, d.updated_at`
}

func scanDevice(row interface {
	Scan(dest ...any) error
}) (Device, error) {
	var d Device
	err := row.Scan(
		&d.Id, &d.HospitalId, &d.HospitalName, &d.Brand, &d.Category,
		&d.AssayLineCode, &d.Model, &d.SerialNo,
		&d.Status, &d.InstalledAt, &d.EnabledAt, &d.Remark, &d.ServiceEvaluation,
		&d.CreatedBy, &d.UpdatedBy, &d.CreatedAt, &d.UpdatedAt,
	)
	if d.ItemCodes == nil {
		d.ItemCodes = []string{}
	}
	return d, err
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
		SELECT %s
		FROM devices d
		JOIN hospitals h ON h.id = d.hospital_id
		WHERE %s
		ORDER BY d.id DESC
		LIMIT $%d OFFSET $%d`, deviceSelectCols(), whereSQL, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list devices: %w", err)
	}
	defer rows.Close()
	items := make([]Device, 0)
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, d)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	if err := m.attachItemCodes(ctx, items); err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

func (m *deviceModel) attachItemCodes(ctx context.Context, items []Device) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]int64, len(items))
	for i := range items {
		ids[i] = items[i].Id
		items[i].ItemCodes = []string{}
	}
	rows, err := m.conn.Query(ctx, `
		SELECT dai.device_id, COALESCE(ap.code, '')
		FROM device_assay_items dai
		JOIN assay_projects ap ON ap.id = dai.assay_project_id
		WHERE dai.device_id = ANY($1) AND ap.kind = 'item' AND TRIM(COALESCE(ap.code,'')) <> ''
		ORDER BY dai.device_id, ap.sort_order, ap.name`, ids)
	if err != nil {
		// Table may not exist yet during rolling deploy; treat as empty.
		if strings.Contains(err.Error(), "device_assay_items") {
			return nil
		}
		return err
	}
	defer rows.Close()
	byID := map[int64]*Device{}
	for i := range items {
		byID[items[i].Id] = &items[i]
	}
	for rows.Next() {
		var did int64
		var code string
		if err := rows.Scan(&did, &code); err != nil {
			return err
		}
		if d, ok := byID[did]; ok {
			d.ItemCodes = append(d.ItemCodes, code)
		}
	}
	return rows.Err()
}

func (m *deviceModel) ListByHospital(ctx context.Context, hospitalID int64) ([]Device, error) {
	items, _, err := m.List(ctx, DeviceFilter{HospitalID: hospitalID, Limit: 500})
	return items, err
}

func (m *deviceModel) FindById(ctx context.Context, id int64) (*Device, error) {
	row := m.conn.QueryRow(ctx, `
		SELECT `+deviceSelectCols()+`
		FROM devices d
		JOIN hospitals h ON h.id = d.hospital_id
		WHERE d.id=$1`, id)
	d, err := scanDevice(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("find device: %w", err)
	}
	codes, err := m.ListDeviceAssayCodes(ctx, d.Id)
	if err != nil {
		return nil, err
	}
	d.ItemCodes = codes
	return &d, nil
}

func (m *deviceModel) FindByHospitalSerial(ctx context.Context, hospitalID int64, serial string) (*Device, error) {
	serial = strings.TrimSpace(serial)
	if serial == "" {
		return nil, nil
	}
	row := m.conn.QueryRow(ctx, `
		SELECT `+deviceSelectCols()+`
		FROM devices d
		JOIN hospitals h ON h.id = d.hospital_id
		WHERE d.hospital_id=$1 AND d.serial_no=$2
		ORDER BY d.id LIMIT 1`, hospitalID, serial)
	d, err := scanDevice(row)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("find device by serial: %w", err)
	}
	codes, err := m.ListDeviceAssayCodes(ctx, d.Id)
	if err != nil {
		return nil, err
	}
	d.ItemCodes = codes
	return &d, nil
}

func (m *deviceModel) Insert(ctx context.Context, d *Device) (int64, error) {
	brand := strings.TrimSpace(d.Brand)
	if brand == "" {
		brand = "迈瑞"
	}
	line := strings.TrimSpace(d.AssayLineCode)
	cat := strings.TrimSpace(d.Category)
	if cat == "" {
		cat = CategoryFromAssayLine(line)
	}
	if cat == "" {
		cat = "immuno"
	}
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO devices (hospital_id, brand, category, assay_line_code, model, serial_no, status, installed_at, enabled_at, remark, service_evaluation, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
		d.HospitalId, brand, cat, line, d.Model, d.SerialNo, d.Status, d.InstalledAt, d.EnabledAt, d.Remark, strings.TrimSpace(d.ServiceEvaluation), d.CreatedBy, d.UpdatedBy,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert device: %w", err)
	}
	if len(d.ItemCodes) > 0 {
		if err := m.ReplaceDeviceAssayItems(ctx, id, d.ItemCodes); err != nil {
			return id, err
		}
	}
	return id, nil
}

func (m *deviceModel) Update(ctx context.Context, d *Device) error {
	brand := strings.TrimSpace(d.Brand)
	if brand == "" {
		brand = "迈瑞"
	}
	line := strings.TrimSpace(d.AssayLineCode)
	cat := strings.TrimSpace(d.Category)
	if cat == "" {
		cat = CategoryFromAssayLine(line)
	}
	if cat == "" {
		cat = d.Category
	}
	_, err := m.conn.Exec(ctx, `
		UPDATE devices SET hospital_id=$1, brand=$2, category=$3, assay_line_code=$4, model=$5, serial_no=$6,
		       status=$7, installed_at=$8, enabled_at=$9, remark=$10, service_evaluation=$11, updated_by=$12
		WHERE id=$13`,
		d.HospitalId, brand, cat, line, d.Model, d.SerialNo, d.Status, d.InstalledAt, d.EnabledAt, d.Remark, strings.TrimSpace(d.ServiceEvaluation), d.UpdatedBy, d.Id,
	)
	if err != nil {
		return fmt.Errorf("update device: %w", err)
	}
	if d.ItemCodes != nil {
		if err := m.ReplaceDeviceAssayItems(ctx, d.Id, d.ItemCodes); err != nil {
			return err
		}
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

func (m *deviceModel) ListDeviceAssayCodes(ctx context.Context, deviceID int64) ([]string, error) {
	if deviceID <= 0 {
		return []string{}, nil
	}
	rows, err := m.conn.Query(ctx, `
		SELECT COALESCE(ap.code, '')
		FROM device_assay_items dai
		JOIN assay_projects ap ON ap.id = dai.assay_project_id
		WHERE dai.device_id=$1 AND ap.kind='item' AND TRIM(COALESCE(ap.code,'')) <> ''
		ORDER BY ap.sort_order, ap.name`, deviceID)
	if err != nil {
		if strings.Contains(err.Error(), "device_assay_items") {
			return []string{}, nil
		}
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (m *deviceModel) ListDeviceAssayCodesByHospital(ctx context.Context, hospitalID int64) (map[int64][]string, error) {
	out := map[int64][]string{}
	if hospitalID <= 0 {
		return out, nil
	}
	rows, err := m.conn.Query(ctx, `
		SELECT d.id, COALESCE(ap.code, '')
		FROM devices d
		JOIN device_assay_items dai ON dai.device_id = d.id
		JOIN assay_projects ap ON ap.id = dai.assay_project_id
		WHERE d.hospital_id=$1 AND ap.kind='item' AND TRIM(COALESCE(ap.code,'')) <> ''
		ORDER BY d.id, ap.sort_order, ap.name`, hospitalID)
	if err != nil {
		if strings.Contains(err.Error(), "device_assay_items") {
			return out, nil
		}
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var did int64
		var code string
		if err := rows.Scan(&did, &code); err != nil {
			return nil, err
		}
		out[did] = append(out[did], code)
	}
	return out, rows.Err()
}

func (m *deviceModel) ReplaceDeviceAssayItems(ctx context.Context, deviceID int64, itemCodes []string) error {
	if deviceID <= 0 {
		return nil
	}
	seen := map[string]struct{}{}
	clean := make([]string, 0, len(itemCodes))
	for _, c := range itemCodes {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		clean = append(clean, c)
	}

	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM device_assay_items WHERE device_id=$1`, deviceID); err != nil {
		return err
	}
	for _, code := range clean {
		var id int64
		var kind string
		err := tx.QueryRow(ctx, `
			SELECT id, kind FROM assay_projects WHERE code=$1 AND status='active'`, code).
			Scan(&id, &kind)
		if err == pgx.ErrNoRows {
			return fmt.Errorf("unknown assay code: %s", code)
		}
		if err != nil {
			return err
		}
		if kind != "item" {
			return fmt.Errorf("assay code is not an item: %s", code)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO device_assay_items (device_id, assay_project_id) VALUES ($1,$2)
			ON CONFLICT DO NOTHING`, deviceID, id); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// SyncHospitalAssaysFromDevices rewrites hospital_assays rows that have device_id set
// from the current device_assay_items. Leaves assay_block rows (device_id IS NULL) untouched.
func (m *deviceModel) SyncHospitalAssaysFromDevices(ctx context.Context, hospitalID int64) error {
	if hospitalID <= 0 {
		return nil
	}
	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM hospital_assays WHERE hospital_id=$1 AND device_id IS NOT NULL`, hospitalID); err != nil {
		return err
	}

	rows, err := tx.Query(ctx, `
		SELECT d.id, COALESCE(d.brand,'迈瑞'), dai.assay_project_id, COALESCE(ap.name,''), COALESCE(ap.code,'')
		FROM devices d
		JOIN device_assay_items dai ON dai.device_id = d.id
		JOIN assay_projects ap ON ap.id = dai.assay_project_id
		WHERE d.hospital_id=$1 AND d.status='active' AND ap.kind='item' AND ap.status='active'`, hospitalID)
	if err != nil {
		return err
	}
	type rowT struct {
		deviceID, assayID int64
		brand, name, code string
	}
	list := []rowT{}
	for rows.Next() {
		var r rowT
		if err := rows.Scan(&r.deviceID, &r.brand, &r.assayID, &r.name, &r.code); err != nil {
			rows.Close()
			return err
		}
		list = append(list, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, r := range list {
		source := "own"
		brand := strings.TrimSpace(r.brand)
		if brand == "" {
			brand = "迈瑞"
		}
		if brand != "迈瑞" {
			source = "competitor"
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO hospital_assays (hospital_id, assay_project_id, project_name, source, brand, instrument, device_id, flags)
			VALUES ($1,$2,$3,$4,$5,'',$6,'{}')`,
			hospitalID, r.assayID, r.name, source, brand, r.deviceID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
