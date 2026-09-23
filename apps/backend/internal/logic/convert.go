package logic

import (
	"strings"
	"time"

	"mindray/internal/model"
	"mindray/internal/types"
)

var provinceRegionMap = map[string]string{
	"北京市": "huabei", "天津市": "huabei", "河北省": "huabei", "山西省": "huabei", "内蒙古自治区": "huabei",
	"上海市": "huadong", "江苏省": "huadong", "浙江省": "huadong", "安徽省": "huadong", "福建省": "huadong", "江西省": "huadong", "山东省": "huadong",
	"广东省": "huanan", "广西壮族自治区": "huanan", "海南省": "huanan",
	"河南省": "huazhong", "湖北省": "huazhong", "湖南省": "huazhong",
	"重庆市": "xinan", "四川省": "xinan", "贵州省": "xinan", "云南省": "xinan", "西藏自治区": "xinan",
	"陕西省": "xibei", "甘肃省": "xibei", "青海省": "xibei", "宁夏回族自治区": "xibei", "新疆维吾尔自治区": "xibei",
	"辽宁省": "dongbei", "吉林省": "dongbei", "黑龙江省": "dongbei",
}

var levelCodeMap = map[string]string{
	"sanjiayi": "三级甲等", "sanjiyi": "三级乙等", "erjiayi": "二级甲等", "erjiyi": "二级乙等", "yiji": "一级",
}
var typeCodeMap = map[string]string{
	"zonghe": "综合医院", "zhuanke": "专科医院", "zhongyi": "中医医院", "fuyou": "妇幼保健院",
}
var modelCodeMap = map[string]string{
	"bs2000m": "BS-2000M", "bs2200": "BS-2200", "cl8000": "CL-8000",
	"cl6000": "CL-6000", "bc7500": "BC-7500", "bc6800": "BC-6800",
}

func resolveLevel(v string) string {
	if mapped, ok := levelCodeMap[v]; ok {
		return mapped
	}
	return v
}
func resolveType(v string) string {
	if mapped, ok := typeCodeMap[v]; ok {
		return mapped
	}
	return v
}
func resolveModel(v string) string {
	if mapped, ok := modelCodeMap[v]; ok {
		return mapped
	}
	return v
}

func provincesByRegion(region string) []string {
	if region == "" || region == "all" {
		return nil
	}
	out := make([]string, 0)
	for p, r := range provinceRegionMap {
		if r == region {
			out = append(out, p)
		}
	}
	return out
}

func ptrInt64(v int64) *int64 { return &v }

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func formatDate(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02")
}

func toHospitalInfo(h *model.Hospital) types.HospitalInfo {
	models := h.DeviceModels
	if models == nil {
		models = []string{}
	}
	return types.HospitalInfo{
		Id: h.Id, Name: h.Name, Province: h.Province, City: h.City, District: h.District,
		Level: h.Level, Type: h.Type, Status: h.Status, Address: h.Address, Remark: h.Remark,
		DeviceCount: h.DeviceCount, DeviceModels: models, CreatedAt: formatTime(h.CreatedAt),
	}
}

func toDeviceInfo(d *model.Device) types.DeviceInfo {
	return types.DeviceInfo{
		Id: d.Id, HospitalId: d.HospitalId, Category: d.Category, Model: d.Model,
		SerialNo: d.SerialNo, Status: d.Status, InstalledAt: formatDate(d.InstalledAt), Remark: d.Remark,
	}
}

func toCustomerInfo(c *model.Customer) types.CustomerInfo {
	return types.CustomerInfo{
		Id: c.Id, HospitalId: c.HospitalId, HospitalName: c.HospitalName,
		Name: c.Name, Title: c.Title, Phone: c.Phone, Email: c.Email, Remark: c.Remark,
		CreatedAt: formatTime(c.CreatedAt),
	}
}

func toCaseInfo(c *model.Case) types.CaseInfo {
	return types.CaseInfo{
		Id: c.Id, HospitalId: c.HospitalId, HospitalName: c.HospitalName,
		DeviceId: c.DeviceId, DeviceModel: c.DeviceModel, Title: c.Title,
		Summary: c.Summary, Content: c.Content, Status: c.Status,
		CollectedAt: formatTime(c.CollectedAt), CreatedAt: formatTime(c.CreatedAt),
	}
}

func requireApprovedUser(role string) error {
	if role == "" {
		return ErrUnauthorized
	}
	return nil
}

func normalizeStatus(v, fallback string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return fallback
	}
	return v
}
