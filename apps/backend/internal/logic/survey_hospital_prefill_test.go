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
