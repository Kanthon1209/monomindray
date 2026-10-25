package logic

import (
	"encoding/json"
	"testing"
)

func TestExtractHospitalNameFromAnswers(t *testing.T) {
	schema := json.RawMessage(`{"fields":[{"key":"custom_hosp","label":"客户名称","type":"text","target":"hospital.name"}]}`)
	got := extractHospitalNameFromAnswers(schema, map[string]any{"custom_hosp": " 合肥新测试医院 "})
	if got != "合肥新测试医院" {
		t.Fatalf("expected 合肥新测试医院, got %q", got)
	}

	gotFallback := extractHospitalNameFromAnswers(nil, map[string]any{"hospital_name": "蚌埠某医院"})
	if gotFallback != "蚌埠某医院" {
		t.Fatalf("expected 蚌埠某医院, got %q", gotFallback)
	}
}

func TestCityFromBranchOrDefault(t *testing.T) {
	if got := cityFromBranchOrDefault("芜湖分公司", "安徽省"); got != "芜湖市" {
		t.Fatalf("expected 芜湖市, got %q", got)
	}
	if got := cityFromBranchOrDefault("", "安徽省"); got != "合肥市" {
		t.Fatalf("expected 合肥市, got %q", got)
	}
	if got := cityFromBranchOrDefault("", "江苏省"); got != "江苏省" {
		t.Fatalf("expected 江苏省, got %q", got)
	}
}
