package logic

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/types"
)

type hospitalPublishPlan struct {
	Existing   *model.Hospital
	After      model.Hospital
	Attributes map[string]string
	Metrics    map[string]string
	DeviceRows []map[string]any
	Answers    map[string]any
}

func (l *SurveyLogic) PreviewApproveSubmission(id int64, req *types.ReviewSurveySubmissionRequest) (*types.ApproveSurveyPreviewResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	sub, a, err := l.loadPendingSubmission(id)
	if err != nil {
		return nil, err
	}

	// In-memory only: preview must not persist answers or write customer data.
	if req != nil && req.Answers != nil {
		answers, err := l.prepareAdminReviewAnswers(a, req.Answers)
		if err != nil {
			return nil, err
		}
		sub.Answers = answers
		if hid, err := l.resolveSubmissionHospitalID(a, req.HospitalId, answers); err != nil {
			return nil, err
		} else if hid != nil && *hid > 0 {
			sub.HospitalId = hid
		}
	}

	plan, err := l.buildHospitalPublishPlan(a, sub)
	if err != nil {
		return nil, err
	}

	targetID := int64(0)
	if plan.Existing != nil {
		targetID = plan.Existing.Id
	}
	if err := l.rejectHospitalNameConflict(targetID, plan.After.Name, plan.After.Province, plan.After.City); err != nil {
		return nil, err
	}
	if err := l.validatePublishPlan(plan); err != nil {
		return nil, err
	}

	loc := strings.TrimSpace(strings.Join([]string{plan.After.Province, plan.After.City}, " "))
	hospital := types.ApprovePreviewHospital{
		Name:     plan.After.Name,
		Province: plan.After.Province,
		City:     plan.After.City,
	}
	if plan.Existing != nil {
		hospital.Id = plan.Existing.Id
		if hospital.Name == "" {
			hospital.Name = plan.Existing.Name
		}
	}

	if plan.Existing == nil {
		msg := "通过后将新建客户「" + hospital.Name + "」"
		if loc != "" {
			msg += "（" + loc + "）"
		}
		msg += "。"
		return &types.ApproveSurveyPreviewResponse{
			Action:          "create",
			RequiresConfirm: false,
			Message:         msg,
			Hospital:        hospital,
			Changes:         []types.ApprovePreviewChange{},
		}, nil
	}

	changes, err := l.diffHospitalPublishPlan(plan)
	if err != nil {
		return nil, err
	}
	if changes == nil {
		changes = []types.ApprovePreviewChange{}
	}
	msg := "通过后将更新客户「" + hospital.Name + "」"
	if loc != "" {
		msg += "（" + loc + "）"
	}
	msg += "的已有资料。"
	requires := len(changes) > 0
	if requires {
		msg = "通过后将覆盖客户「" + hospital.Name + "」"
		if loc != "" {
			msg += "（" + loc + "）"
		}
		msg += "的已有资料，请核对变更后再确认。"
	}
	return &types.ApproveSurveyPreviewResponse{
		Action:          "update",
		RequiresConfirm: requires,
		Message:         msg,
		Hospital:        hospital,
		Changes:         changes,
	}, nil
}

func (l *SurveyLogic) buildHospitalPublishPlan(a *model.SurveyAssignment, sub *model.SurveySubmission) (*hospitalPublishPlan, error) {
	var schema struct {
		Fields []surveySchemaField `json:"fields"`
	}
	if len(a.Schema) > 0 {
		_ = json.Unmarshal(a.Schema, &schema)
	}

	answers := sub.Answers
	if answers == nil {
		answers = map[string]any{}
	}

	cols := map[string]string{}
	archive := map[string]any{}
	attributes := map[string]string{}
	metrics := map[string]string{}

	applyTarget := func(target, key, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		target = strings.TrimSpace(target)
		setArchive := func(k string, v string) {
			switch k {
			case "customerLevel", "customer_level", "usageLocation", "usage_location":
				return
			}
			archive[k] = model.NormalizeArchiveValue(k, v)
		}
		switch {
		case strings.HasPrefix(target, "eqa."):
			return
		case strings.HasPrefix(target, "assay."):
			return
		case strings.HasPrefix(target, "hospital.attributes."):
			attrKey := strings.TrimPrefix(target, "hospital.attributes.")
			if attrKey == "usage_location" || attrKey == "usageLocation" {
				return
			}
			attributes[attrKey] = value
		case strings.HasPrefix(target, "hospital.metrics."):
			metrics[strings.TrimPrefix(target, "hospital.metrics.")] = value
		case strings.HasPrefix(target, "hospital.archive."):
			setArchive(strings.TrimPrefix(target, "hospital.archive."), value)
		case strings.HasPrefix(target, "hospital."):
			cols[strings.TrimPrefix(target, "hospital.")] = value
		case target == "":
			switch key {
			case "name", "province", "city", "district", "level", "type", "address", "remark",
				"customerCode", "region", "branchOffice":
				cols[key] = value
			case "hospital_name", "hospitalName", "customerName", "customer_name":
				if cols["name"] == "" {
					cols["name"] = value
				}
			case "devices", "eqa_year", "eqa_scope", "customer_level":
			default:
				if attrKey, ok := model.KnownAttributeKeys[key]; ok {
					attributes[attrKey] = value
					return
				}
				if metricKey, ok := model.KnownMetricKeys[key]; ok {
					metrics[metricKey] = value
					return
				}
			}
		default:
			return
		}
	}

	if len(schema.Fields) > 0 {
		for _, f := range schema.Fields {
			if strings.EqualFold(f.Type, "repeat") || strings.EqualFold(f.Type, "eqa_block") || strings.EqualFold(f.Type, "assay_block") || strings.EqualFold(f.Type, "device_block") {
				continue
			}
			applyTarget(f.Target, f.Key, answerString(answers, f.Key))
		}
	} else {
		for k, v := range answers {
			if k == "devices" {
				continue
			}
			applyTarget("", k, anyToString(v))
		}
	}

	name := strings.TrimSpace(cols["name"])
	if name == "" {
		name = archiveString(archive, "customerName")
	}
	if name == "" {
		name = extractHospitalNameFromAnswers(a.Schema, answers)
	}
	province := strings.TrimSpace(cols["province"])
	city := strings.TrimSpace(cols["city"])
	branchHint := firstNonEmpty(cols["branchOffice"], cols["branch_office"], archiveString(archive, "branchOffice"))

	var existing *model.Hospital
	var err error
	createNewForRenamedBound := false
	if a.HospitalId != nil && *a.HospitalId > 0 {
		existing, err = l.svcCtx.HospitalModel.FindById(l.ctx, *a.HospitalId)
		if err == nil && existing != nil && name != "" && !hospitalNamesEqual(existing.Name, name) {
			existing = nil
			createNewForRenamedBound = true
		}
	} else if sub.HospitalId != nil && *sub.HospitalId > 0 {
		existing, err = l.svcCtx.HospitalModel.FindById(l.ctx, *sub.HospitalId)
		if err == nil && existing != nil && name != "" && !hospitalNamesEqual(existing.Name, name) {
			existing = nil
		}
	}
	if !createNewForRenamedBound {
		if err == nil && existing == nil && name != "" && province != "" && city != "" {
			existing, err = l.svcCtx.HospitalModel.FindByNameProvinceCity(l.ctx, name, province, city)
		}
		if err == nil && existing == nil && name != "" {
			byName, findErr := l.svcCtx.HospitalModel.FindByName(l.ctx, name)
			if findErr != nil {
				err = findErr
			} else if byName != nil && (province == "" || strings.EqualFold(strings.TrimSpace(byName.Province), province)) {
				existing = byName
			}
		}
	}
	if err != nil {
		l.Errorf("find hospital for publish: %v", err)
		return nil, ErrInternal
	}
	if existing == nil {
		if name == "" {
			return nil, NewCodeError(400, "答卷缺少医院名称，且未绑定医院，无法写入看板")
		}
		if province == "" {
			province = defaultDashboardProvince
		}
		if city == "" {
			city = cityFromBranchOrDefault(branchHint, province)
		}
	} else {
		if name == "" {
			name = existing.Name
		}
		if province == "" {
			province = existing.Province
		}
		if city == "" {
			city = existing.City
		}
	}

	level := strings.TrimSpace(cols["level"])
	typ := strings.TrimSpace(cols["type"])
	if !isAllowedHospitalLevel(level) {
		level = ""
	}
	if !isAllowedHospitalType(typ) {
		typ = ""
	}
	if level == "" {
		if existing != nil && isAllowedHospitalLevel(existing.Level) {
			level = existing.Level
		} else {
			level = "二级甲等"
		}
	}
	if typ == "" {
		if existing != nil && isAllowedHospitalType(existing.Type) {
			typ = existing.Type
		} else {
			typ = "综合医院"
		}
	}

	mergedArchive := map[string]any{}
	if existing != nil && existing.Archive != nil {
		for k, v := range existing.Archive {
			mergedArchive[k] = v
		}
	}
	for k, v := range archive {
		mergedArchive[k] = v
	}

	deviceRows := extractAllDeviceRows(answers)
	otherAnalyzers := []string{}
	if s := archiveString(mergedArchive, "otherAnalyzers"); s != "" {
		otherAnalyzers = append(otherAnalyzers, s)
	}
	for _, drow := range deviceRows {
		if oa := anyToString(drow["otherAnalyzers"]); oa != "" {
			otherAnalyzers = append(otherAnalyzers, oa)
		}
	}
	if len(otherAnalyzers) > 0 {
		mergedArchive["otherAnalyzers"] = strings.Join(uniquePreserve(otherAnalyzers), "；")
	}
	mergedArchive = model.NormalizeArchive(mergedArchive)
	delete(mergedArchive, "customerLevel")
	delete(mergedArchive, "customer_level")
	delete(mergedArchive, "usageLocation")
	delete(mergedArchive, "usage_location")
	delete(mergedArchive, "mindrayProjects")
	delete(mergedArchive, "newProjects")
	delete(mergedArchive, "missingProjects")

	district := strings.TrimSpace(cols["district"])
	address := strings.TrimSpace(cols["address"])
	remark := strings.TrimSpace(cols["remark"])
	if remark == "" {
		remark = archiveString(mergedArchive, "archiveRemark")
	}
	customerCode := firstNonEmpty(cols["customerCode"], cols["customer_code"], archiveString(mergedArchive, "customerCode"))
	region := resolveRegionFromProvince(province, firstNonEmpty(cols["region"], archiveString(mergedArchive, "region")))
	if region != "" {
		mergedArchive["region"] = region
	}
	branchOffice := firstNonEmpty(cols["branchOffice"], cols["branch_office"], archiveString(mergedArchive, "branchOffice"))

	after := model.Hospital{
		Name: name, Province: province, City: city,
		District: district, Level: level, Type: typ, Status: "active",
		Address: address, Remark: remark, CustomerCode: customerCode,
		Region: region, BranchOffice: branchOffice, Archive: mergedArchive,
	}
	if existing != nil {
		after.Id = existing.Id
		if after.District == "" {
			after.District = existing.District
		}
		if after.Level == "" {
			after.Level = existing.Level
		}
		if after.Type == "" {
			after.Type = existing.Type
		}
		if after.Address == "" {
			after.Address = existing.Address
		}
		if after.Remark == "" {
			after.Remark = existing.Remark
		}
		if after.CustomerCode == "" {
			after.CustomerCode = existing.CustomerCode
		}
		if after.Region == "" {
			after.Region = existing.Region
		}
		if after.BranchOffice == "" {
			after.BranchOffice = existing.BranchOffice
		}
		if existing.Status != "" && after.Status == "" {
			after.Status = existing.Status
		}
	}

	return &hospitalPublishPlan{
		Existing:   existing,
		After:      after,
		Attributes: attributes,
		Metrics:    metrics,
		DeviceRows: deviceRows,
		Answers:    answers,
	}, nil
}

func (l *SurveyLogic) validatePublishPlan(plan *hospitalPublishPlan) error {
	if plan == nil {
		return nil
	}
	if stage, ok := plan.Attributes["customer_stage"]; ok && !model.IsAllowedEnum(stage, model.CustomerStageEnum) {
		return NewCodeError(400, "客户所在阶段不在可选范围内："+stage)
	}
	for _, row := range plan.DeviceRows {
		if _, err := parsePublishDeviceRow(row); err != nil {
			return err
		}
	}
	if _, _, err := l.planEqaWriteback(plan.Answers); err != nil {
		return err
	}
	return nil
}

func (l *SurveyLogic) diffHospitalPublishPlan(plan *hospitalPublishPlan) ([]types.ApprovePreviewChange, error) {
	existing := plan.Existing
	changes := []types.ApprovePreviewChange{}

	add := func(group, label, before, after string) {
		if previewValuesEqual(before, after) {
			return
		}
		changes = append(changes, types.ApprovePreviewChange{
			Group:  group,
			Label:  label,
			Before: previewDisplay(before),
			After:  previewDisplay(after),
		})
	}

	add("基础信息", "客户名称", existing.Name, plan.After.Name)
	add("基础信息", "省份", existing.Province, plan.After.Province)
	add("基础信息", "城市", existing.City, plan.After.City)
	add("基础信息", "区县", existing.District, plan.After.District)
	add("基础信息", "医院等级", existing.Level, plan.After.Level)
	add("基础信息", "医院类型", existing.Type, plan.After.Type)
	add("基础信息", "状态", existing.Status, plan.After.Status)
	add("基础信息", "地址", existing.Address, plan.After.Address)
	add("基础信息", "备注", existing.Remark, plan.After.Remark)
	add("基础信息", "客户编码", existing.CustomerCode, plan.After.CustomerCode)
	add("基础信息", "区域", existing.Region, plan.After.Region)
	add("基础信息", "分公司", existing.BranchOffice, plan.After.BranchOffice)

	beforeArchive := existing.Archive
	if beforeArchive == nil {
		beforeArchive = map[string]any{}
	}
	afterArchive := plan.After.Archive
	if afterArchive == nil {
		afterArchive = map[string]any{}
	}
	archiveKeys := map[string]struct{}{}
	for k := range beforeArchive {
		if !skipArchiveDiffKey(k) {
			archiveKeys[k] = struct{}{}
		}
	}
	for k := range afterArchive {
		if !skipArchiveDiffKey(k) {
			archiveKeys[k] = struct{}{}
		}
	}
	for _, k := range sortedKeys(archiveKeys) {
		add("档案信息", archiveFieldLabel(k), archiveString(beforeArchive, k), archiveString(afterArchive, k))
	}

	beforeAttrs, err := l.svcCtx.MasterDataModel.ListAttributes(l.ctx, existing.Id)
	if err != nil {
		l.Errorf("preview list attributes: %v", err)
		return nil, ErrInternal
	}
	if beforeAttrs == nil {
		beforeAttrs = map[string]string{}
	}
	for _, k := range sortedStringKeys(plan.Attributes) {
		val := strings.TrimSpace(plan.Attributes[k])
		if val == "" {
			continue
		}
		add("客户属性", attributeFieldLabel(k), beforeAttrs[k], val)
	}

	year := model.CurrentMetricYear()
	beforeMetrics, err := l.svcCtx.MasterDataModel.ListMetrics(l.ctx, existing.Id, year)
	if err != nil {
		l.Errorf("preview list metrics: %v", err)
		return nil, ErrInternal
	}
	if beforeMetrics == nil {
		beforeMetrics = map[string]string{}
	}
	for _, k := range sortedStringKeys(plan.Metrics) {
		val := strings.TrimSpace(plan.Metrics[k])
		if val == "" {
			continue
		}
		add("年度指标", fmt.Sprintf("%d年 / %s", year, metricFieldLabel(k)), beforeMetrics[k], val)
	}

	deviceChanges, err := l.diffPlannedDevices(existing.Id, plan.DeviceRows)
	if err != nil {
		return nil, err
	}
	changes = append(changes, deviceChanges...)

	assayChanges, err := l.diffPlannedAssays(existing.Id, plan.Answers)
	if err != nil {
		return nil, err
	}
	changes = append(changes, assayChanges...)

	eqaChanges, err := l.diffPlannedEqa(existing.Id, plan.Answers)
	if err != nil {
		return nil, err
	}
	changes = append(changes, eqaChanges...)

	return changes, nil
}

type plannedPublishDevice struct {
	Skip                bool
	Model               string
	SerialNo            string
	Brand               string
	Category            string
	AssayLineCode       string
	ItemCodes           []string
	ServiceEvaluation   string
	UsageLocation       string
	ReagentBrand        string
	MonthlySampleVolume string
	DeptHead            string
	ChannelCsa          string
	Remark              string
	InstalledAt         *time.Time
	EnabledAt           *time.Time
	Status              string
}

func parsePublishDeviceRow(row map[string]any) (*plannedPublishDevice, error) {
	modelName := anyToString(row["model"])
	serial := anyToString(row["serialNo"])
	if modelName == "" && serial == "" && anyToString(row["assayLineCode"]) == "" {
		return &plannedPublishDevice{Skip: true}, nil
	}
	if modelName == "" {
		modelName = "未知机型"
	}
	brand := firstNonEmpty(anyToString(row["brand"]), anyToString(row["company"]), "迈瑞")
	line := strings.TrimSpace(anyToString(row["assayLineCode"]))
	if line == "" {
		line = strings.TrimSpace(anyToString(row["lineCode"]))
	}
	cat := strings.TrimSpace(anyToString(row["category"]))
	if cat == "" {
		cat = model.CategoryFromAssayLine(line)
	}
	if cat == "" {
		cat = "immuno"
	}
	itemCodes := anyToStringSlice(row["itemCodes"])
	if len(itemCodes) == 0 {
		itemCodes = anyToStringSlice(row["codes"])
	}
	serviceEval := firstNonEmpty(
		anyToString(row["serviceEvaluation"]),
		anyToString(row["service_evaluation"]),
		anyToString(row["客户服务评价"]),
	)
	if !model.IsAllowedEnum(serviceEval, model.DeviceServiceEvaluationEnum) {
		return nil, NewCodeError(400, "设备「客户服务评价」不在可选范围内："+serviceEval)
	}
	usageLoc := firstNonEmpty(anyToString(row["usageLocation"]), anyToString(row["usage_location"]))
	reagentBrand := firstNonEmpty(anyToString(row["reagentBrand"]), anyToString(row["reagent_brand"]), anyToString(row["试剂品牌"]))
	monthlyVol := firstNonEmpty(anyToString(row["monthlySampleVolume"]), anyToString(row["monthly_sample_volume"]), anyToString(row["月样本量"]))
	deptHead := firstNonEmpty(anyToString(row["deptHead"]), anyToString(row["dept_head"]), anyToString(row["科室负责人"]))
	channelCsa := firstNonEmpty(anyToString(row["channelCsa"]), anyToString(row["channel_csa"]), anyToString(row["渠道CSA"]))
	remarkParts := []string{}
	if vol := anyToString(row["mindraySampleVolume"]); vol != "" {
		remarkParts = append(remarkParts, "迈瑞标本量:"+vol)
	}
	if oa := anyToString(row["otherAnalyzers"]); oa != "" {
		remarkParts = append(remarkParts, "其它发光仪:"+oa)
	}
	if r := anyToString(row["remark"]); r != "" {
		remarkParts = append(remarkParts, r)
	}
	var installedAt *time.Time
	if raw := anyToString(row["installedAt"]); raw != "" {
		if t, err := parseFlexibleDate(raw); err == nil {
			installedAt = &t
		}
	}
	var enabledAt *time.Time
	if raw := firstNonEmpty(anyToString(row["enabledAt"]), anyToString(row["enabled_at"])); raw != "" {
		if t, err := parseFlexibleDate(raw); err == nil {
			enabledAt = &t
		}
	}
	return &plannedPublishDevice{
		Model: modelName, SerialNo: serial, Brand: brand, Category: cat,
		AssayLineCode: line, ItemCodes: itemCodes, ServiceEvaluation: serviceEval,
		UsageLocation: usageLoc, ReagentBrand: reagentBrand, MonthlySampleVolume: monthlyVol,
		DeptHead: deptHead, ChannelCsa: channelCsa, Remark: strings.Join(remarkParts, "；"),
		InstalledAt: installedAt, EnabledAt: enabledAt, Status: "active",
	}, nil
}

func (l *SurveyLogic) diffPlannedDevices(hospitalID int64, rows []map[string]any) ([]types.ApprovePreviewChange, error) {
	changes := []types.ApprovePreviewChange{}
	add := func(label, before, after string) {
		if previewValuesEqual(before, after) {
			return
		}
		changes = append(changes, types.ApprovePreviewChange{
			Group:  "设备",
			Label:  label,
			Before: previewDisplay(before),
			After:  previewDisplay(after),
		})
	}
	for _, row := range rows {
		planned, err := parsePublishDeviceRow(row)
		if err != nil {
			return nil, err
		}
		if planned == nil || planned.Skip {
			continue
		}
		who := strings.TrimSpace(planned.SerialNo)
		if who == "" {
			who = planned.Model
		}
		prefix := "设备「" + who + "」 / "
		var existing *model.Device
		if hospitalID > 0 && strings.TrimSpace(planned.SerialNo) != "" {
			existing, err = l.svcCtx.DeviceModel.FindByHospitalSerial(l.ctx, hospitalID, planned.SerialNo)
			if err != nil {
				l.Errorf("preview find device: %v", err)
				return nil, ErrInternal
			}
		}
		if existing == nil {
			add(prefix+"记录", "", "新增")
			add(prefix+"品牌", "", planned.Brand)
			add(prefix+"型号", "", planned.Model)
			add(prefix+"序列号", "", planned.SerialNo)
			add(prefix+"类别", "", planned.Category)
			add(prefix+"产品线", "", planned.AssayLineCode)
			add(prefix+"客户服务评价", "", planned.ServiceEvaluation)
			add(prefix+"使用位置", "", planned.UsageLocation)
			add(prefix+"试剂品牌", "", planned.ReagentBrand)
			add(prefix+"月样本量", "", planned.MonthlySampleVolume)
			add(prefix+"科室负责人", "", planned.DeptHead)
			add(prefix+"渠道CSA", "", planned.ChannelCsa)
			add(prefix+"启用日期", "", formatSnapDate(planned.EnabledAt))
			add(prefix+"装机日期", "", formatSnapDate(planned.InstalledAt))
			add(prefix+"备注", "", planned.Remark)
			add(prefix+"检测项目", "", joinCodes(planned.ItemCodes))
			continue
		}
		afterLine := existing.AssayLineCode
		if planned.AssayLineCode != "" {
			afterLine = planned.AssayLineCode
		}
		afterEval := existing.ServiceEvaluation
		if planned.ServiceEvaluation != "" {
			afterEval = planned.ServiceEvaluation
		}
		afterInstalled := existing.InstalledAt
		if planned.InstalledAt != nil {
			afterInstalled = planned.InstalledAt
		}
		afterEnabled := existing.EnabledAt
		if planned.EnabledAt != nil {
			afterEnabled = planned.EnabledAt
		}
		afterUsage := existing.UsageLocation
		if planned.UsageLocation != "" {
			afterUsage = planned.UsageLocation
		}
		afterReagent := existing.ReagentBrand
		if planned.ReagentBrand != "" {
			afterReagent = planned.ReagentBrand
		}
		afterVol := existing.MonthlySampleVolume
		if planned.MonthlySampleVolume != "" {
			afterVol = planned.MonthlySampleVolume
		}
		afterDept := existing.DeptHead
		if planned.DeptHead != "" {
			afterDept = planned.DeptHead
		}
		afterCsa := existing.ChannelCsa
		if planned.ChannelCsa != "" {
			afterCsa = planned.ChannelCsa
		}
		afterRemark := existing.Remark
		if planned.Remark != "" {
			afterRemark = planned.Remark
		}
		add(prefix+"品牌", existing.Brand, planned.Brand)
		add(prefix+"型号", existing.Model, planned.Model)
		add(prefix+"序列号", existing.SerialNo, planned.SerialNo)
		add(prefix+"类别", existing.Category, planned.Category)
		add(prefix+"产品线", existing.AssayLineCode, afterLine)
		add(prefix+"状态", existing.Status, "active")
		add(prefix+"客户服务评价", existing.ServiceEvaluation, afterEval)
		add(prefix+"使用位置", existing.UsageLocation, afterUsage)
		add(prefix+"试剂品牌", existing.ReagentBrand, afterReagent)
		add(prefix+"月样本量", existing.MonthlySampleVolume, afterVol)
		add(prefix+"科室负责人", existing.DeptHead, afterDept)
		add(prefix+"渠道CSA", existing.ChannelCsa, afterCsa)
		add(prefix+"启用日期", formatSnapDate(existing.EnabledAt), formatSnapDate(afterEnabled))
		add(prefix+"装机日期", formatSnapDate(existing.InstalledAt), formatSnapDate(afterInstalled))
		add(prefix+"备注", existing.Remark, afterRemark)
		add(prefix+"检测项目", joinCodes(existing.ItemCodes), joinCodes(planned.ItemCodes))
	}
	return changes, nil
}

func (l *SurveyLogic) diffPlannedAssays(hospitalID int64, answers map[string]any) ([]types.ApprovePreviewChange, error) {
	codes, ok := extractAssayBlockCodes(answers)
	if !ok {
		return nil, nil
	}
	beforeCodes, err := l.svcCtx.MasterDataModel.ListHospitalOwnAssayCodes(l.ctx, hospitalID)
	if err != nil {
		l.Errorf("preview list assays: %v", err)
		return nil, ErrInternal
	}
	beforeLabel, err := l.formatAssayCodes(beforeCodes)
	if err != nil {
		return nil, err
	}
	afterLabel, err := l.formatAssayCodes(codes)
	if err != nil {
		return nil, err
	}
	if previewValuesEqual(joinCodes(beforeCodes), joinCodes(codes)) {
		return nil, nil
	}
	return []types.ApprovePreviewChange{{
		Group:  "检测项目",
		Label:  "医院自有检测项目",
		Before: previewDisplay(beforeLabel),
		After:  previewDisplay(afterLabel),
	}}, nil
}

func (l *SurveyLogic) formatAssayCodes(codes []string) (string, error) {
	names := make([]string, 0, len(codes))
	seen := map[string]struct{}{}
	for _, c := range codes {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		label := c
		p, err := l.svcCtx.MasterDataModel.GetAssayProjectByCode(l.ctx, c)
		if err != nil {
			l.Errorf("preview assay code: %v", err)
			return "", ErrInternal
		}
		if p != nil && strings.TrimSpace(p.Name) != "" {
			label = p.Name
		}
		names = append(names, label)
	}
	return strings.Join(names, "、"), nil
}

func (l *SurveyLogic) planEqaWriteback(answers map[string]any) (EqaHospitalUpsert, bool, error) {
	if answers == nil {
		return EqaHospitalUpsert{}, false, nil
	}
	if payload, ok := extractEqaBlockUpsert(answers); ok {
		if payload.Year <= 0 {
			payload.Year = time.Now().Year()
		}
		if err := l.validateEqaUpsertCodes(payload); err != nil {
			return EqaHospitalUpsert{}, false, err
		}
		return payload, true, nil
	}
	payload, ok, err := l.planLegacyEqaWriteback(answers)
	if err != nil || !ok {
		return payload, ok, err
	}
	if err := l.validateEqaUpsertCodes(payload); err != nil {
		return EqaHospitalUpsert{}, false, err
	}
	return payload, true, nil
}

func (l *SurveyLogic) planLegacyEqaWriteback(answers map[string]any) (EqaHospitalUpsert, bool, error) {
	year := int(anyToInt64(answers["eqa_year"]))
	if year <= 0 {
		year = time.Now().Year()
	}
	fields, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		l.Errorf("preview list eqa fields: %v", err)
		return EqaHospitalUpsert{}, false, ErrInternal
	}
	natCodes := make([]string, 0)
	provCodes := make([]string, 0)
	for _, f := range fields {
		if f.ValueType != "boolean" {
			continue
		}
		v, ok := answers[f.Code]
		if !ok || !truthy(v) {
			continue
		}
		if f.ParentCode != nil {
			switch *f.ParentCode {
			case "scope.national":
				natCodes = append(natCodes, f.Code)
			case "scope.provincial":
				provCodes = append(provCodes, f.Code)
			}
		} else if strings.HasPrefix(f.Code, "national.") {
			natCodes = append(natCodes, f.Code)
		} else if strings.HasPrefix(f.Code, "provincial.") {
			provCodes = append(provCodes, f.Code)
		}
	}
	scopeHint := strings.TrimSpace(anyToString(answers["eqa_scope"]))
	hasNat := len(natCodes) > 0 || scopeHint == "national"
	hasProv := len(provCodes) > 0 || scopeHint == "provincial"
	if !hasNat && !hasProv {
		return EqaHospitalUpsert{}, false, nil
	}
	payload := EqaHospitalUpsert{Year: year}
	if len(natCodes) > 0 || scopeHint == "national" {
		payload.National = &EqaScopeUpsert{Participating: len(natCodes) > 0, Codes: natCodes}
	}
	if len(provCodes) > 0 || scopeHint == "provincial" {
		payload.Provincial = &EqaScopeUpsert{Participating: len(provCodes) > 0, Codes: provCodes}
	}
	if len(natCodes) > 0 {
		payload.National = &EqaScopeUpsert{Participating: true, Codes: natCodes}
	}
	if len(provCodes) > 0 {
		payload.Provincial = &EqaScopeUpsert{Participating: true, Codes: provCodes}
	}
	if payload.National == nil && payload.Provincial == nil {
		return EqaHospitalUpsert{}, false, nil
	}
	return payload, true, nil
}

func (l *SurveyLogic) validateEqaUpsertCodes(payload EqaHospitalUpsert) error {
	fields, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		l.Errorf("preview eqa fields: %v", err)
		return ErrInternal
	}
	allowed := map[string]map[string]struct{}{"national": {}, "provincial": {}}
	for _, f := range fields {
		if f.ValueType != "boolean" || f.ParentCode == nil {
			continue
		}
		switch *f.ParentCode {
		case "scope.national":
			allowed["national"][f.Code] = struct{}{}
		case "scope.provincial":
			allowed["provincial"][f.Code] = struct{}{}
		}
	}
	check := func(scope string, part *EqaScopeUpsert) error {
		if part == nil || !part.Participating {
			return nil
		}
		allow := allowed[scope]
		for _, c := range part.Codes {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			if _, ok := allow[c]; !ok {
				return NewCodeError(400, "无效 EQA 科目："+c)
			}
		}
		return nil
	}
	if err := check("national", payload.National); err != nil {
		return err
	}
	return check("provincial", payload.Provincial)
}

func (l *SurveyLogic) diffPlannedEqa(hospitalID int64, answers map[string]any) ([]types.ApprovePreviewChange, error) {
	payload, ok, err := l.planEqaWriteback(answers)
	if err != nil || !ok {
		return nil, err
	}
	year := payload.Year
	if year <= 0 {
		year = time.Now().Year()
	}
	fields, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		l.Errorf("preview eqa field names: %v", err)
		return nil, ErrInternal
	}
	nameOf := map[string]string{}
	for _, f := range fields {
		if strings.TrimSpace(f.Name) != "" {
			nameOf[f.Code] = f.Name
		} else {
			nameOf[f.Code] = f.Code
		}
	}
	formatCodes := func(codes []string) string {
		out := make([]string, 0, len(codes))
		seen := map[string]struct{}{}
		for _, c := range codes {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			if _, ok := seen[c]; ok {
				continue
			}
			seen[c] = struct{}{}
			if n := nameOf[c]; n != "" {
				out = append(out, n)
			} else {
				out = append(out, c)
			}
		}
		return strings.Join(out, "、")
	}
	currentLabel := func(scope string) (string, error) {
		p, err := l.svcCtx.EqaModel.FindParticipationByKey(l.ctx, hospitalID, year, scope)
		if err != nil {
			return "", err
		}
		if p == nil {
			return "（未参加）", nil
		}
		items, err := l.svcCtx.EqaModel.ListItems(l.ctx, p.Id)
		if err != nil {
			return "", err
		}
		codes := []string{}
		for _, it := range items {
			if it.Value {
				codes = append(codes, it.FieldCode)
			}
		}
		if len(codes) == 0 {
			return "（未参加）", nil
		}
		return formatCodes(codes), nil
	}
	plannedLabel := func(part *EqaScopeUpsert) string {
		if part == nil {
			return ""
		}
		if !part.Participating || len(part.Codes) == 0 {
			return "（未参加）"
		}
		return formatCodes(part.Codes)
	}

	changes := []types.ApprovePreviewChange{}
	addScope := func(scope, title string, part *EqaScopeUpsert) error {
		if part == nil {
			return nil
		}
		before, err := currentLabel(scope)
		if err != nil {
			l.Errorf("preview eqa current: %v", err)
			return ErrInternal
		}
		after := plannedLabel(part)
		if previewValuesEqual(before, after) {
			return nil
		}
		changes = append(changes, types.ApprovePreviewChange{
			Group:  "EQA",
			Label:  fmt.Sprintf("%d年 %s", year, title),
			Before: previewDisplay(before),
			After:  previewDisplay(after),
		})
		return nil
	}
	if err := addScope("national", "室间质评（国家）", payload.National); err != nil {
		return nil, err
	}
	if err := addScope("provincial", "室间质评（省）", payload.Provincial); err != nil {
		return nil, err
	}
	return changes, nil
}

func previewDisplay(v string) string {
	if strings.TrimSpace(v) == "" {
		return "（空）"
	}
	return strings.TrimSpace(v)
}

func previewValuesEqual(a, b string) bool {
	return strings.TrimSpace(a) == strings.TrimSpace(b)
}

func joinCodes(codes []string) string {
	out := make([]string, 0, len(codes))
	seen := map[string]struct{}{}
	for _, c := range codes {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		out = append(out, c)
	}
	sort.Strings(out)
	return strings.Join(out, "、")
}

func skipArchiveDiffKey(k string) bool {
	switch strings.TrimSpace(k) {
	case "customerLevel", "customer_level", "usageLocation", "usage_location",
		"mindrayProjects", "newProjects", "missingProjects":
		return true
	}
	return false
}

func archiveFieldLabel(key string) string {
	switch key {
	case "customerName":
		return "客户名称"
	case "customerCode", "customer_code":
		return "客户编码"
	case "region":
		return "区域"
	case "branchOffice", "branch_office":
		return "分公司"
	case "otherAnalyzers":
		return "其它发光仪"
	case "reagentSupplier":
		return "试剂供应商"
	case "supplyChannel":
		return "供货渠道"
	case "archiveRemark":
		return "档案备注"
	default:
		if label := attributeFieldLabel(key); label != key {
			return label
		}
		return key
	}
}

func attributeFieldLabel(key string) string {
	switch key {
	case "customer_level", "customerLevel":
		return "客户等级"
	case "customer_stage", "customerStage":
		return "客户所在阶段"
	case "pending_issues", "pendingIssues":
		return "客户端待解决问题及需求"
	case "collector_name", "collectorName":
		return "采集者姓名"
	case "svip_level", "svipLevel":
		return "SVIP 等级"
	case "dual_major", "dualMajorCustomer":
		return "双科客户"
	case "sales_group", "groupName":
		return "销售小组"
	case "volume_direction", "volumeDirection":
		return "量级方向"
	case "dual_major_type", "dualMajorType":
		return "双科类型"
	case "dual_major_target", "dualMajorTarget":
		return "双科目标"
	case "customer_segment", "customerSegment":
		return "客户分群"
	case "segment_category", "segmentCategory":
		return "分群类别"
	default:
		return key
	}
}

func metricFieldLabel(key string) string {
	switch key {
	case "sample_volume_own":
		return "迈瑞标本量"
	case "sample_volume_total":
		return "总标本量"
	case "matching_rate":
		return "配套率"
	case "qc_vendor":
		return "质控厂家"
	case "qc_levels":
		return "质控水平"
	case "qc_cycle":
		return "质控周期"
	case "hospital_annual_revenue":
		return "医院年收入"
	case "iot_stock":
		return "物联网保有量"
	case "iot_forecast":
		return "物联网预测"
	case "iot_increment":
		return "物联网增量"
	case "iot_growth_rate":
		return "物联网增长率"
	case "reagent_revenue":
		return "试剂产出"
	case "reagent_revenue_target":
		return "试剂产出目标"
	default:
		return key
	}
}

func sortedKeys(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func sortedStringKeys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
