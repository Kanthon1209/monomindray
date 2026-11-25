package logic

import (
	"strings"

	"mindray/internal/model"
	"mindray/internal/types"

	"mindray/internal/authx"
)

// HospitalPrefill returns schema-filtered survey answers for an existing hospital.
// Collectors may only call it for their own assignment; admins may call it for any assignment.
// Bound (non-admin) tasks are locked to the assignment hospital and cannot retarget.
func (l *SurveyLogic) HospitalPrefill(req *types.SurveyHospitalPrefillRequest) (*types.SurveyHospitalPrefillResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	a, err := l.svcCtx.SurveyModel.FindAssignmentById(l.ctx, req.Id)
	if err != nil {
		return nil, ErrInternal
	}
	if a == nil {
		return nil, NewCodeError(404, "任务不存在")
	}
	role := authx.RoleFromCtx(l.ctx)
	if a.AssigneeId != uid && role != "admin" {
		return nil, ErrForbidden
	}

	hid, matches, ambiguous, err := l.resolvePrefillHospital(a, req, role)
	if err != nil {
		return nil, err
	}
	if ambiguous {
		return &types.SurveyHospitalPrefillResponse{
			Matched:   false,
			Ambiguous: true,
			Matches:   matches,
		}, nil
	}
	if hid <= 0 {
		return &types.SurveyHospitalPrefillResponse{Matched: false}, nil
	}

	h, err := l.svcCtx.HospitalModel.FindById(l.ctx, hid)
	if err != nil {
		l.Errorf("hospital prefill load hospital: %v", err)
		return nil, ErrInternal
	}
	if h == nil {
		return nil, NewCodeError(404, "医院不存在")
	}

	answers, err := l.schemaAnswersFromHospital(a.Schema, h)
	if err != nil {
		l.Errorf("hospital prefill map answers: %v", err)
		return nil, ErrInternal
	}
	if err := l.attachPrefillSpecialBlocks(a.Schema, answers, hid); err != nil {
		l.Errorf("hospital prefill blocks: %v", err)
		return nil, ErrInternal
	}
	return &types.SurveyHospitalPrefillResponse{
		Matched:    true,
		HospitalId: hid,
		Answers:    answers,
	}, nil
}

func (l *SurveyLogic) resolvePrefillHospital(a *model.SurveyAssignment, req *types.SurveyHospitalPrefillRequest, role string) (int64, []types.HospitalSearchOption, bool, error) {
	var boundID int64
	if a.HospitalId != nil && *a.HospitalId > 0 {
		boundID = *a.HospitalId
	}
	if boundID > 0 && role != "admin" {
		return boundID, nil, false, nil
	}

	if req.HospitalId > 0 {
		return req.HospitalId, nil, false, nil
	}

	name := strings.TrimSpace(req.Name)
	province := strings.TrimSpace(req.Province)
	city := strings.TrimSpace(req.City)
	if name == "" {
		if boundID > 0 {
			return boundID, nil, false, nil
		}
		return 0, nil, false, nil
	}

	if province != "" && city != "" {
		h, err := l.svcCtx.HospitalModel.FindByNameProvinceCity(l.ctx, name, province, city)
		if err != nil {
			l.Errorf("hospital prefill name+city: %v", err)
			return 0, nil, false, ErrInternal
		}
		if h != nil {
			return h.Id, nil, false, nil
		}
	}

	items, err := l.svcCtx.HospitalModel.ListByExactName(l.ctx, name)
	if err != nil {
		l.Errorf("hospital prefill exact name: %v", err)
		return 0, nil, false, ErrInternal
	}
	if province != "" || city != "" {
		filtered := make([]model.Hospital, 0, len(items))
		for i := range items {
			if province != "" && strings.TrimSpace(items[i].Province) != province {
				continue
			}
			if city != "" && strings.TrimSpace(items[i].City) != city {
				continue
			}
			filtered = append(filtered, items[i])
		}
		items = filtered
	}
	if len(items) == 0 {
		return 0, nil, false, nil
	}
	if len(items) == 1 {
		return items[0].Id, nil, false, nil
	}
	return 0, hospitalsToSearchOptions(items), true, nil
}

func hospitalsToSearchOptions(items []model.Hospital) []types.HospitalSearchOption {
	out := make([]types.HospitalSearchOption, 0, len(items))
	for i := range items {
		h := &items[i]
		out = append(out, types.HospitalSearchOption{
			Id: h.Id, Name: h.Name, Province: h.Province, City: h.City,
			District: h.District, Level: h.Level, Type: h.Type,
		})
	}
	return out
}

func deviceToSurveyAnswerRow(d model.Device) map[string]any {
	codes := d.ItemCodes
	if codes == nil {
		codes = []string{}
	}
	row := map[string]any{
		"brand":               d.Brand,
		"model":               d.Model,
		"serialNo":            d.SerialNo,
		"installedAt":         formatDate(d.InstalledAt),
		"enabledAt":           formatDate(d.EnabledAt),
		"usageLocation":       d.UsageLocation,
		"assayLineCode":       d.AssayLineCode,
		"itemCodes":           codes,
		"serviceEvaluation":   d.ServiceEvaluation,
		"reagentBrand":        d.ReagentBrand,
		"monthlySampleVolume": d.MonthlySampleVolume,
		"deptHead":            d.DeptHead,
		"channelCsa":          d.ChannelCsa,
		"remark":              d.Remark,
	}
	if strings.TrimSpace(d.Category) != "" {
		row["category"] = d.Category
	}
	return row
}

func (l *SurveyLogic) attachPrefillSpecialBlocks(schemaJSON []byte, answers map[string]any, hospitalID int64) error {
	fields := parseSchemaFields(schemaJSON)
	hasDevicesRepeat := schemaHasDevicesRepeat(schemaJSON)
	deviceBlockKeys := schemaKeysByType(fields, "device_block")
	eqaBlockKeys := schemaKeysByType(fields, "eqa_block")
	assayBlockKeys := schemaKeysByType(fields, "assay_block")

	if hasDevicesRepeat || len(deviceBlockKeys) > 0 {
		devices, err := l.svcCtx.DeviceModel.ListByHospital(l.ctx, hospitalID)
		if err != nil {
			return err
		}
		rows := make([]any, 0, len(devices))
		for _, d := range devices {
			rows = append(rows, deviceToSurveyAnswerRow(d))
		}
		if hasDevicesRepeat {
			answers["devices"] = rows
		}
		for _, key := range deviceBlockKeys {
			answers[key] = map[string]any{"devices": rows}
		}
	}

	if len(eqaBlockKeys) > 0 {
		block, ok, err := l.eqaBlockForHospital(hospitalID)
		if err != nil {
			return err
		}
		if ok {
			for _, key := range eqaBlockKeys {
				answers[key] = block
			}
		}
	}

	if len(assayBlockKeys) > 0 {
		codes, err := l.svcCtx.MasterDataModel.ListHospitalAssayCodes(l.ctx, hospitalID)
		if err != nil {
			return err
		}
		if codes == nil {
			codes = []string{}
		}
		if len(codes) > 0 {
			for _, key := range assayBlockKeys {
				answers[key] = map[string]any{"codes": codes}
			}
		}
	}
	return nil
}

func schemaKeysByType(fields []schemaFieldMeta, typ string) []string {
	out := []string{}
	for _, f := range fields {
		if strings.EqualFold(strings.TrimSpace(f.Type), typ) {
			if k := strings.TrimSpace(f.Key); k != "" {
				out = append(out, k)
			}
		}
	}
	return out
}

func (l *SurveyLogic) eqaBlockForHospital(hospitalID int64) (map[string]any, bool, error) {
	items, _, err := l.svcCtx.EqaModel.ListParticipations(l.ctx, 0, "", hospitalID, 0, "", 50, 0)
	if err != nil {
		return nil, false, err
	}
	if len(items) == 0 {
		return nil, false, nil
	}
	year := items[0].Year
	national := map[string]any{"participating": false, "codes": []string{}}
	provincial := map[string]any{"participating": false, "codes": []string{}}
	found := false
	for _, p := range items {
		if p.Year != year {
			continue
		}
		codes, err := l.eqaTrueCodes(p.Id)
		if err != nil {
			return nil, false, err
		}
		scope := map[string]any{
			"participating": len(codes) > 0,
			"codes":         codes,
		}
		switch strings.TrimSpace(p.Scope) {
		case "national":
			national = scope
			found = true
		case "provincial":
			provincial = scope
			found = true
		}
	}
	if !found {
		return nil, false, nil
	}
	return map[string]any{
		"year":       year,
		"national":   national,
		"provincial": provincial,
	}, true, nil
}

func (l *SurveyLogic) eqaTrueCodes(participationID int64) ([]string, error) {
	items, err := l.svcCtx.EqaModel.ListItems(l.ctx, participationID)
	if err != nil {
		return nil, err
	}
	codes := make([]string, 0, len(items))
	for _, it := range items {
		if !it.Value {
			continue
		}
		code := strings.TrimSpace(it.FieldCode)
		if code != "" {
			codes = append(codes, code)
		}
	}
	return codes, nil
}

func (l *SurveyLogic) schemaAnswersFromHospital(schema []byte, h *model.Hospital) (map[string]any, error) {
	if h == nil {
		return map[string]any{}, nil
	}
	attrs, err := l.svcCtx.MasterDataModel.ListAttributes(l.ctx, h.Id)
	if err != nil {
		return nil, err
	}
	all, err := l.svcCtx.MasterDataModel.ListAllMetrics(l.ctx, h.Id)
	if err != nil {
		return nil, err
	}
	return mapHospitalToSchemaAnswers(schema, h, attrs, preferredMetrics(all, model.CurrentMetricYear())), nil
}
