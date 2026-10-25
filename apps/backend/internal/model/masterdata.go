package model

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// MasterDataModel writes generic hospital related entities (dual-write from surveys / imports).
type MasterDataModel interface {
	UpsertAttribute(ctx context.Context, hospitalID int64, key, value string) error
	UpsertAttributes(ctx context.Context, hospitalID int64, attrs map[string]string) error
	ListAttributes(ctx context.Context, hospitalID int64) (map[string]string, error)
	ListAttributesByHospitalIDs(ctx context.Context, hospitalIDs []int64) (map[int64]map[string]string, error)

	EnsureAssayProject(ctx context.Context, name, line, company string) (int64, error)
	ReplaceOwnAssays(ctx context.Context, hospitalID int64, names []string, flagNew bool) error
	UpsertAssayRow(ctx context.Context, hospitalID int64, projectName, source, brand, instrument string, flags []string) error
	SyncAssaysFromArchive(ctx context.Context, hospitalID int64, archive map[string]any) error
	ReplaceHospitalAssaysByCodes(ctx context.Context, hospitalID int64, codes []string, source string) error
	ListHospitalAssayCodes(ctx context.Context, hospitalID int64) ([]string, error)
	ListHospitalAssayGroups(ctx context.Context, hospitalID int64) ([]HospitalAssayCategoryGroup, error)
	ListAssayNamesByHospitalIDs(ctx context.Context, hospitalIDs []int64) (map[int64][]string, error)
	ResolveAssayItemCodesByNames(ctx context.Context, names []string) ([]string, error)
	ListAssayTree(ctx context.Context) ([]AssayTreeNode, error)
	GetAssayProjectByCode(ctx context.Context, code string) (*AssayProject, error)

	ListAssayProjects(ctx context.Context, f AssayProjectFilter) ([]AssayProject, int64, error)
	GetAssayProject(ctx context.Context, id int64) (*AssayProject, error)
	CreateAssayProject(ctx context.Context, in AssayProjectInput) (*AssayProject, error)
	UpdateAssayProject(ctx context.Context, id int64, in AssayProjectInput) (*AssayProject, error)
	DeleteAssayProject(ctx context.Context, id int64) error
	ListAssayCompanies(ctx context.Context) ([]string, error)

	EnsureSupplier(ctx context.Context, name string) (int64, error)
	UpsertSupply(ctx context.Context, hospitalID int64, supplierName, role, brand, line, remark string) error

	EnsureStaff(ctx context.Context, name, employeeNo string) (int64, error)
	UpsertRoleAssignment(ctx context.Context, hospitalID int64, role, staffName, employeeNo string) error

	UpsertMetric(ctx context.Context, hospitalID int64, year int, code, valueText string) error
	UpsertMetrics(ctx context.Context, hospitalID int64, year int, metrics map[string]string) error
	ListMetrics(ctx context.Context, hospitalID int64, year int) (map[string]string, error)
}

type masterDataModel struct{ conn *pgxpool.Pool }

func NewMasterDataModel(conn *pgxpool.Pool) MasterDataModel {
	return &masterDataModel{conn: conn}
}

func (m *masterDataModel) UpsertAttribute(ctx context.Context, hospitalID int64, key, value string) error {
	key = strings.TrimSpace(key)
	value = strings.TrimSpace(value)
	if hospitalID <= 0 || key == "" || value == "" {
		return nil
	}
	_, err := m.conn.Exec(ctx, `
		INSERT INTO hospital_attributes (hospital_id, attr_key, attr_value, updated_at)
		VALUES ($1,$2,$3,NOW())
		ON CONFLICT (hospital_id, attr_key) DO UPDATE
		SET attr_value = EXCLUDED.attr_value, updated_at = NOW()`,
		hospitalID, key, value)
	return err
}

func (m *masterDataModel) UpsertAttributes(ctx context.Context, hospitalID int64, attrs map[string]string) error {
	for k, v := range attrs {
		if err := m.UpsertAttribute(ctx, hospitalID, k, v); err != nil {
			return err
		}
	}
	return nil
}

func (m *masterDataModel) ListAttributesByHospitalIDs(ctx context.Context, hospitalIDs []int64) (map[int64]map[string]string, error) {
	out := map[int64]map[string]string{}
	if len(hospitalIDs) == 0 {
		return out, nil
	}
	rows, err := m.conn.Query(ctx, `
		SELECT hospital_id, attr_key, attr_value
		FROM hospital_attributes
		WHERE hospital_id = ANY($1)`, hospitalIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var hid int64
		var k, v string
		if err := rows.Scan(&hid, &k, &v); err != nil {
			return nil, err
		}
		if out[hid] == nil {
			out[hid] = map[string]string{}
		}
		out[hid][k] = v
	}
	return out, rows.Err()
}

func (m *masterDataModel) ListAttributes(ctx context.Context, hospitalID int64) (map[string]string, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT attr_key, attr_value FROM hospital_attributes WHERE hospital_id=$1`, hospitalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

func (m *masterDataModel) EnsureAssayProject(ctx context.Context, name, line, company string) (int64, error) {
	// Hierarchical catalog: never invent flat rows. Resolve existing item by exact name.
	_ = line
	_ = company
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, nil
	}
	var id int64
	err := m.conn.QueryRow(ctx, `
		SELECT id FROM assay_projects
		WHERE kind = 'item' AND status = 'active' AND name = $1
		ORDER BY id ASC LIMIT 1`, name).Scan(&id)
	if err != nil {
		return 0, nil
	}
	return id, nil
}

func (m *masterDataModel) UpsertAssayRow(ctx context.Context, hospitalID int64, projectName, source, brand, instrument string, flags []string) error {
	projectName = strings.TrimSpace(projectName)
	if hospitalID <= 0 || projectName == "" {
		return nil
	}
	if source == "" {
		source = "own"
	}
	company := ""
	switch source {
	case "own":
		company = "迈瑞"
	case "competitor":
		company = strings.TrimSpace(brand)
	}
	pid, err := m.EnsureAssayProject(ctx, projectName, "", company)
	if err != nil {
		return err
	}
	if pid == 0 {
		// Unknown leaf name under hierarchical catalog — skip rather than invent.
		return nil
	}
	if flags == nil {
		flags = []string{}
	}
	_, err = m.conn.Exec(ctx, `
		INSERT INTO hospital_assays (hospital_id, assay_project_id, project_name, source, brand, instrument, flags)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		hospitalID, pid, projectName, source, strings.TrimSpace(brand), strings.TrimSpace(instrument), flags)
	return err
}

func (m *masterDataModel) ReplaceOwnAssays(ctx context.Context, hospitalID int64, names []string, flagNew bool) error {
	if hospitalID <= 0 {
		return nil
	}
	_, err := m.conn.Exec(ctx, `
		DELETE FROM hospital_assays WHERE hospital_id=$1 AND source='own'`, hospitalID)
	if err != nil {
		return err
	}
	seen := map[string]struct{}{}
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		if _, ok := seen[n]; ok {
			continue
		}
		seen[n] = struct{}{}
		flags := []string{}
		if flagNew {
			flags = []string{"new"}
		}
		if err := m.UpsertAssayRow(ctx, hospitalID, n, "own", "", "", flags); err != nil {
			return err
		}
	}
	return nil
}

// SyncAssaysFromArchive is a no-op after hierarchical migration 020.
// Hospital assays are owned exclusively by assay_block / ReplaceHospitalAssaysByCodes.
func (m *masterDataModel) SyncAssaysFromArchive(ctx context.Context, hospitalID int64, archive map[string]any) error {
	_ = ctx
	_ = hospitalID
	_ = archive
	return nil
}

func (m *masterDataModel) EnsureSupplier(ctx context.Context, name string) (int64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, nil
	}
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO suppliers (name, updated_at) VALUES ($1, NOW())
		ON CONFLICT (name) DO UPDATE SET updated_at = NOW()
		RETURNING id`, name).Scan(&id)
	return id, err
}

func (m *masterDataModel) UpsertSupply(ctx context.Context, hospitalID int64, supplierName, role, brand, line, remark string) error {
	supplierName = strings.TrimSpace(supplierName)
	if hospitalID <= 0 || supplierName == "" {
		return nil
	}
	if role == "" {
		role = "other"
	}
	sid, err := m.EnsureSupplier(ctx, supplierName)
	if err != nil {
		return err
	}
	_, err = m.conn.Exec(ctx, `
		DELETE FROM hospital_supplies
		WHERE hospital_id=$1 AND role=$2 AND supplier_name=$3`, hospitalID, role, supplierName)
	if err != nil {
		return err
	}
	_, err = m.conn.Exec(ctx, `
		INSERT INTO hospital_supplies (hospital_id, supplier_id, supplier_name, role, brand, line_category, remark)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		hospitalID, nullIfZero(sid), supplierName, role, strings.TrimSpace(brand), strings.TrimSpace(line), strings.TrimSpace(remark))
	return err
}

func (m *masterDataModel) EnsureStaff(ctx context.Context, name, employeeNo string) (int64, error) {
	name = strings.TrimSpace(name)
	employeeNo = strings.TrimSpace(employeeNo)
	if name == "" && employeeNo == "" {
		return 0, nil
	}
	if name == "" {
		name = employeeNo
	}
	var id int64
	if employeeNo != "" {
		err := m.conn.QueryRow(ctx, `
			SELECT id FROM org_staff WHERE employee_no=$1`, employeeNo).Scan(&id)
		if err == nil {
			_, _ = m.conn.Exec(ctx, `UPDATE org_staff SET name=$1, updated_at=NOW() WHERE id=$2`, name, id)
			return id, nil
		}
	}
	err := m.conn.QueryRow(ctx, `
		INSERT INTO org_staff (name, employee_no, updated_at) VALUES ($1,$2,NOW()) RETURNING id`,
		name, employeeNo).Scan(&id)
	return id, err
}

func (m *masterDataModel) UpsertRoleAssignment(ctx context.Context, hospitalID int64, role, staffName, employeeNo string) error {
	staffName = strings.TrimSpace(staffName)
	employeeNo = strings.TrimSpace(employeeNo)
	role = strings.TrimSpace(role)
	if hospitalID <= 0 || role == "" || (staffName == "" && employeeNo == "") {
		return nil
	}
	sid, err := m.EnsureStaff(ctx, staffName, employeeNo)
	if err != nil {
		return err
	}
	if staffName == "" {
		staffName = employeeNo
	}
	_, err = m.conn.Exec(ctx, `
		DELETE FROM hospital_role_assignments WHERE hospital_id=$1 AND role=$2`, hospitalID, role)
	if err != nil {
		return err
	}
	_, err = m.conn.Exec(ctx, `
		INSERT INTO hospital_role_assignments (hospital_id, staff_id, staff_name, role)
		VALUES ($1,$2,$3,$4)`, hospitalID, nullIfZero(sid), staffName, role)
	return err
}

func (m *masterDataModel) UpsertMetric(ctx context.Context, hospitalID int64, year int, code, valueText string) error {
	code = strings.TrimSpace(code)
	valueText = strings.TrimSpace(valueText)
	if hospitalID <= 0 || year <= 0 || code == "" || valueText == "" {
		return nil
	}
	var num *float64
	if f, err := strconv.ParseFloat(strings.ReplaceAll(valueText, ",", ""), 64); err == nil {
		num = &f
	}
	_, err := m.conn.Exec(ctx, `
		INSERT INTO hospital_metrics (hospital_id, year, metric_code, value_text, value_num, updated_at)
		VALUES ($1,$2,$3,$4,$5,NOW())
		ON CONFLICT (hospital_id, year, metric_code) DO UPDATE
		SET value_text = EXCLUDED.value_text, value_num = EXCLUDED.value_num, updated_at = NOW()`,
		hospitalID, year, code, valueText, num)
	return err
}

func (m *masterDataModel) UpsertMetrics(ctx context.Context, hospitalID int64, year int, metrics map[string]string) error {
	for k, v := range metrics {
		if err := m.UpsertMetric(ctx, hospitalID, year, k, v); err != nil {
			return err
		}
	}
	return nil
}

func (m *masterDataModel) ListMetrics(ctx context.Context, hospitalID int64, year int) (map[string]string, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT metric_code, value_text FROM hospital_metrics
		WHERE hospital_id=$1 AND year=$2`, hospitalID, year)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

func nullIfZero(id int64) *int64 {
	if id <= 0 {
		return nil
	}
	return &id
}

// KnownAttributeKeys maps survey/archive keys to hospital_attributes keys.
var KnownAttributeKeys = map[string]string{
	"customerLevel":     "customer_level",
	"customer_level":    "customer_level",
	// usage_location moved to devices.usage_location (device instance attr)
	"customerStage":     "customer_stage",
	"customer_stage":    "customer_stage",
	"pendingIssues":     "pending_issues",
	"pending_issues":    "pending_issues",
	"collectorName":     "collector_name",
	"collector_name":    "collector_name",
	"svipLevel":         "svip_level",
	"dualMajorCustomer": "dual_major",
	"groupName":         "sales_group",
	"volumeDirection":   "volume_direction",
	"dualMajorType":     "dual_major_type",
	"dualMajorTarget":   "dual_major_target",
	"customerSegment":   "customer_segment",
	"segmentCategory":   "segment_category",
}

// CustomerStageEnum / DeviceServiceEvaluationEnum are system-preset; do not accept free invent.
var CustomerStageEnum = []string{"覆盖不满足", "覆盖满足", "客户满意", "客户认可"}

var DeviceServiceEvaluationEnum = []string{
	"无专人负责",
	"新人 有资质",
	"负责区域一年以上",
	"客户关系良好, 口碑优于竞品",
	"竞品未知",
}

func IsAllowedEnum(value string, allowed []string) bool {
	v := strings.TrimSpace(value)
	if v == "" {
		return true
	}
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

// KnownMetricKeys maps survey/archive keys to hospital_metrics codes.
var KnownMetricKeys = map[string]string{
	"mindraySampleVolume":   "sample_volume_own",
	"totalSampleVolume":     "sample_volume_total",
	"matchingRate":          "matching_rate",
	"qcVendor":              "qc_vendor",
	"qcLevels":              "qc_levels",
	"qcCycle":               "qc_cycle",
	"annualRevenue":         "hospital_annual_revenue",
	"iotStock23":            "iot_stock",
	"iotForecast24":         "iot_forecast",
	"iotIncrement24":        "iot_increment",
	"iotGrowthRate24":       "iot_growth_rate",
	"hospitalReagentOutput": "reagent_revenue",
	"reagentOutputTarget":   "reagent_revenue_target",
}

// KnownRoleKeys maps archive/survey field keys to assignment roles.
var KnownRoleKeys = map[string]string{
	"productLineSales": "product_line_sales",
	"reagentSales":     "reagent_sales",
	"psName":           "ps",
	"clinicalApp":      "clinical_app",
	"serviceEngineer":  "service_engineer",
	"salesOwner":       "sales_owner",
}

// RoleEmployeeNoKeys pairs role field with employee number field in archive.
var RoleEmployeeNoKeys = map[string]string{
	"productLineSales": "productLineSalesId",
	"reagentSales":     "reagentSalesId",
	"psName":           "psId",
	"clinicalApp":      "clinicalAppId",
	"serviceEngineer":  "serviceEngineerId",
}

func CurrentMetricYear() int {
	return time.Now().Year()
}
