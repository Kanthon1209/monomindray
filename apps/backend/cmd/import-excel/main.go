package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"mindray/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Import 《2024年化免客户档案.xlsx》 dump (JSON) into hospitals + archive + devices + project_items.

type dumpFile map[string][]map[string]any

func main() {
	path := `G:\mindray\data\import-excel-dump.json`
	if len(os.Args) > 1 {
		path = os.Args[1]
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	var dump dumpFile
	if err := json.Unmarshal(raw, &dump); err != nil {
		panic(err)
	}

	dsn := "postgres://mindray:mindray_secret@127.0.0.1:15432/mindray"
	if v := os.Getenv("DATABASE_URL"); v != "" {
		dsn = v
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		panic(err)
	}
	defer pool.Close()
	hm := model.NewHospitalModel(pool)

	stats := map[string]int{}
	// 1) 化学发光
	for _, row := range dump["化学发光"] {
		name := str(row["客户名称"])
		if name == "" {
			continue
		}
		city := normalizeCity(str(row["分公司"]))
		province := provinceOfCity(city)
		level := mapLevel(str(row["客户级别"]))
		typ := inferType(name)

		archive := map[string]any{}
		set := func(k, col string) {
			if v := str(row[col]); v != "" {
				archive[k] = v
			}
		}
		set("region", "大区")
		set("branchOffice", "分公司")
		set("customerName", "客户名称")
		set("customerCode", "客户代码")
		set("customerLevel", "客户级别")
		set("model", "机型")
		set("serialNo", "序列号")
		set("contactName", "负责人")
		set("contactPhone", "联系电话")
		if v := str(row["安装日期"]); v != "" {
			archive["installedAt"] = excelDate(v)
		}
		if v := str(row["启用日期"]); v != "" {
			archive["enabledAt"] = excelDate(v)
		}
		set("annualRevenue", "医院年收入（亿）")
		set("usageLocation", "使用位置")
		set("projectCount", "开展项目数")
		set("mindrayReagentCount", "迈瑞试剂项目数")
		set("matchingRate", "配套率")
		set("otherAnalyzers", "其它发光仪")
		set("mindraySampleVolume", "迈瑞标本量")
		set("totalSampleVolume", "总标本量")
		set("qcVendor", "质控品厂家")
		set("qcLevels", "质控水平数")
		set("qcCycle", "质控周期")
		set("reagentSupplier", "试剂供应商")
		if v := str(row["迈瑞开展项目"]); v != "" {
			archive["mindrayProjects"] = v
		}
		if v := str(row["主导新增项目"]); v != "" {
			archive["newProjects"] = v
		}
		set("unusedProjects", "未使用迈瑞项目及品牌及供应商")
		set("missingProjects", "迈瑞没有项目名称及品牌")
		set("archiveRemark", "备注")

		id, err := upsertHospital(ctx, hm, pool, name, province, city, level, typ, archive)
		if err != nil {
			fmt.Println("chem fail", name, err)
			stats["chem_err"]++
			continue
		}
		if modelName := str(row["机型"]); modelName != "" {
			_ = upsertDevice(ctx, pool, id, modelName, str(row["序列号"]), excelDate(str(row["安装日期"])))
		}
		stats["chem_ok"]++
	}

	// 2) SVIP — merge into same hospital by name/code
	for _, row := range dump["24年SVIP客户档案"] {
		name := str(row["医院名称（系统全称）"])
		if name == "" {
			continue
		}
		city := normalizeCity(str(row["分公司"]))
		province := provinceOfCity(city)
		level := mapLevel(str(row["医院级别"]))
		typ := inferType(name)

		archive := map[string]any{}
		set := func(k, col string) {
			if v := str(row[col]); v != "" {
				archive[k] = v
			}
		}
		set("region", "大区")
		set("branchOffice", "分公司")
		set("customerCode", "客户代码")
		archive["customerName"] = name
		set("customerLevel", "医院级别")
		set("groupName", "分组")
		set("svipLevel", "SVIP级别")
		set("dualMajorCustomer", "双大客户")
		set("volumeDirection", "上量方向")
		set("iotStock23", "23年化免凝IOT存量(W)")
		set("iotForecast24", "24年预估化免凝IOT产出(W)")
		set("iotIncrement24", "24年预估化免凝增量(W)")
		set("iotGrowthRate24", "24年预估化免凝增长率(W)")
		set("productLineSales", "产线销售")
		set("productLineSalesId", "产线销售工号")
		set("reagentSales", "试剂销售")
		set("reagentSalesId", "试剂销售工号")
		set("psName", "PS")
		set("psId", "PS工号")
		set("clinicalApp", "临床应用")
		set("clinicalAppId", "临床应用工号")
		set("serviceEngineer", "用服工程师")
		set("serviceEngineerId", "用服工程师工号")
		set("contactName", "负责人")
		set("contactPhone", "联系电话")
		set("usageLocation", "使用位置")
		set("equipment", "设备")
		set("mindrayReagentCount", "迈瑞试剂项目数")
		if v := str(row["迈瑞开展项目"]); v != "" {
			archive["mindrayProjects"] = v
		}
		set("mindraySampleVolume", "迈瑞标本量")
		if v := str(row["竞品仪器项目分布"]); v != "" {
			archive["competitorProjectDistribution"] = v
		}
		set("qcVendor", "质控品厂家")
		set("qcCycle", "质控周期")

		_, err := upsertHospital(ctx, hm, pool, name, province, city, level, typ, archive)
		if err != nil {
			fmt.Println("svip fail", name, err)
			stats["svip_err"]++
			continue
		}
		stats["svip_ok"]++
	}

	// 3) 双大
	for _, row := range dump["区域双大客户档案"] {
		name := str(row["客户名称"])
		if name == "" {
			continue
		}
		city := normalizeCity(str(row["分公司"]))
		province := provinceOfCity(city)
		level := mapLevel(str(row["医院级别"]))
		typ := inferType(name)

		archive := map[string]any{}
		set := func(k, col string) {
			if v := str(row[col]); v != "" {
				archive[k] = v
			}
		}
		set("branchOffice", "分公司")
		set("customerCode", "客户代码")
		archive["customerName"] = name
		set("customerLevel", "医院级别")
		set("dualMajorType", "双大类型")
		set("dualMajorTarget", "双大突破目标")
		set("hospitalReagentOutput", "医院试剂年产出（万元）——迈瑞出货金额")
		set("reagentOutputTarget", "试剂产出目标（万元）")
		set("salesOwner", "销售责任人")
		set("competitorDevicesProjects", "竞品设备+项目")
		set("mindrayDevicesProjectsVolume", "迈瑞设备+项目+样本量")
		set("supplyChannel", "供货渠道")
		set("labDirector", "检验科主任")
		set("workContact", "工作对接人")
		set("customerSegment", "客户细分")
		set("segmentCategory", "细分类别")
		set("annualRevenue", "医院年收入")

		_, err := upsertHospital(ctx, hm, pool, name, province, city, level, typ, archive)
		if err != nil {
			fmt.Println("dual fail", name, err)
			stats["dual_err"]++
			continue
		}
		stats["dual_ok"]++
	}

	fmt.Println("import stats:", stats)
}

func upsertHospital(ctx context.Context, hm model.HospitalModel, pool *pgxpool.Pool, name, province, city, level, typ string, archive map[string]any) (int64, error) {
	if city == "" {
		city = "未知"
	}
	if province == "" {
		province = "安徽省"
	}
	if level == "" {
		level = "二级甲等"
	}
	if typ == "" {
		typ = "综合医院"
	}
	existing, err := hm.FindByNameProvinceCity(ctx, name, province, city)
	if err != nil {
		return 0, err
	}
	// also try match by customerCode
	if existing == nil {
		if code, _ := archive["customerCode"].(string); code != "" {
			var id int64
			err := pool.QueryRow(ctx, `
				SELECT id FROM hospitals
				WHERE archive->>'customerCode' = $1
				LIMIT 1`, code).Scan(&id)
			if err == nil && id > 0 {
				existing, err = hm.FindById(ctx, id)
				if err != nil {
					return 0, err
				}
			}
		}
	}

	if existing == nil {
		h := &model.Hospital{
			Name: name, Province: province, City: city, Level: level, Type: typ,
			Status: "active", Archive: archive,
		}
		return hm.Insert(ctx, h)
	}

	merged := map[string]any{}
	for k, v := range existing.Archive {
		merged[k] = v
	}
	for k, v := range archive {
		// merge string arrays for mindrayProjects
		if k == "mindrayProjects" {
			a := model.ToStringSlice(merged[k])
			b := model.ToStringSlice(v)
			seen := map[string]struct{}{}
			out := make([]string, 0, len(a)+len(b))
			for _, x := range append(a, b...) {
				if _, ok := seen[x]; ok {
					continue
				}
				seen[x] = struct{}{}
				out = append(out, x)
			}
			merged[k] = out
			continue
		}
		merged[k] = v
	}
	existing.Archive = merged
	if level != "" && level != "二级甲等" {
		existing.Level = level
	}
	existing.Status = "active"
	if err := hm.Update(ctx, existing); err != nil {
		return 0, err
	}
	return existing.Id, nil
}

func upsertDevice(ctx context.Context, pool *pgxpool.Pool, hospitalID int64, modelName, serial, installed string) error {
	var n int
	err := pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM devices WHERE hospital_id=$1 AND model=$2 AND serial_no=$3`,
		hospitalID, modelName, serial).Scan(&n)
	if err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	var installedAt any
	if installed != "" {
		if t, err := time.Parse("2006-01-02", installed); err == nil {
			installedAt = t
		}
	}
	_, err = pool.Exec(ctx, `
		INSERT INTO devices (hospital_id, category, model, serial_no, status, installed_at)
		VALUES ($1,'immuno',$2,$3,'active',$4)`, hospitalID, modelName, serial, installedAt)
	return err
}

func str(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		s := strings.TrimSpace(t)
		if s == "" || s == "/" || s == "-" || s == "—" || s == "null" {
			return ""
		}
		return s
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		s := strings.TrimSpace(fmt.Sprint(v))
		if s == "" || s == "<nil>" {
			return ""
		}
		return s
	}
}

func excelDate(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if matched, _ := regexp.MatchString(`^\d{4}-\d{2}-\d{2}`, v); matched {
		return v[:10]
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return v
	}
	// Excel serial date
	if f < 20000 || f > 80000 {
		return v
	}
	t := time.Date(1899, 12, 30, 0, 0, 0, 0, time.UTC).Add(time.Duration(f*24) * time.Hour)
	return t.Format("2006-01-02")
}

func mapLevel(v string) string {
	v = strings.TrimSpace(v)
	m := map[string]string{
		"三甲": "三级甲等", "三级甲等": "三级甲等", "三甲医院": "三级甲等",
		"三乙": "三级乙等", "三级乙等": "三级乙等",
		"二甲": "二级甲等", "二级甲等": "二级甲等",
		"二乙": "二级乙等", "二级乙等": "二级乙等",
		"一级": "一级", "一甲": "一级",
		"三级": "三级甲等", "二级": "二级甲等",
	}
	if x, ok := m[v]; ok {
		return x
	}
	return ""
}

func inferType(name string) string {
	switch {
	case strings.Contains(name, "中医"):
		return "中医医院"
	case strings.Contains(name, "妇幼"):
		return "妇幼保健院"
	case strings.Contains(name, "肿瘤"), strings.Contains(name, "骨科"), strings.Contains(name, "口腔"):
		return "专科医院"
	default:
		return "综合医院"
	}
}

func normalizeCity(branch string) string {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return ""
	}
	if strings.HasSuffix(branch, "市") || strings.HasSuffix(branch, "地区") || strings.HasSuffix(branch, "州") {
		return branch
	}
	return branch + "市"
}

func provinceOfCity(city string) string {
	city = strings.TrimSpace(city)
	m := map[string]string{
		"合肥市": "安徽省", "芜湖市": "安徽省", "蚌埠市": "安徽省", "淮南市": "安徽省", "马鞍山市": "安徽省",
		"淮北市": "安徽省", "铜陵市": "安徽省", "安庆市": "安徽省", "黄山市": "安徽省", "滁州市": "安徽省",
		"阜阳市": "安徽省", "宿州市": "安徽省", "六安市": "安徽省", "亳州市": "安徽省", "池州市": "安徽省",
		"宣城市": "安徽省",
		"南京市": "江苏省", "苏州市": "江苏省", "无锡市": "江苏省",
		"杭州市": "浙江省", "宁波市": "浙江省",
		"上海市": "上海市",
		"广州市": "广东省", "深圳市": "广东省",
		"北京市": "北京市", "天津市": "天津市", "重庆市": "重庆市",
	}
	if p, ok := m[city]; ok {
		return p
	}
	return "安徽省"
}
