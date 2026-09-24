package logic

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/jackc/pgx/v5"
	"github.com/zeromicro/go-zero/core/logx"
)

type SurveyLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewSurveyLogic(ctx context.Context, svcCtx *svc.ServiceContext) *SurveyLogic {
	return &SurveyLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *SurveyLogic) ListTemplates() (*types.ListSurveyTemplatesResponse, error) {
	activeOnly := authx.RoleFromCtx(l.ctx) != "admin"
	items, err := l.svcCtx.SurveyModel.ListTemplates(l.ctx, activeOnly)
	if err != nil {
		l.Errorf("list templates: %v", err)
		return nil, ErrInternal
	}
	out := make([]types.SurveyTemplateInfo, 0, len(items))
	for i := range items {
		out = append(out, toSurveyTemplateInfo(&items[i]))
	}
	return &types.ListSurveyTemplatesResponse{Items: out}, nil
}

func (l *SurveyLogic) GetTemplate(id int64) (*types.SurveyTemplateResponse, error) {
	t, err := l.svcCtx.SurveyModel.FindTemplateById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if t == nil {
		return nil, NewCodeError(404, "模板不存在")
	}
	return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(t)}, nil
}

func (l *SurveyLogic) CreateTemplate(req *types.CreateSurveyTemplateRequest) (*types.SurveyTemplateResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}

	code := strings.TrimSpace(req.Code)
	title := strings.TrimSpace(req.Title)
	if code == "" || title == "" {
		return nil, NewCodeError(400, "请填写模板编码与标题")
	}
	for _, r := range code {
		ok := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-'
		if !ok {
			return nil, NewCodeError(400, "编码仅支持字母、数字、下划线与短横线")
		}
	}
	if len(code) > 64 {
		return nil, NewCodeError(400, "编码最长 64 字符")
	}

	existing, err := l.svcCtx.SurveyModel.FindTemplateByCode(l.ctx, code)
	if err != nil {
		return nil, ErrInternal
	}
	if existing != nil {
		return nil, NewCodeError(409, "模板编码已存在")
	}

	schemaBytes := []byte(req.Schema)
	if len(schemaBytes) == 0 {
		schemaBytes = []byte(`{"fields":[],"sections":["未分组"]}`)
	} else if !json.Valid(schemaBytes) {
		return nil, NewCodeError(400, "schema 不是合法 JSON")
	}

	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = "active"
	}
	if status != "active" && status != "archived" {
		return nil, NewCodeError(400, "状态无效")
	}

	createdBy := uid
	created, err := l.svcCtx.SurveyModel.CreateTemplate(l.ctx, &model.SurveyTemplate{
		Code:        code,
		Title:       title,
		Description: strings.TrimSpace(req.Description),
		Schema:      json.RawMessage(schemaBytes),
		Status:      status,
		CreatedBy:   &createdBy,
	})
	if err != nil {
		l.Errorf("create template: %v", err)
		return nil, ErrInternal
	}
	return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(created)}, nil
}

func (l *SurveyLogic) UpdateTemplate(id int64, req *types.UpdateSurveyTemplateRequest) (*types.SurveyTemplateResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	existing, err := l.svcCtx.SurveyModel.FindTemplateById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if existing == nil {
		return nil, NewCodeError(404, "模板不存在")
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = existing.Title
	}
	if len(req.Schema) == 0 {
		return nil, NewCodeError(400, "请提供模板字段 schema")
	}
	schemaBytes := []byte(req.Schema)
	if !json.Valid(schemaBytes) {
		return nil, NewCodeError(400, "schema 不是合法 JSON")
	}
	var parsed struct {
		Fields []struct {
			Key   string `json:"key"`
			Label string `json:"label"`
		} `json:"fields"`
	}
	if err := json.Unmarshal(schemaBytes, &parsed); err != nil {
		return nil, NewCodeError(400, "schema 解析失败")
	}
	seen := map[string]struct{}{}
	for _, f := range parsed.Fields {
		key := strings.TrimSpace(f.Key)
		label := strings.TrimSpace(f.Label)
		if key == "" || label == "" {
			return nil, NewCodeError(400, "每个字段都需要 key 与 label")
		}
		if _, ok := seen[key]; ok {
			return nil, NewCodeError(400, "字段 key 重复："+key)
		}
		seen[key] = struct{}{}
	}

	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = existing.Status
	}
	if status != "active" && status != "archived" {
		return nil, NewCodeError(400, "状态无效")
	}

	updated, err := l.svcCtx.SurveyModel.UpdateTemplate(
		l.ctx, id, title, req.Description, status, json.RawMessage(schemaBytes), true,
	)
	if err != nil {
		l.Errorf("update template: %v", err)
		return nil, ErrInternal
	}
	if updated == nil {
		return nil, NewCodeError(404, "模板不存在")
	}
	return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(updated)}, nil
}

func (l *SurveyLogic) CreateCampaign(req *types.CreateSurveyCampaignRequest) (*types.SurveyCampaignResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	title := strings.TrimSpace(req.Title)
	if title == "" || req.TemplateId <= 0 {
		return nil, NewCodeError(400, "请填写标题并选择模板")
	}
	if len(req.AssigneeIds) == 0 {
		return nil, NewCodeError(400, "请至少选择一名采集员")
	}

	tpl, err := l.svcCtx.SurveyModel.FindTemplateById(l.ctx, req.TemplateId)
	if err != nil {
		return nil, ErrInternal
	}
	if tpl == nil || tpl.Status != "active" {
		return nil, NewCodeError(400, "模板不可用")
	}

	assignees := uniqueInt64(req.AssigneeIds)
	for _, id := range assignees {
		u, err := l.svcCtx.UserModel.FindById(l.ctx, id)
		if err != nil {
			return nil, ErrInternal
		}
		if u == nil || u.Status != model.StatusApproved {
			return nil, NewCodeError(400, "采集员不存在或未通过审核")
		}
	}

	var dueAt *time.Time
	if strings.TrimSpace(req.DueAt) != "" {
		t, err := parseDueAt(strings.TrimSpace(req.DueAt))
		if err != nil {
			return nil, NewCodeError(400, "截止时间格式无效")
		}
		dueAt = &t
	}

	c := &model.SurveyCampaign{
		TemplateId:  req.TemplateId,
		Title:       title,
		Description: strings.TrimSpace(req.Description),
		DueAt:       dueAt,
		Status:      "active",
		CreatedBy:   ptrInt64(uid),
		Defaults:    normalizeAnswers(req.Defaults),
		LockedKeys:  uniqueStrings(req.LockedKeys),
	}
	// Merge template field defaults when campaign did not override.
	c.Defaults = mergeTemplateDefaults(tpl.Schema, c.Defaults)
	c.LockedKeys = mergeTemplateLocked(tpl.Schema, c.LockedKeys)

	id, err := l.svcCtx.SurveyModel.CreateCampaignWithAssignments(l.ctx, c, assignees)
	if err != nil {
		l.Errorf("create campaign: %v", err)
		return nil, ErrInternal
	}
	return l.GetCampaign(id)
}

func (l *SurveyLogic) ListCampaigns(req *types.ListSurveyCampaignsRequest) (*types.ListSurveyCampaignsResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	page, size := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	items, total, err := l.svcCtx.SurveyModel.ListCampaigns(l.ctx, model.SurveyCampaignFilter{
		Status: req.Status, Limit: size, Offset: (page - 1) * size,
	})
	if err != nil {
		return nil, ErrInternal
	}
	out := make([]types.SurveyCampaignInfo, 0, len(items))
	for i := range items {
		out = append(out, toSurveyCampaignInfo(&items[i], nil))
	}
	return &types.ListSurveyCampaignsResponse{Total: total, Items: out}, nil
}

func (l *SurveyLogic) GetCampaign(id int64) (*types.SurveyCampaignResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	c, err := l.svcCtx.SurveyModel.FindCampaignById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if c == nil {
		return nil, NewCodeError(404, "发放不存在")
	}
	assigns, err := l.svcCtx.SurveyModel.ListAssignmentsByCampaign(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	briefs := make([]types.SurveyAssignmentBrief, 0, len(assigns))
	for i := range assigns {
		briefs = append(briefs, types.SurveyAssignmentBrief{
			Id: assigns[i].Id, AssigneeId: assigns[i].AssigneeId,
			AssigneeName: assigns[i].AssigneeName, AssigneeEmail: assigns[i].AssigneeEmail,
			Status: assigns[i].Status, SubmissionId: assigns[i].SubmissionId,
			SubmissionStatus: assigns[i].SubmissionStatus,
		})
	}
	return &types.SurveyCampaignResponse{Campaign: toSurveyCampaignInfo(c, briefs)}, nil
}

func (l *SurveyLogic) CloseCampaign(id int64) (*types.SurveyCampaignResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	if err := l.svcCtx.SurveyModel.CloseCampaign(l.ctx, id); err != nil {
		if err == pgx.ErrNoRows {
			return nil, NewCodeError(404, "发放不存在")
		}
		return nil, ErrInternal
	}
	return l.GetCampaign(id)
}

func (l *SurveyLogic) ListMyAssignments(req *types.ListMySurveyAssignmentsRequest) (*types.ListMySurveyAssignmentsResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	page, size := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	items, total, err := l.svcCtx.SurveyModel.ListAssignments(l.ctx, model.SurveyAssignmentFilter{
		AssigneeId: uid, Status: req.Status, Limit: size, Offset: (page - 1) * size,
	})
	if err != nil {
		return nil, ErrInternal
	}
	out := make([]types.SurveyAssignmentInfo, 0, len(items))
	for i := range items {
		out = append(out, toSurveyAssignmentInfo(&items[i], nil, ""))
	}
	return &types.ListMySurveyAssignmentsResponse{Total: total, Items: out}, nil
}

func (l *SurveyLogic) GetMyAssignment(id int64) (*types.SurveyAssignmentResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	a, err := l.svcCtx.SurveyModel.FindAssignmentById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if a == nil {
		return nil, NewCodeError(404, "任务不存在")
	}
	if a.AssigneeId != uid && authx.RoleFromCtx(l.ctx) != "admin" {
		return nil, ErrForbidden
	}
	var answers map[string]string
	var note string
	if sub, err := l.svcCtx.SurveyModel.FindSubmissionByAssignment(l.ctx, id); err != nil {
		return nil, ErrInternal
	} else if sub != nil {
		answers = sub.Answers
		note = sub.ReviewNote
	}
	answers = mergePrefillAnswers(a.Schema, a.CampaignDefaults, answers)
	locked := effectiveLockedKeys(a.Schema, a.LockedKeys)
	answers = applyLockedAnswers(a.Schema, a.CampaignDefaults, a.LockedKeys, answers)
	info := toSurveyAssignmentInfo(a, answers, note)
	info.LockedKeys = locked
	return &types.SurveyAssignmentResponse{Assignment: info}, nil
}

func (l *SurveyLogic) SaveDraft(id int64, req *types.SaveSurveyAnswersRequest) (*types.SurveySubmissionResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	a, err := l.ensureAssignee(id, uid)
	if err != nil {
		return nil, err
	}
	answers := applyLockedAnswers(a.Schema, a.CampaignDefaults, a.LockedKeys, normalizeAnswers(req.Answers))
	sub, err := l.svcCtx.SurveyModel.UpsertDraft(l.ctx, id, uid, answers, req.HospitalId)
	if err != nil {
		if strings.Contains(err.Error(), "locked") {
			return nil, NewCodeError(409, "答卷已提交或已通过，无法再存草稿")
		}
		l.Errorf("save draft: %v", err)
		return nil, ErrInternal
	}
	return &types.SurveySubmissionResponse{Submission: toSurveySubmissionInfo(sub)}, nil
}

func (l *SurveyLogic) Submit(id int64, req *types.SaveSurveyAnswersRequest) (*types.SurveySubmissionResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	a, err := l.ensureAssignee(id, uid)
	if err != nil {
		return nil, err
	}
	if a.CampaignStatus == "closed" {
		return nil, NewCodeError(400, "该发放已关闭，无法提交")
	}
	answers := applyLockedAnswers(a.Schema, a.CampaignDefaults, a.LockedKeys, normalizeAnswers(req.Answers))
	if err := validateRequiredAnswers(a.Schema, answers); err != nil {
		return nil, err
	}
	sub, err := l.svcCtx.SurveyModel.Submit(l.ctx, id, uid, answers, req.HospitalId)
	if err != nil {
		if strings.Contains(err.Error(), "locked") {
			return nil, NewCodeError(409, "答卷已审核通过，无法再次提交")
		}
		l.Errorf("submit: %v", err)
		return nil, ErrInternal
	}
	return &types.SurveySubmissionResponse{Submission: toSurveySubmissionInfo(sub)}, nil
}

func (l *SurveyLogic) ListSubmissions(req *types.ListSurveySubmissionsRequest) (*types.ListSurveySubmissionsResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	page, size := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	status := req.Status
	if status == "" {
		status = "submitted"
	}
	items, total, err := l.svcCtx.SurveyModel.ListSubmissions(l.ctx, model.SurveySubmissionFilter{
		Status: status, Limit: size, Offset: (page - 1) * size,
	})
	if err != nil {
		return nil, ErrInternal
	}
	out := make([]types.SurveySubmissionInfo, 0, len(items))
	for i := range items {
		out = append(out, toSurveySubmissionInfo(&items[i]))
	}
	return &types.ListSurveySubmissionsResponse{Total: total, Items: out}, nil
}

func (l *SurveyLogic) ApproveSubmission(id int64, req *types.ReviewSurveySubmissionRequest) (*types.SurveySubmissionResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}

	sub, err := l.svcCtx.SurveyModel.FindSubmissionById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if sub == nil {
		return nil, NewCodeError(404, "答卷不存在")
	}
	if sub.Status != "submitted" {
		return nil, NewCodeError(409, "仅能审核已提交的答卷")
	}

	a, err := l.svcCtx.SurveyModel.FindAssignmentById(l.ctx, sub.AssignmentId)
	if err != nil || a == nil {
		return nil, ErrInternal
	}

	hospitalID, err := l.publishSubmissionToHospital(uid, a, sub)
	if err != nil {
		return nil, err
	}

	if err := l.svcCtx.SurveyModel.ReviewSubmission(l.ctx, id, uid, "approved", strings.TrimSpace(req.Note)); err != nil {
		if err == pgx.ErrNoRows {
			return nil, NewCodeError(409, "仅能审核已提交的答卷")
		}
		l.Errorf("review approve: %v", err)
		return nil, ErrInternal
	}
	if err := l.svcCtx.SurveyModel.SetSubmissionHospital(l.ctx, id, hospitalID); err != nil {
		l.Errorf("link hospital: %v", err)
		return nil, ErrInternal
	}

	sub, err = l.svcCtx.SurveyModel.FindSubmissionById(l.ctx, id)
	if err != nil || sub == nil {
		return nil, ErrInternal
	}
	return &types.SurveySubmissionResponse{Submission: toSurveySubmissionInfo(sub)}, nil
}

func (l *SurveyLogic) RejectSubmission(id int64, req *types.ReviewSurveySubmissionRequest) (*types.SurveySubmissionResponse, error) {
	note := strings.TrimSpace(req.Note)
	if note == "" {
		return nil, NewCodeError(400, "驳回请填写原因")
	}
	return l.review(id, "rejected", note)
}

func (l *SurveyLogic) review(id int64, status, note string) (*types.SurveySubmissionResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if err := l.svcCtx.SurveyModel.ReviewSubmission(l.ctx, id, uid, status, strings.TrimSpace(note)); err != nil {
		if err == pgx.ErrNoRows {
			return nil, NewCodeError(409, "仅能审核已提交的答卷")
		}
		l.Errorf("review: %v", err)
		return nil, ErrInternal
	}
	sub, err := l.svcCtx.SurveyModel.FindSubmissionById(l.ctx, id)
	if err != nil || sub == nil {
		return nil, ErrInternal
	}
	return &types.SurveySubmissionResponse{Submission: toSurveySubmissionInfo(sub)}, nil
}

type surveySchemaField struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Required bool   `json:"required"`
	Target   string `json:"target"`
}

func (l *SurveyLogic) publishSubmissionToHospital(reviewerID int64, a *model.SurveyAssignment, sub *model.SurveySubmission) (int64, error) {
	var schema struct {
		Fields []surveySchemaField `json:"fields"`
	}
	if len(a.Schema) > 0 {
		_ = json.Unmarshal(a.Schema, &schema)
	}

	answers := sub.Answers
	if answers == nil {
		answers = map[string]string{}
	}

	cols := map[string]string{}
	archive := map[string]string{}

	applyTarget := func(target, key, value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		target = strings.TrimSpace(target)
		switch {
		case strings.HasPrefix(target, "hospital.archive."):
			archive[strings.TrimPrefix(target, "hospital.archive.")] = value
		case strings.HasPrefix(target, "hospital."):
			cols[strings.TrimPrefix(target, "hospital.")] = value
		case target == "":
			switch key {
			case "name", "province", "city", "district", "level", "type", "address", "remark":
				cols[key] = value
			default:
				archive[key] = value
			}
		default:
			archive[key] = value
		}
	}

	if len(schema.Fields) > 0 {
		for _, f := range schema.Fields {
			applyTarget(f.Target, f.Key, answers[f.Key])
		}
	} else {
		for k, v := range answers {
			applyTarget("", k, v)
		}
	}

	// Prefer explicit hospital name; fall back to customerName in archive.
	name := strings.TrimSpace(cols["name"])
	if name == "" {
		name = strings.TrimSpace(archive["customerName"])
	}
	province := strings.TrimSpace(cols["province"])
	city := strings.TrimSpace(cols["city"])
	if name == "" || province == "" || city == "" {
		return 0, NewCodeError(400, "答卷缺少医院名称/省份/城市，无法写入看板")
	}

	level := strings.TrimSpace(cols["level"])
	typ := strings.TrimSpace(cols["type"])
	if level == "" {
		level = "二级甲等"
	}
	if typ == "" {
		typ = "综合医院"
	}

	var existing *model.Hospital
	var err error
	if sub.HospitalId != nil && *sub.HospitalId > 0 {
		existing, err = l.svcCtx.HospitalModel.FindById(l.ctx, *sub.HospitalId)
	} else {
		existing, err = l.svcCtx.HospitalModel.FindByNameProvinceCity(l.ctx, name, province, city)
	}
	if err != nil {
		l.Errorf("find hospital for publish: %v", err)
		return 0, ErrInternal
	}

	mergedArchive := map[string]string{}
	if existing != nil && existing.Archive != nil {
		for k, v := range existing.Archive {
			mergedArchive[k] = v
		}
	}
	for k, v := range archive {
		mergedArchive[k] = v
	}

	district := strings.TrimSpace(cols["district"])
	address := strings.TrimSpace(cols["address"])
	remark := strings.TrimSpace(cols["remark"])
	if remark == "" {
		remark = strings.TrimSpace(archive["archiveRemark"])
	}

	if existing == nil {
		h := &model.Hospital{
			Name: name, Province: province, City: city, District: district,
			Level: level, Type: typ, Status: "active", Address: address, Remark: remark,
			Archive: mergedArchive, CreatedBy: ptrInt64(reviewerID), UpdatedBy: ptrInt64(reviewerID),
		}
		id, err := l.svcCtx.HospitalModel.Insert(l.ctx, h)
		if err != nil {
			l.Errorf("insert hospital from survey: %v", err)
			return 0, NewCodeError(400, "写入医院失败，可能已存在同名医院或字段不合法")
		}
		return id, nil
	}

	if district != "" {
		existing.District = district
	}
	if level != "" {
		existing.Level = level
	}
	if typ != "" {
		existing.Type = typ
	}
	if address != "" {
		existing.Address = address
	}
	if remark != "" {
		existing.Remark = remark
	}
	existing.Name = name
	existing.Province = province
	existing.City = city
	existing.Status = "active"
	existing.Archive = mergedArchive
	existing.UpdatedBy = ptrInt64(reviewerID)
	if err := l.svcCtx.HospitalModel.Update(l.ctx, existing); err != nil {
		l.Errorf("update hospital from survey: %v", err)
		return 0, NewCodeError(400, "更新医院失败，请检查字段是否合法")
	}
	return existing.Id, nil
}

func (l *SurveyLogic) ensureAssignee(assignmentID, uid int64) (*model.SurveyAssignment, error) {
	a, err := l.svcCtx.SurveyModel.FindAssignmentById(l.ctx, assignmentID)
	if err != nil {
		return nil, ErrInternal
	}
	if a == nil {
		return nil, NewCodeError(404, "任务不存在")
	}
	if a.AssigneeId != uid {
		return nil, ErrForbidden
	}
	return a, nil
}

func toSurveyTemplateInfo(t *model.SurveyTemplate) types.SurveyTemplateInfo {
	schema := t.Schema
	if len(schema) == 0 {
		schema = json.RawMessage(`{"fields":[]}`)
	}
	return types.SurveyTemplateInfo{
		Id: t.Id, Code: t.Code, Title: t.Title, Description: t.Description,
		Schema: schema, Version: t.Version, Status: t.Status,
	}
}

func toSurveyCampaignInfo(c *model.SurveyCampaign, assigns []types.SurveyAssignmentBrief) types.SurveyCampaignInfo {
	info := types.SurveyCampaignInfo{
		Id: c.Id, TemplateId: c.TemplateId, TemplateCode: c.TemplateCode, TemplateTitle: c.TemplateTitle,
		Title: c.Title, Description: c.Description, Status: c.Status,
		Defaults: c.Defaults, LockedKeys: c.LockedKeys,
		AssignmentCount: c.AssignmentCount, CreatedAt: formatTime(c.CreatedAt),
		Assignments: assigns,
	}
	if c.DueAt != nil {
		info.DueAt = formatTime(*c.DueAt)
	}
	return info
}

func toSurveyAssignmentInfo(a *model.SurveyAssignment, answers map[string]string, note string) types.SurveyAssignmentInfo {
	schema := a.Schema
	if len(schema) == 0 {
		schema = json.RawMessage(`{"fields":[]}`)
	}
	info := types.SurveyAssignmentInfo{
		Id: a.Id, CampaignId: a.CampaignId, CampaignTitle: a.CampaignTitle, CampaignStatus: a.CampaignStatus,
		Status: a.Status, TemplateId: a.TemplateId, TemplateCode: a.TemplateCode, TemplateTitle: a.TemplateTitle,
		Schema: schema, SubmissionId: a.SubmissionId, SubmissionStatus: a.SubmissionStatus,
		Answers: answers, ReviewNote: note,
	}
	if a.DueAt != nil {
		info.DueAt = formatTime(*a.DueAt)
	}
	return info
}

func toSurveySubmissionInfo(s *model.SurveySubmission) types.SurveySubmissionInfo {
	info := types.SurveySubmissionInfo{
		Id: s.Id, AssignmentId: s.AssignmentId, CampaignTitle: s.CampaignTitle,
		AssigneeName: s.AssigneeName, AssigneeEmail: s.AssigneeEmail, CollectorName: s.CollectorName,
		HospitalId: s.HospitalId, Answers: s.Answers, Status: s.Status, ReviewNote: s.ReviewNote,
	}
	if s.SubmittedAt != nil {
		info.SubmittedAt = formatTime(*s.SubmittedAt)
	}
	if s.ReviewedAt != nil {
		info.ReviewedAt = formatTime(*s.ReviewedAt)
	}
	if info.Answers == nil {
		info.Answers = map[string]string{}
	}
	return info
}

func normalizeAnswers(in map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range in {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		out[k] = strings.TrimSpace(v)
	}
	return out
}

func validateRequiredAnswers(schemaJSON json.RawMessage, answers map[string]string) error {
	var schema struct {
		Fields []struct {
			Key      string `json:"key"`
			Label    string `json:"label"`
			Required bool   `json:"required"`
		} `json:"fields"`
	}
	if len(schemaJSON) > 0 {
		_ = json.Unmarshal(schemaJSON, &schema)
	}
	missing := make([]string, 0)
	for _, f := range schema.Fields {
		if !f.Required {
			continue
		}
		if strings.TrimSpace(answers[f.Key]) == "" {
			label := f.Label
			if label == "" {
				label = f.Key
			}
			missing = append(missing, label)
		}
	}
	if len(missing) > 0 {
		return NewCodeError(400, "请填写必填项："+strings.Join(missing, "、"))
	}
	return nil
}

func uniqueInt64(ids []int64) []int64 {
	seen := map[int64]struct{}{}
	out := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func uniqueStrings(vals []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(vals))
	for _, v := range vals {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if _, ok := seen[v]; ok {
			continue
		}
		seen[v] = struct{}{}
		out = append(out, v)
	}
	return out
}

type schemaFieldMeta struct {
	Key     string `json:"key"`
	Default string `json:"default"`
	Locked  bool   `json:"locked"`
}

func parseSchemaFields(schemaJSON json.RawMessage) []schemaFieldMeta {
	var schema struct {
		Fields []schemaFieldMeta `json:"fields"`
	}
	if len(schemaJSON) > 0 {
		_ = json.Unmarshal(schemaJSON, &schema)
	}
	return schema.Fields
}

func mergeTemplateDefaults(schemaJSON json.RawMessage, campaignDefaults map[string]string) map[string]string {
	out := map[string]string{}
	for _, f := range parseSchemaFields(schemaJSON) {
		d := strings.TrimSpace(f.Default)
		if d != "" {
			out[f.Key] = d
		}
	}
	for k, v := range campaignDefaults {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		out[k] = v
	}
	return out
}

func mergeTemplateLocked(schemaJSON json.RawMessage, campaignLocked []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0)
	for _, f := range parseSchemaFields(schemaJSON) {
		if f.Locked && strings.TrimSpace(f.Key) != "" {
			if _, ok := seen[f.Key]; !ok {
				seen[f.Key] = struct{}{}
				out = append(out, f.Key)
			}
		}
	}
	for _, k := range uniqueStrings(campaignLocked) {
		if _, ok := seen[k]; ok {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, k)
	}
	return out
}

func effectiveLockedKeys(schemaJSON json.RawMessage, campaignLocked []string) []string {
	return mergeTemplateLocked(schemaJSON, campaignLocked)
}

// mergePrefillAnswers: template default < campaign default < saved answers.
func mergePrefillAnswers(schemaJSON json.RawMessage, campaignDefaults, saved map[string]string) map[string]string {
	out := mergeTemplateDefaults(schemaJSON, campaignDefaults)
	for k, v := range saved {
		out[k] = v
	}
	return out
}

func applyLockedAnswers(schemaJSON json.RawMessage, campaignDefaults map[string]string, campaignLocked []string, answers map[string]string) map[string]string {
	prefill := mergeTemplateDefaults(schemaJSON, campaignDefaults)
	lockedSet := map[string]struct{}{}
	for _, k := range effectiveLockedKeys(schemaJSON, campaignLocked) {
		lockedSet[k] = struct{}{}
	}
	out := map[string]string{}
	for k, v := range answers {
		out[k] = v
	}
	for k := range lockedSet {
		if v, ok := prefill[k]; ok {
			out[k] = v
		}
	}
	return out
}

// parseDueAt accepts RFC3339 or HTML datetime-local (YYYY-MM-DDTHH:MM[:SS]).
func parseDueAt(raw string) (time.Time, error) {
	layouts := []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
	}
	var lastErr error
	for _, layout := range layouts {
		t, err := time.ParseInLocation(layout, raw, time.Local)
		if err == nil {
			return t, nil
		}
		lastErr = err
	}
	return time.Time{}, lastErr
}
