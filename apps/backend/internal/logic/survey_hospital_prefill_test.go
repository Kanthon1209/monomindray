package logic

import (
	"encoding/json"
	"testing"
	"time"

	"mindray/internal/model"
)

func TestDeviceToSurveyAnswerRowDates(t *testing.T) {
	installed := time.Date(2024, 1, 2, 15, 4, 5, 0, time.UTC)
	d := model.Device{
		Brand:       "Mindray",
		Model:       "BS-800",
		SerialNo:    "SN-1",
		InstalledAt: &installed,
		ItemCodes:   []string{"GLU"},
	}
	row := deviceToSurveyAnswerRow(d)
	if row["installedAt"] != "2024-01-02" {
		t.Fatalf("installedAt=%v, want 2024-01-02", row["installedAt"])
	}
	if row["serialNo"] != "SN-1" || row["model"] != "BS-800" {
		t.Fatalf("unexpected row: %#v", row)
	}
	codes, _ := row["itemCodes"].([]string)
	if len(codes) != 1 || codes[0] != "GLU" {
		t.Fatalf("itemCodes=%v", row["itemCodes"])
	}
}

func TestSchemaKeysByType(t *testing.T) {
	schema := json.RawMessage(`{"fields":[
		{"key":"name","type":"text","target":"hospital.name"},
		{"key":"devices_block","type":"device_block"},
		{"key":"eqa","type":"eqa_block"}
	]}`)
	fields := parseSchemaFields(schema)
	got := schemaKeysByType(fields, "device_block")
	if len(got) != 1 || got[0] != "devices_block" {
		t.Fatalf("device keys=%v", got)
	}
	if keys := schemaKeysByType(fields, "eqa_block"); len(keys) != 1 || keys[0] != "eqa" {
		t.Fatalf("eqa keys=%v", keys)
	}
}

func TestHospitalsToSearchOptions(t *testing.T) {
	items := []model.Hospital{{
		Id: 7, Name: "First Hospital", Province: "Anhui", City: "Hefei", Level: "三级甲等",
	}}
	out := hospitalsToSearchOptions(items)
	if len(out) != 1 || out[0].Id != 7 || out[0].Name != "First Hospital" || out[0].City != "Hefei" {
		t.Fatalf("unexpected options: %#v", out)
	}
}

func TestMapHospitalToSchemaAnswersFillsAttributesMetricsAndArchive(t *testing.T) {
	schema := json.RawMessage(`{"fields":[
		{"key":"name","type":"text","target":"hospital.name"},
		{"key":"province","type":"text","target":"hospital.province"},
		{"key":"city","type":"text","target":"hospital.city"},
		{"key":"district","type":"text","target":"hospital.district"},
		{"key":"field_mvghtjga","type":"text","label":"分公司","target":"hospital.branchOffice"},
		{"key":"customer_level","type":"select","label":"客户等级","target":"hospital.attributes.customer_level"},
		{"key":"customer_stage","type":"select","label":"客户所在阶段","target":"hospital.attributes.customer_stage"},
		{"key":"pending_issues","type":"textarea","label":"客户端待解决问题及需求","target":"hospital.attributes.pending_issues"},
		{"key":"archiveRemark","type":"text","label":"采集者姓名","target":"hospital.attributes.collector_name"},
		{"key":"field_mvghu63h","type":"text","label":"医院年收入（亿）","target":"hospital.metrics.hospital_annual_revenue"},
		{"key":"field_mvab4frc","type":"text","label":"检验科年收入（千万）","target":"hospital.archive.labAnnualRevenue"},
		{"key":"field_mvghtyry","type":"text","label":"检验科主任","target":"hospital.archive.labDirector"},
		{"key":"mspOrderNo","type":"text","label":"MSP工单号","target":"hospital.archive.mspOrderNo"}
	]}`)
	h := &model.Hospital{
		Name:         "Test Hospital",
		Province:     "Anhui",
		City:         "Hefei",
		District:     "Shushan",
		Level:        "三级甲等",
		BranchOffice: "Hefei Branch",
		Archive: map[string]any{
			"labAnnualRevenue": "1.2",
			"labDirector":      "Dr. Li",
			"mspOrderNo":       "MSP-9",
			"customerLevel":    "should-not-win-over-attr",
		},
	}
	attrs := map[string]string{
		"customer_level": "Strategic",
		"customer_stage": "客户满意",
		"pending_issues": "Need more analyzers",
		"collector_name": "Collector A",
	}
	metrics := map[string]string{"hospital_annual_revenue": "3.5"}
	out := mapHospitalToSchemaAnswers(schema, h, attrs, metrics)

	assertEq := func(key, want string) {
		t.Helper()
		got := anyToString(out[key])
		if got != want {
			t.Fatalf("%s=%q, want %q (out=%v)", key, got, want, out)
		}
	}
	assertEq("name", "Test Hospital")
	assertEq("province", "Anhui")
	assertEq("city", "Hefei")
	assertEq("district", "Shushan")
	assertEq("field_mvghtjga", "Hefei Branch")
	assertEq("customer_level", "Strategic")
	assertEq("customer_stage", "客户满意")
	assertEq("pending_issues", "Need more analyzers")
	assertEq("archiveRemark", "Collector A")
	assertEq("field_mvghu63h", "3.5")
	assertEq("field_mvab4frc", "1.2")
	assertEq("field_mvghtyry", "Dr. Li")
	assertEq("mspOrderNo", "MSP-9")
	if _, ok := out["level"]; ok {
		t.Fatalf("hospital grade must not be written onto a missing level field: %v", out["level"])
	}
}

func TestMapHospitalToSchemaAnswersDoesNotCopyGradeIntoCustomerLevel(t *testing.T) {
	schema := json.RawMessage(`{"fields":[
		{"key":"customer_level","type":"select","label":"医院等级","target":"hospital.attributes.customer_level"},
		{"key":"level","type":"text","target":"hospital.level"}
	]}`)
	h := &model.Hospital{Name: "H", Level: "三级甲等"}
	out := mapHospitalToSchemaAnswers(schema, h, map[string]string{"customer_level": "Strategic"}, nil)
	if anyToString(out["customer_level"]) != "Strategic" {
		t.Fatalf("customer_level=%v", out["customer_level"])
	}
	if anyToString(out["level"]) != "三级甲等" {
		t.Fatalf("level=%v", out["level"])
	}

	out = mapHospitalToSchemaAnswers(schema, h, nil, nil)
	if _, ok := out["customer_level"]; ok {
		t.Fatalf("customer_level must stay empty when no attribute is stored, got %v", out["customer_level"])
	}
	if anyToString(out["level"]) != "三级甲等" {
		t.Fatalf("level=%v", out["level"])
	}
}

func TestMapHospitalToSchemaAnswersFallsBackToArchiveAndLabel(t *testing.T) {
	schema := json.RawMessage(`{"fields":[
		{"key":"customer_level","type":"select","label":"客户等级"},
		{"key":"field_x","type":"text","target":"hospital.archive.labDirector"}
	]}`)
	h := &model.Hospital{
		Name:    "H",
		Level:   "三级甲等",
		Archive: map[string]any{"customerLevel": "Key Account", "labDirector": "Dr. Wang"},
	}
	out := mapHospitalToSchemaAnswers(schema, h, nil, nil)
	if anyToString(out["customer_level"]) != "Key Account" {
		t.Fatalf("label/archive fallback customer_level=%v", out["customer_level"])
	}
	if anyToString(out["field_x"]) != "Dr. Wang" {
		t.Fatalf("labDirector=%v", out["field_x"])
	}
}

func TestPreferredMetricsCurrentYearThenLatest(t *testing.T) {
	all := []model.HospitalMetric{
		{Year: 2024, Code: "hospital_annual_revenue", Value: "2.0"},
		{Year: 2026, Code: "hospital_annual_revenue", Value: "3.1"},
		{Year: 2024, Code: "sample_volume_own", Value: "1000"},
		{Year: 2023, Code: "sample_volume_own", Value: "800"},
		{Year: 2024, Code: "qc_vendor", Value: ""},
	}
	got := preferredMetrics(all, 2026)
	if got["hospital_annual_revenue"] != "3.1" {
		t.Fatalf("current year not preferred: %v", got)
	}
	if got["sample_volume_own"] != "1000" {
		t.Fatalf("latest year fallback: %v", got)
	}
	if _, ok := got["qc_vendor"]; ok {
		t.Fatalf("empty metric must be skipped: %v", got)
	}
}
