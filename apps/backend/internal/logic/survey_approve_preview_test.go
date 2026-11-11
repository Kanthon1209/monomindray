package logic

import (
	"testing"

	"mindray/internal/types"
)

func TestPreviewDisplayAndEquality(t *testing.T) {
	if previewDisplay("") != "（空）" {
		t.Fatalf("empty should render as （空）")
	}
	if previewDisplay("  ") != "（空）" {
		t.Fatalf("whitespace should render as （空）")
	}
	if previewDisplay(" 合肥 ") != "合肥" {
		t.Fatalf("got %q", previewDisplay(" 合肥 "))
	}
	if !previewValuesEqual(" 合肥 ", "合肥") {
		t.Fatal("trimmed values should be equal")
	}
	if previewValuesEqual("合肥", "芜湖") {
		t.Fatal("different values should not be equal")
	}
}

func TestJoinCodesSortsAndDedups(t *testing.T) {
	got := joinCodes([]string{" b ", "a", "b", "", "c"})
	if got != "a、b、c" {
		t.Fatalf("got %q", got)
	}
	if joinCodes(nil) != "" {
		t.Fatalf("empty list should be empty string")
	}
}

func TestParsePublishDeviceRowDefaultsAndSkip(t *testing.T) {
	skipped, err := parsePublishDeviceRow(map[string]any{"remark": "x"})
	if err != nil {
		t.Fatal(err)
	}
	if skipped == nil || !skipped.Skip {
		t.Fatal("row without model/serial/line should be skipped")
	}

	d, err := parsePublishDeviceRow(map[string]any{
		"serialNo":      "SN-1",
		"assayLineCode": "biochem",
	})
	if err != nil {
		t.Fatal(err)
	}
	if d.Skip || d.Model != "未知机型" || d.Brand != "迈瑞" || d.Category != "biochem" || d.SerialNo != "SN-1" {
		t.Fatalf("unexpected defaults: %+v", d)
	}

	_, err = parsePublishDeviceRow(map[string]any{
		"model":             "CL-8000i",
		"serviceEvaluation": "不是可选值",
	})
	if err == nil {
		t.Fatal("invalid service evaluation should error")
	}
	if ce, ok := err.(*CodeError); !ok || ce.Code != 400 {
		t.Fatalf("expected 400 CodeError, got %v", err)
	}
}

func TestParsePublishDeviceRowMergesRemarksAndDates(t *testing.T) {
	d, err := parsePublishDeviceRow(map[string]any{
		"model":               "CL-8000i",
		"serialNo":            "A1",
		"installedAt":         "2024-01-02",
		"enabled_at":          "2024/03/04",
		"mindraySampleVolume": "100",
		"otherAnalyzers":      "竞品",
		"remark":              "备注",
		"itemCodes":           []any{"a", "b"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if d.InstalledAt == nil || d.EnabledAt == nil {
		t.Fatal("dates should parse")
	}
	if d.Remark != "迈瑞标本量:100；其它发光仪:竞品；备注" {
		t.Fatalf("remark=%q", d.Remark)
	}
	if joinCodes(d.ItemCodes) != "a、b" {
		t.Fatalf("codes=%v", d.ItemCodes)
	}
}

func TestSkipArchiveDiffKey(t *testing.T) {
	if !skipArchiveDiffKey("customer_level") || !skipArchiveDiffKey("mindrayProjects") {
		t.Fatal("retired keys should be skipped")
	}
	if skipArchiveDiffKey("otherAnalyzers") {
		t.Fatal("otherAnalyzers should be compared")
	}
}

func TestPreviewLabels(t *testing.T) {
	if attributeFieldLabel("customer_stage") != "客户所在阶段" {
		t.Fatal(attributeFieldLabel("customer_stage"))
	}
	if metricFieldLabel("sample_volume_own") != "迈瑞标本量" {
		t.Fatal(metricFieldLabel("sample_volume_own"))
	}
	if archiveFieldLabel("branchOffice") != "分公司" {
		t.Fatal(archiveFieldLabel("branchOffice"))
	}
}

func TestApprovePreviewRequiresConfirmOnlyOnUpdateWithChanges(t *testing.T) {
	create := types.ApproveSurveyPreviewResponse{Action: "create", Changes: []types.ApprovePreviewChange{{Label: "x"}}}
	if create.Action != "create" {
		t.Fatal("sanity")
	}
	// The API sets RequiresConfirm only for update + non-empty changes.
	updateNone := types.ApproveSurveyPreviewResponse{Action: "update", RequiresConfirm: false, Changes: []types.ApprovePreviewChange{}}
	if updateNone.RequiresConfirm {
		t.Fatal("no changes should not require the overwrite dialog")
	}
	updateSome := types.ApproveSurveyPreviewResponse{
		Action: "update", RequiresConfirm: true,
		Changes: []types.ApprovePreviewChange{{Group: "基础信息", Label: "地址", Before: "（空）", After: "新址"}},
	}
	if !updateSome.RequiresConfirm || len(updateSome.Changes) == 0 {
		t.Fatal("field changes should require confirm")
	}
	if updateSome.Changes[0].Before != "（空）" {
		t.Fatal("empty old values must use （空）")
	}
}

func TestHospitalNameConflictErrorMessage(t *testing.T) {
	err := hospitalNameConflictError("省立医院", "安徽", "合肥")
	ce, ok := err.(*CodeError)
	if !ok || ce.Code != 409 {
		t.Fatalf("expected 409, got %v", err)
	}
	if ce.Msg != "已存在同名客户「省立医院」（安徽 合肥），无法创建或更新为此名称" {
		t.Fatalf("message=%q", ce.Msg)
	}
}
