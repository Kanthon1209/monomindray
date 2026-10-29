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

// regionLabelByCode maps national / Anhui region codes to UI labels (大区).
var regionLabelByCode = map[string]string{
	"huabei": "华北", "huadong": "华东", "huanan": "华南", "huazhong": "华中",
	"xinan": "西南", "xibei": "西北", "dongbei": "东北",
	"wanbei": "皖北", "wanzhong": "皖中", "wannan": "皖南",
}

var provinceShortAliases = map[string]string{
	"北京": "北京市", "天津": "天津市", "上海": "上海市", "重庆": "重庆市",
	"内蒙古": "内蒙古自治区", "广西": "广西壮族自治区", "西藏": "西藏自治区",
	"宁夏": "宁夏回族自治区", "新疆": "新疆维吾尔自治区",
	"河北": "河北省", "山西": "山西省", "辽宁": "辽宁省", "吉林": "吉林省", "黑龙江": "黑龙江省",
	"江苏": "江苏省", "浙江": "浙江省", "安徽": "安徽省", "福建": "福建省", "江西": "江西省", "山东": "山东省",
	"河南": "河南省", "湖北": "湖北省", "湖南": "湖南省", "广东": "广东省", "海南": "海南省",
	"四川": "四川省", "贵州": "贵州省", "云南": "云南省", "陕西": "陕西省", "甘肃": "甘肃省", "青海": "青海省",
}

// regionLabelFromProvince returns the national 大区 label (华东/华北…) for a province name.
// Empty when the province is unknown. Authoritative for hospital.region on ingest.
func regionLabelFromProvince(province string) string {
	p := strings.TrimSpace(province)
	if p == "" {
		return ""
	}
	candidates := []string{p}
	if alias, ok := provinceShortAliases[p]; ok {
		candidates = append(candidates, alias)
	}
	if !strings.HasSuffix(p, "省") && !strings.HasSuffix(p, "市") && !strings.HasSuffix(p, "区") {
		candidates = append(candidates, p+"省", p+"市")
	}
	for _, k := range candidates {
		if code, ok := provinceRegionMap[k]; ok {
			if label := regionLabelByCode[code]; label != "" {
				return label
			}
		}
	}
	return ""
}

// resolveRegionFromProvince prefers the mapped 大区 from province over a client-supplied value.
func resolveRegionFromProvince(province, clientRegion string) string {
	if derived := regionLabelFromProvince(province); derived != "" {
		return derived
	}
	return strings.TrimSpace(clientRegion)
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

var anhuiCityRegionMap = map[string]string{
	"宿州市": "wanbei", "淮北市": "wanbei", "亳州市": "wanbei", "阜阳市": "wanbei", "蚌埠市": "wanbei", "淮南市": "wanbei",
	"合肥市": "wanzhong", "六安市": "wanzhong", "滁州市": "wanzhong",
	"芜湖市": "wannan", "马鞍山市": "wannan", "宣城市": "wannan", "铜陵市": "wannan", "池州市": "wannan", "安庆市": "wannan", "黄山市": "wannan",
	// 兼容不带「市」的存量写法
	"宿州": "wanbei", "淮北": "wanbei", "亳州": "wanbei", "阜阳": "wanbei", "蚌埠": "wanbei", "淮南": "wanbei",
	"合肥": "wanzhong", "六安": "wanzhong", "滁州": "wanzhong",
	"芜湖": "wannan", "马鞍山": "wannan", "宣城": "wannan", "铜陵": "wannan", "池州": "wannan", "安庆": "wannan", "黄山": "wannan",
}

const defaultDashboardProvince = "安徽省"

func citiesByAnhuiRegion(region string) []string {
	if region == "" || region == "all" {
		return nil
	}
	seen := map[string]struct{}{}
	out := make([]string, 0)
	for city, r := range anhuiCityRegionMap {
		if r != region {
			continue
		}
		for _, v := range cityVariants(city) {
			if _, ok := seen[v]; ok {
				continue
			}
			seen[v] = struct{}{}
			out = append(out, v)
		}
	}
	return out
}

func cityVariants(city string) []string {
	city = strings.TrimSpace(city)
	if city == "" {
		return nil
	}
	if strings.HasSuffix(city, "市") {
		base := strings.TrimSuffix(city, "市")
		return []string{city, base}
	}
	return []string{city, city + "市"}
}

func normalizeAnhuiCity(city string) string {
	city = strings.TrimSpace(city)
	if city == "" {
		return ""
	}
	if strings.HasSuffix(city, "市") {
		return city
	}
	return city + "市"
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
	brands := h.DeviceBrands
	if brands == nil {
		brands = []string{}
	}
	archive := h.Archive
	if archive == nil {
		archive = map[string]any{}
	}
	return types.HospitalInfo{
		Id: h.Id, Name: h.Name, Province: h.Province, City: h.City, District: h.District,
		Level: h.Level, Type: h.Type, Status: h.Status, Address: h.Address, Remark: h.Remark,
		CustomerCode: h.CustomerCode, Region: h.Region, BranchOffice: h.BranchOffice,
		Archive: archive, DeviceCount: h.DeviceCount, DeviceModels: models, DeviceBrands: brands,
		CreatedAt: formatTime(h.CreatedAt),
	}
}

func toDeviceInfo(d *model.Device) types.DeviceInfo {
	brand := d.Brand
	if brand == "" {
		brand = "迈瑞"
	}
	items := d.ItemCodes
	if items == nil {
		items = []string{}
	}
	return types.DeviceInfo{
		Id: d.Id, HospitalId: d.HospitalId, HospitalName: d.HospitalName, Brand: brand,
		Category: d.Category, AssayLineCode: d.AssayLineCode, Model: d.Model, SerialNo: d.SerialNo, Status: d.Status,
		InstalledAt: formatDate(d.InstalledAt), EnabledAt: formatDate(d.EnabledAt), UsageLocation: d.UsageLocation, Remark: d.Remark, ServiceEvaluation: d.ServiceEvaluation,
		ReagentBrand: d.ReagentBrand, MonthlySampleVolume: d.MonthlySampleVolume, DeptHead: d.DeptHead, ChannelCsa: d.ChannelCsa, ItemCodes: items,
	}
}

func toCustomerInfo(c *model.Customer) types.CustomerInfo {
	return types.CustomerInfo{
		Id: c.Id, HospitalId: c.HospitalId, HospitalName: c.HospitalName,
		Name: c.Name, Title: c.Title, Phone: c.Phone, Email: c.Email, Remark: c.Remark,
		CreatedAt: formatTime(c.CreatedAt),
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
