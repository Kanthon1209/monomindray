package logic

import (
	"context"
	"encoding/json"
	"fmt"
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
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	items, err := l.svcCtx.SurveyModel.ListTemplates(l.ctx, true) // active only — archived stay for existing campaigns
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
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
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

	schemaBytes, err := marshalSchemaMap(req.Schema)
	if err != nil {
		return nil, NewCodeError(400, "schema 不是合法 JSON")
	}
	if len(schemaBytes) == 0 {
		schemaBytes = []byte(`{"fields":[],"sections":["未分组"]}`)
	}
	if err := l.validateSurveySchemaFields(schemaBytes, nil); err != nil {
		return nil, err
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
	if req.Schema == nil {
		return nil, NewCodeError(400, "请提供模板字段 schema")
	}
	schemaBytes, err := marshalSchemaMap(req.Schema)
	if err != nil {
		return nil, NewCodeError(400, "schema 不是合法 JSON")
	}
	if err := l.validateSurveySchemaFields(schemaBytes, schemaTargetSet(existing.Schema)); err != nil {
		return nil, err
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

func (l *SurveyLogic) ArchiveTemplate(id int64, force bool) (*types.SurveyTemplateResponse, error) {
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
	if existing.Status == "archived" {
		return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(existing)}, nil
	}

	activeN, err := l.svcCtx.SurveyModel.CountCampaignsByTemplate(l.ctx, id, []string{"draft", "active"})
	if err != nil {
		l.Errorf("count campaigns by template: %v", err)
		return nil, ErrInternal
	}
	if activeN > 0 && !force {
		return nil, NewCodeError(409, fmt.Sprintf(
			"仍有 %d 个进行中的发放引用此模板。归档后无法再新建发放，已有任务不受影响。确认后可强制归档。",
			activeN,
		))
	}

	updated, err := l.svcCtx.SurveyModel.ArchiveTemplate(l.ctx, id)
	if err != nil {
		l.Errorf("archive template: %v", err)
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

	mode := strings.TrimSpace(req.DistributionMode)
	if mode == "" {
		mode = "hospital"
	}
	if mode != "hospital" && mode != "collector_open" {
		return nil, NewCodeError(400, "发放方式无效")
	}

	tpl, err := l.svcCtx.SurveyModel.FindTemplateById(l.ctx, req.TemplateId)
	if err != nil {
		return nil, ErrInternal
	}
	if tpl == nil || tpl.Status != "active" {
		return nil, NewCodeError(400, "模板不可用")
	}
	if len(schemaFieldKeySet(tpl.Schema)) == 0 {
		return nil, NewCodeError(400, "模板没有字段，请先在模板中添加字段再发放")
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
		TemplateId:       req.TemplateId,
		Title:            title,
		Description:      strings.TrimSpace(req.Description),
		DueAt:            dueAt,
		Status:           "active",
		CreatedBy:        ptrInt64(uid),
		Defaults:         normalizeStringMap(req.Defaults),
		LockedKeys:       uniqueStrings(req.LockedKeys),
		DistributionMode: mode,
	}
	c.Defaults = mergeTemplateDefaults(tpl.Schema, c.Defaults)
	c.LockedKeys = mergeTemplateLocked(tpl.Schema, c.LockedKeys)

	var specs []model.SurveyAssignmentSpec

	if mode == "collector_open" {
		assigneeIDs := uniqueInt64(req.AssigneeIds)
		if req.AssigneeId > 0 {
			assigneeIDs = uniqueInt64(append(assigneeIDs, req.AssigneeId))
		}
		if len(assigneeIDs) == 0 {
			return nil, NewCodeError(400, "请至少选择一名采集员")
		}
		// Do NOT lock hospital name — collector picks via typeahead.
		for _, aid := range assigneeIDs {
			u, err := l.svcCtx.UserModel.FindById(l.ctx, aid)
			if err != nil {
				return nil, ErrInternal
			}
			if u == nil || u.Status != model.StatusApproved {
				return nil, NewCodeError(400, fmt.Sprintf("采集员不存在或未通过审核: %d", aid))
			}
			specs = append(specs, model.SurveyAssignmentSpec{
				AssigneeID: aid,
				HospitalID: 0,
				Prefill:    map[string]any{},
			})
		}
	} else {
		assigneeID := req.AssigneeId
		hospitalIDs := uniqueInt64(req.HospitalIds)
		if assigneeID <= 0 && len(req.AssigneeIds) == 1 {
			assigneeID = req.AssigneeIds[0]
		}
		if assigneeID <= 0 {
			return nil, NewCodeError(400, "请选择一名采集员")
		}
		if len(hospitalIDs) == 0 {
			return nil, NewCodeError(400, "请至少选择一家医院")
		}
		u, err := l.svcCtx.UserModel.FindById(l.ctx, assigneeID)
		if err != nil {
			return nil, ErrInternal
		}
		if u == nil || u.Status != model.StatusApproved {
			return nil, NewCodeError(400, "采集员不存在或未通过审核")
		}
		// Bound hospital ⇒ lock customer/hospital name fields so collectors cannot retarget.
		c.LockedKeys = uniqueStrings(append(c.LockedKeys, hospitalNameFieldKeys(tpl.Schema)...))
		specs = make([]model.SurveyAssignmentSpec, 0, len(hospitalIDs))
		for _, hid := range hospitalIDs {
			h, err := l.svcCtx.HospitalModel.FindById(l.ctx, hid)
			if err != nil {
				return nil, ErrInternal
			}
			if h == nil {
				return nil, NewCodeError(400, fmt.Sprintf("医院不存在: %d", hid))
			}
			specs = append(specs, model.SurveyAssignmentSpec{
				AssigneeID: assigneeID,
				HospitalID: hid,
				Prefill:    mapHospitalToSchemaAnswers(tpl.Schema, h),
			})
		}
	}

	id, err := l.svcCtx.SurveyModel.CreateCampaignWithAssignments(l.ctx, c, specs)
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
			HospitalId: assigns[i].HospitalId, HospitalName: assigns[i].HospitalName,
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

func (l *SurveyLogic) DeleteCampaign(id int64) error {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return err
	}
	existing, err := l.svcCtx.SurveyModel.FindCampaignById(l.ctx, id)
	if err != nil {
		l.Errorf("find campaign: %v", err)
		return ErrInternal
	}
	if existing == nil {
		return NewCodeError(404, "发放不存在")
	}
	if err := l.svcCtx.SurveyModel.DeleteCampaign(l.ctx, id); err != nil {
		if err == pgx.ErrNoRows {
			return NewCodeError(404, "发放不存在")
		}
		l.Errorf("delete campaign: %v", err)
		return ErrInternal
	}
	return nil
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
	var answers map[string]any
	var note string
	if sub, err := l.svcCtx.SurveyModel.FindSubmissionByAssignment(l.ctx, id); err != nil {
		return nil, ErrInternal
	} else if sub != nil {
		answers = sub.Answers
		note = sub.ReviewNote
	}
	answers = mergePrefillAnswers(a.Schema, a.CampaignDefaults, answers)
	locked := assignmentEffectiveLockedKeys(a)
	answers = applyLockedAnswers(a.Schema, a.CampaignDefaults, locked, answers)
	answers = forceAssignedHospitalAnswers(a, answers)
	answers = pruneAnswersToSchema(a.Schema, answers)
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
	locked := assignmentEffectiveLockedKeys(a)
	answers := applyLockedAnswers(a.Schema, a.CampaignDefaults, locked, normalizeAnswers(req.Answers))
	answers = forceAssignedHospitalAnswers(a, answers)
	answers = pruneAnswersToSchema(a.Schema, answers)
	hid := a.HospitalId
	if hid == nil {
		hid = req.HospitalId
	}
	sub, err := l.svcCtx.SurveyModel.UpsertDraft(l.ctx, id, uid, answers, hid)
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
	locked := assignmentEffectiveLockedKeys(a)
	answers := applyLockedAnswers(a.Schema, a.CampaignDefaults, locked, normalizeAnswers(req.Answers))
	answers = forceAssignedHospitalAnswers(a, answers)
	answers = pruneAnswersToSchema(a.Schema, answers)
	if err := validateRequiredAnswers(a.Schema, answers); err != nil {
		return nil, err
	}
	hid := a.HospitalId
	if hid == nil {
		hid = req.HospitalId
	}
	openHospital := a.HospitalId == nil || (a.HospitalId != nil && *a.HospitalId <= 0)
	if openHospital {
		if hid == nil || *hid <= 0 {
			return nil, NewCodeError(400, "请从联想列表中选择一家已有医院")
		}
		h, err := l.svcCtx.HospitalModel.FindById(l.ctx, *hid)
		if err != nil {
			return nil, ErrInternal
		}
		if h == nil {
			return nil, NewCodeError(400, "所选医院不存在")
		}
	}
	sub, err := l.svcCtx.SurveyModel.Submit(l.ctx, id, uid, answers, hid)
	if err != nil {
		if strings.Contains(err.Error(), "locked") {
			return nil, NewCodeError(409, "答卷已审核通过，无法再次提交")
		}
		l.Errorf("submit: %v", err)
		return nil, ErrInternal
	}

	resp := &types.SurveySubmissionResponse{Submission: toSurveySubmissionInfo(sub)}
	// collector_open: after each submit, open a fresh blank task so collector can fill again.
	if openHospital && a.CampaignStatus == "active" {
		camp, err := l.svcCtx.SurveyModel.FindCampaignById(l.ctx, a.CampaignId)
		if err != nil {
			l.Errorf("find campaign after submit: %v", err)
		} else if camp != nil && camp.DistributionMode == "collector_open" && camp.Status == "active" {
			nextID, err := l.svcCtx.SurveyModel.CreateOpenAssignment(l.ctx, a.CampaignId, a.AssigneeId)
			if err != nil {
				l.Errorf("spawn next open assignment: %v", err)
			} else {
				resp.NextAssignmentId = &nextID
			}
		}
	}
	return resp, nil
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

	// EQA writeback when answers contain eqa_year/eqa_scope or EQA field codes
	if err := NewEqaLogic(l.ctx, l.svcCtx).WritebackFromSurveyAnswers(uid, hospitalID, sub.Answers); err != nil {
		l.Errorf("eqa writeback: %v", err)
		return nil, ErrInternal
	}
	// Assay tree block → hospital_assays by leaf codes
	if err := NewAssayProjectLogic(l.ctx, l.svcCtx).WritebackFromSurveyAnswers(hospitalID, sub.Answers); err != nil {
		l.Errorf("assay writeback: %v", err)
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

func (l *SurveyLogic) publishSubmissionToHospital(reviewerID int64, a *model.SurveyAssignment, sub *model.SurveySubmission) (int64, error) {
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
			// customer_level → hospital_attributes; usage_location → devices only
			switch k {
			case "customerLevel", "customer_level", "usageLocation", "usage_location":
				return
			}
			archive[k] = model.NormalizeArchiveValue(k, v)
		}
		switch {
		case strings.HasPrefix(target, "eqa."):
			// EQA answers are written by EqaLogic.WritebackFromSurveyAnswers only.
			return
		case strings.HasPrefix(target, "assay."):
			// Assay block written by AssayProjectLogic.WritebackFromSurveyAnswers only.
			return
		case strings.HasPrefix(target, "hospital.attributes."):
			attrKey := strings.TrimPrefix(target, "hospital.attributes.")
			if attrKey == "usage_location" || attrKey == "usageLocation" {
				// device instance attr — collected via device_block
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
			case "devices", "eqa_year", "eqa_scope", "customer_level", "hospital_name":
				// devices handled below; EQA / catalog keys ignored without target
			default:
				if attrKey, ok := model.KnownAttributeKeys[key]; ok {
					attributes[attrKey] = value
					return
				}
				if metricKey, ok := model.KnownMetricKeys[key]; ok {
					metrics[metricKey] = value
					return
				}
				// no invent-into-archive for unknown keys
			}
		default:
			// Unknown targets are ignored (do not dump into archive).
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
	province := strings.TrimSpace(cols["province"])
	city := strings.TrimSpace(cols["city"])

	var existing *model.Hospital
	var err error
	if a.HospitalId != nil && *a.HospitalId > 0 {
		existing, err = l.svcCtx.HospitalModel.FindById(l.ctx, *a.HospitalId)
	} else if sub.HospitalId != nil && *sub.HospitalId > 0 {
		existing, err = l.svcCtx.HospitalModel.FindById(l.ctx, *sub.HospitalId)
	} else if name != "" && province != "" && city != "" {
		existing, err = l.svcCtx.HospitalModel.FindByNameProvinceCity(l.ctx, name, province, city)
	}
	if err != nil {
		l.Errorf("find hospital for publish: %v", err)
		return 0, ErrInternal
	}
	if existing == nil {
		if name == "" || province == "" || city == "" {
			return 0, NewCodeError(400, "答卷缺少医院名称/省份/城市，且未绑定医院，无法写入看板")
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
	if level == "" {
		if existing != nil {
			level = existing.Level
		} else {
			level = "二级甲等"
		}
	}
	if typ == "" {
		if existing != nil {
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

	// Merge device-level otherAnalyzers into hospital archive (assays go via assay_block / device_block).
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
	// Retired flat project lists — hospital_assays is the source of truth.
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
	region := firstNonEmpty(cols["region"], archiveString(mergedArchive, "region"))
	branchOffice := firstNonEmpty(cols["branchOffice"], cols["branch_office"], archiveString(mergedArchive, "branchOffice"))

	// Attributes/metrics come only from explicit hospital.attributes.* / hospital.metrics.* targets.

	var hospitalID int64
	if existing == nil {
		h := &model.Hospital{
			Name: name, Province: province, City: city, District: district,
			Level: level, Type: typ, Status: "active", Address: address, Remark: remark,
			CustomerCode: customerCode, Region: region, BranchOffice: branchOffice,
			Archive: mergedArchive, CreatedBy: ptrInt64(reviewerID), UpdatedBy: ptrInt64(reviewerID),
		}
		hospitalID, err = l.svcCtx.HospitalModel.Insert(l.ctx, h)
		if err != nil {
			l.Errorf("insert hospital from survey: %v", err)
			return 0, NewCodeError(400, "写入医院失败，可能已存在同名医院或字段不合法")
		}
	} else {
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
		if customerCode != "" {
			existing.CustomerCode = customerCode
		}
		if region != "" {
			existing.Region = region
		}
		if branchOffice != "" {
			existing.BranchOffice = branchOffice
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
		hospitalID = existing.Id
	}

	if err := l.publishDevices(reviewerID, hospitalID, deviceRows); err != nil {
		return 0, err
	}
	if err := l.dualWriteMasterData(hospitalID, mergedArchive, attributes, metrics); err != nil {
		l.Errorf("dual-write master data: %v", err)
		// non-fatal for approve: hospital/devices already saved
	}
	return hospitalID, nil
}

func (l *SurveyLogic) dualWriteMasterData(hospitalID int64, archive map[string]any, attributes, metrics map[string]string) error {
	md := l.svcCtx.MasterDataModel
		if stage, ok := attributes["customer_stage"]; ok && !model.IsAllowedEnum(stage, model.CustomerStageEnum) {
		return NewCodeError(400, "客户所在阶段不在可选范围内："+stage)
	}
	if err := md.UpsertAttributes(l.ctx, hospitalID, attributes); err != nil {
		return err
	}
	year := model.CurrentMetricYear()
	if err := md.UpsertMetrics(l.ctx, hospitalID, year, metrics); err != nil {
		return err
	}
	// SyncAssaysFromArchive retired (hierarchical assay_block owns hospital_assays).
	if s := archiveString(archive, "reagentSupplier"); s != "" {
		if err := md.UpsertSupply(l.ctx, hospitalID, s, "reagent_vendor", "", "", ""); err != nil {
			return err
		}
	}
	if s := archiveString(archive, "supplyChannel"); s != "" {
		if err := md.UpsertSupply(l.ctx, hospitalID, s, "channel", "", "", ""); err != nil {
			return err
		}
	}
	for fieldKey, role := range model.KnownRoleKeys {
		name := archiveString(archive, fieldKey)
		emp := ""
		if empKey, ok := model.RoleEmployeeNoKeys[fieldKey]; ok {
			emp = archiveString(archive, empKey)
		}
		if name != "" || emp != "" {
			if err := md.UpsertRoleAssignment(l.ctx, hospitalID, role, name, emp); err != nil {
				return err
			}
		}
	}
	return nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func (l *SurveyLogic) publishDevices(reviewerID, hospitalID int64, rows []map[string]any) error {
	for _, row := range rows {
		modelName := anyToString(row["model"])
		serial := anyToString(row["serialNo"])
		if modelName == "" && serial == "" && anyToString(row["assayLineCode"]) == "" {
			continue
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
			return NewCodeError(400, "设备「客户服务评价」不在可选范围内："+serviceEval)
		}

		usageLoc := firstNonEmpty(
			anyToString(row["usageLocation"]),
			anyToString(row["usage_location"]),
		)
		reagentBrand := firstNonEmpty(
			anyToString(row["reagentBrand"]),
			anyToString(row["reagent_brand"]),
			anyToString(row["试剂品牌"]),
		)
		monthlyVol := firstNonEmpty(
			anyToString(row["monthlySampleVolume"]),
			anyToString(row["monthly_sample_volume"]),
			anyToString(row["月样本量"]),
		)
		deptHead := firstNonEmpty(
			anyToString(row["deptHead"]),
			anyToString(row["dept_head"]),
			anyToString(row["科室负责人"]),
		)
		channelCsa := firstNonEmpty(
			anyToString(row["channelCsa"]),
			anyToString(row["channel_csa"]),
			anyToString(row["渠道CSA"]),
		)
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
		remark := strings.Join(remarkParts, "；")

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

		existing, err := l.svcCtx.DeviceModel.FindByHospitalSerial(l.ctx, hospitalID, serial)
		if err != nil {
			l.Errorf("find device: %v", err)
			return ErrInternal
		}
		if existing == nil {
			_, err = l.svcCtx.DeviceModel.Insert(l.ctx, &model.Device{
				HospitalId: hospitalID, Brand: brand, Category: cat, AssayLineCode: line,
				Model: modelName, SerialNo: serial,
				Status: "active", InstalledAt: installedAt, EnabledAt: enabledAt,
				UsageLocation: usageLoc, Remark: remark,
				ServiceEvaluation: serviceEval,
				ReagentBrand: reagentBrand, MonthlySampleVolume: monthlyVol,
				DeptHead: deptHead, ChannelCsa: channelCsa,
				ItemCodes: itemCodes,
				CreatedBy: ptrInt64(reviewerID), UpdatedBy: ptrInt64(reviewerID),
			})
			if err != nil {
				l.Errorf("insert device: %v", err)
				return NewCodeError(400, "写入设备失败："+modelName)
			}
			continue
		}
		existing.Brand = brand
		existing.Category = cat
		if line != "" {
			existing.AssayLineCode = line
		}
		existing.Model = modelName
		existing.ItemCodes = itemCodes
		if serviceEval != "" {
			existing.ServiceEvaluation = serviceEval
		}
		if installedAt != nil {
			existing.InstalledAt = installedAt
		}
		if enabledAt != nil {
			existing.EnabledAt = enabledAt
		}
		if usageLoc != "" {
			existing.UsageLocation = usageLoc
		}
		if reagentBrand != "" {
			existing.ReagentBrand = reagentBrand
		}
		if monthlyVol != "" {
			existing.MonthlySampleVolume = monthlyVol
		}
		if deptHead != "" {
			existing.DeptHead = deptHead
		}
		if channelCsa != "" {
			existing.ChannelCsa = channelCsa
		}
		if remark != "" {
			existing.Remark = remark
		}
		existing.Status = "active"
		existing.UpdatedBy = ptrInt64(reviewerID)
		if err := l.svcCtx.DeviceModel.Update(l.ctx, existing); err != nil {
			l.Errorf("update device: %v", err)
			return NewCodeError(400, "更新设备失败："+modelName)
		}
	}
	if err := l.svcCtx.DeviceModel.SyncHospitalAssaysFromDevices(l.ctx, hospitalID); err != nil {
		l.Errorf("sync assays from devices: %v", err)
		return NewCodeError(400, "同步设备检测项目失败")
	}
	return nil
}

// extractAllDeviceRows collects device rows from legacy key "devices" and any device_block answer.
func extractAllDeviceRows(answers map[string]any) []map[string]any {
	if answers == nil {
		return nil
	}
	out := extractDeviceAnswers(answers["devices"])
	for k, v := range answers {
		if k == "devices" {
			continue
		}
		m, ok := v.(map[string]any)
		if !ok {
			continue
		}
		if _, has := m["devices"]; has {
			out = append(out, extractDeviceAnswers(m)...)
		}
	}
	return out
}

type surveySchemaField struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Required bool   `json:"required"`
	Target   string `json:"target"`
	Type     string `json:"type"`
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
	mode := c.DistributionMode
	if mode == "" {
		mode = "hospital"
	}
	info := types.SurveyCampaignInfo{
		Id: c.Id, TemplateId: c.TemplateId, TemplateCode: c.TemplateCode, TemplateTitle: c.TemplateTitle,
		Title: c.Title, Description: c.Description, Status: c.Status,
		Defaults: c.Defaults, LockedKeys: c.LockedKeys, DistributionMode: mode,
		AssignmentCount: c.AssignmentCount, ApprovedCount: c.ApprovedCount,
		PendingReviewCount: c.PendingReviewCount, CreatedAt: formatTime(c.CreatedAt),
		Assignments: assigns,
	}
	if c.DueAt != nil {
		info.DueAt = formatTime(*c.DueAt)
	}
	return info
}

func toSurveyAssignmentInfo(a *model.SurveyAssignment, answers map[string]any, note string) types.SurveyAssignmentInfo {
	schema := a.Schema
	if len(schema) == 0 {
		schema = json.RawMessage(`{"fields":[]}`)
	}
	hospitalOpen := a.HospitalId == nil || (a.HospitalId != nil && *a.HospitalId <= 0)
	info := types.SurveyAssignmentInfo{
		Id: a.Id, CampaignId: a.CampaignId, CampaignTitle: a.CampaignTitle, CampaignStatus: a.CampaignStatus,
		Status: a.Status, HospitalId: a.HospitalId, HospitalName: a.HospitalName, HospitalOpen: hospitalOpen,
		TemplateId: a.TemplateId, TemplateCode: a.TemplateCode, TemplateTitle: a.TemplateTitle,
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
		HospitalId: s.HospitalId, HospitalName: s.HospitalName, Answers: s.Answers, Schema: s.Schema,
		Status: s.Status, ReviewNote: s.ReviewNote,
	}
	if s.SubmittedAt != nil {
		info.SubmittedAt = formatTime(*s.SubmittedAt)
	}
	if s.ReviewedAt != nil {
		info.ReviewedAt = formatTime(*s.ReviewedAt)
	}
	if info.Answers == nil {
		info.Answers = map[string]any{}
	}
	return info
}

func normalizeStringMap(in map[string]string) map[string]string {
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

func normalizeAnswers(in map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range in {
		k = strings.TrimSpace(k)
		if k == "" {
			continue
		}
		switch t := v.(type) {
		case string:
			out[k] = strings.TrimSpace(t)
		default:
			out[k] = v
		}
	}
	return out
}

// validateSurveySchemaFields requires every collectable field to map to an active
// collectable_fields.storage_target. Unmapped / invented targets are rejected.
// allowTargets grandfathers storage targets already present on an existing template
// (e.g. fields later marked is_active=false) so metadata edits like device_block
// subFieldOrder can still be saved.
func (l *SurveyLogic) validateSurveySchemaFields(schemaBytes []byte, allowTargets map[string]struct{}) error {
	if len(schemaBytes) == 0 {
		return nil
	}
	var parsed struct {
		Fields []struct {
			Key           string `json:"key"`
			Label         string `json:"label"`
			Type          string `json:"type"`
			Target        string `json:"target"`
			OptionsSource string `json:"optionsSource"`
			Fields        []struct {
				Key    string `json:"key"`
				Label  string `json:"label"`
				Type   string `json:"type"`
				Target string `json:"target"`
			} `json:"fields"`
		} `json:"fields"`
	}
	if err := json.Unmarshal(schemaBytes, &parsed); err != nil {
		return NewCodeError(400, "schema 解析失败")
	}
	catalog, err := l.svcCtx.CollectableFieldModel.ActiveTargetSet(l.ctx)
	if err != nil {
		l.Errorf("load collectable fields: %v", err)
		return ErrInternal
	}
	seen := map[string]struct{}{}
	check := func(key, label, typ, target string) error {
		key = strings.TrimSpace(key)
		label = strings.TrimSpace(label)
		if key == "" || label == "" {
			return NewCodeError(400, "每个字段都需要 key 与 label")
		}
		if _, ok := seen[key]; ok {
			return NewCodeError(400, "字段 key 重复："+key)
		}
		seen[key] = struct{}{}
		if key == "devices" && !strings.EqualFold(strings.TrimSpace(typ), "repeat") &&
			!strings.EqualFold(strings.TrimSpace(typ), "string_array") &&
			!strings.EqualFold(strings.TrimSpace(typ), "device_block") {
			return NewCodeError(400, "字段 key「devices」仅可用于设备列表块、可重复组或多选数组")
		}
		typNorm := strings.ToLower(strings.TrimSpace(typ))
		if typNorm == "repeat" || typNorm == "eqa_block" || typNorm == "assay_block" || typNorm == "device_block" {
			return nil
		}
		target = strings.TrimSpace(target)
		if target == "" {
			return NewCodeError(400, "字段「"+label+"」必须绑定到系统字段目录中的 storage_target")
		}
		if _, ok := catalog[target]; !ok {
			if _, allowed := allowTargets[target]; !allowed {
				return NewCodeError(400, "字段「"+label+"」的映射「"+target+"」不在可采集字段目录中")
			}
		}
		return nil
	}
	hasIdentity := false
	hasDependentBlock := false
	for _, f := range parsed.Fields {
		if err := check(f.Key, f.Label, f.Type, f.Target); err != nil {
			return err
		}
		typNorm := strings.ToLower(strings.TrimSpace(f.Type))
		if typNorm == "eqa_block" || typNorm == "assay_block" || typNorm == "device_block" {
			hasDependentBlock = true
		} else if isHospitalNameSchemaField(schemaFieldMeta{
			Key:           f.Key,
			Label:         f.Label,
			Type:          f.Type,
			Target:        f.Target,
			OptionsSource: f.OptionsSource,
		}) {
			hasIdentity = true
		}
		if strings.EqualFold(strings.TrimSpace(f.Type), "repeat") {
			if len(f.Fields) == 0 {
				return NewCodeError(400, "可重复组「"+strings.TrimSpace(f.Label)+"」至少需要一个子字段")
			}
			for _, c := range f.Fields {
				if err := check(c.Key, c.Label, c.Type, c.Target); err != nil {
					return err
				}
			}
		}
	}
	if hasDependentBlock && !hasIdentity {
		return NewCodeError(400, "设备列表 / 检测项目 / 室间质评属于客户（医院）属性，请先添加「医院名称」字段（绑定 hospital.name）再保存")
	}
	return nil
}

func validateRequiredAnswers(schemaJSON json.RawMessage, answers map[string]any) error {
	var schema struct {
		Fields []struct {
			Key              string   `json:"key"`
			Label            string   `json:"label"`
			Required         bool     `json:"required"`
			Type             string   `json:"type"`
			SubFieldRequired []string `json:"subFieldRequired"`
			// present vs absent: distinguish unset (defaults) from explicit empty.
			rawSubFieldRequired json.RawMessage `json:"-"`
			Fields              []struct {
				Key      string `json:"key"`
				Label    string `json:"label"`
				Required bool   `json:"required"`
			} `json:"fields"`
		} `json:"fields"`
	}
	if len(schemaJSON) > 0 {
		_ = json.Unmarshal(schemaJSON, &schema)
		// Second pass: detect whether subFieldRequired was present on each device_block.
		var raw struct {
			Fields []json.RawMessage `json:"fields"`
		}
		_ = json.Unmarshal(schemaJSON, &raw)
		for i := range schema.Fields {
			if i >= len(raw.Fields) {
				break
			}
			var probe map[string]json.RawMessage
			if json.Unmarshal(raw.Fields[i], &probe) == nil {
				if v, ok := probe["subFieldRequired"]; ok {
					schema.Fields[i].rawSubFieldRequired = v
				}
			}
		}
	}
	missing := make([]string, 0)
	for _, f := range schema.Fields {
		label := f.Label
		if label == "" {
			label = f.Key
		}
		if strings.EqualFold(f.Type, "device_block") {
			rows := extractDeviceAnswers(answers[f.Key])
			if len(rows) == 0 {
				continue
			}
			reqKeys := deviceBlockRequiredKeys(f.SubFieldRequired, f.rawSubFieldRequired != nil)
			for i, row := range rows {
				for _, rk := range reqKeys {
					if !devicePropFilled(row, rk) {
						missing = append(missing, fmt.Sprintf("%s#%d.%s", label, i+1, devicePropLabel(rk)))
					}
				}
			}
			continue
		}
		if !f.Required {
			continue
		}
		if strings.EqualFold(f.Type, "eqa_block") {
			// EQA block: neither/both/one scope is valid; no required scalar.
			continue
		}
		if strings.EqualFold(f.Type, "assay_block") {
			continue
		}
		if strings.EqualFold(f.Type, "repeat") {
			rows := extractDeviceAnswers(answers[f.Key])
			if len(rows) == 0 {
				missing = append(missing, label)
				continue
			}
			for i, row := range rows {
				for _, child := range f.Fields {
					if !child.Required {
						continue
					}
					if anyToString(row[child.Key]) == "" {
						cl := child.Label
						if cl == "" {
							cl = child.Key
						}
						missing = append(missing, fmt.Sprintf("%s#%d.%s", label, i+1, cl))
					}
				}
			}
			continue
		}
		if answerString(answers, f.Key) == "" {
			missing = append(missing, label)
		}
	}
	if len(missing) > 0 {
		return NewCodeError(400, "请填写必填项："+strings.Join(missing, "、"))
	}
	return nil
}

var defaultDeviceSubFieldRequired = []string{"model", "serialNo", "installedAt", "enabledAt"}

var deviceSubFieldLabelMap = map[string]string{
	"brand":                "所属公司",
	"model":                "机型",
	"serialNo":             "序列号",
	"installedAt":          "安装日期",
	"enabledAt":            "到期时间",
	"usageLocation":        "使用位置",
	"assayLineCode":        "所属检测线",
	"itemCodes":            "检测细项覆盖",
	"reagentBrand":         "试剂品牌",
	"monthlySampleVolume":  "月样本量",
	"deptHead":             "科室负责人",
	"channelCsa":           "渠道CSA",
	"serviceEvaluation":    "客户服务评价",
}

func deviceBlockRequiredKeys(configured []string, explicit bool) []string {
	if !explicit {
		return append([]string{}, defaultDeviceSubFieldRequired...)
	}
	allowed := map[string]struct{}{}
	for k := range deviceSubFieldLabelMap {
		allowed[k] = struct{}{}
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(configured))
	for _, raw := range configured {
		k := strings.TrimSpace(raw)
		k = strings.TrimPrefix(k, "devices[].")
		if k == "" {
			continue
		}
		if _, ok := allowed[k]; !ok {
			continue
		}
		if _, dup := seen[k]; dup {
			continue
		}
		seen[k] = struct{}{}
		out = append(out, k)
	}
	return out
}

func devicePropLabel(key string) string {
	if v, ok := deviceSubFieldLabelMap[key]; ok {
		return v
	}
	return key
}

func devicePropFilled(row map[string]any, key string) bool {
	if row == nil {
		return false
	}
	v, ok := row[key]
	if !ok || v == nil {
		return false
	}
	if key == "itemCodes" {
		switch t := v.(type) {
		case []any:
			return len(t) > 0
		case []string:
			return len(t) > 0
		default:
			return anyToString(v) != ""
		}
	}
	return anyToString(v) != ""
}


func isHospitalNameSchemaField(f schemaFieldMeta) bool {
	t := strings.TrimSpace(f.Target)
	if t == "hospital.name" || t == "hospital.archive.customerName" {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(f.OptionsSource), "hospitals") {
		return true
	}
	k := strings.ToLower(strings.TrimSpace(f.Key))
	if k == "name" || k == "hospitalname" || k == "customername" {
		return true
	}
	label := f.Label
	return strings.Contains(label, "客户名称") || strings.Contains(label, "医院名称")
}

func hospitalNameFieldKeys(schemaJSON json.RawMessage) []string {
	out := make([]string, 0)
	for _, f := range parseSchemaFields(schemaJSON) {
		if strings.TrimSpace(f.Key) == "" || strings.EqualFold(strings.TrimSpace(f.Type), "repeat") {
			continue
		}
		if isHospitalNameSchemaField(f) {
			out = append(out, f.Key)
		}
	}
	return uniqueStrings(out)
}

func assignmentEffectiveLockedKeys(a *model.SurveyAssignment) []string {
	locked := effectiveLockedKeys(a.Schema, a.LockedKeys)
	if a != nil && a.HospitalId != nil && *a.HospitalId > 0 {
		locked = uniqueStrings(append(locked, hospitalNameFieldKeys(a.Schema)...))
	}
	return locked
}

func forceAssignedHospitalAnswers(a *model.SurveyAssignment, answers map[string]any) map[string]any {
	if a == nil || a.HospitalId == nil || *a.HospitalId <= 0 {
		return answers
	}
	name := strings.TrimSpace(a.HospitalName)
	if name == "" {
		return answers
	}
	out := map[string]any{}
	for k, v := range answers {
		out[k] = v
	}
	for _, k := range hospitalNameFieldKeys(a.Schema) {
		out[k] = name
	}
	return out
}

// mapHospitalToSchemaAnswers maps hospital columns onto template field keys by target/key.
func mapHospitalToSchemaAnswers(schemaJSON json.RawMessage, h *model.Hospital) map[string]any {
	if h == nil {
		return map[string]any{}
	}
	raw := hospitalPrefillAnswers(h)
	out := map[string]any{}
	for _, f := range parseSchemaFields(schemaJSON) {
		key := strings.TrimSpace(f.Key)
		if key == "" || strings.EqualFold(strings.TrimSpace(f.Type), "repeat") {
			continue
		}
		target := strings.TrimSpace(f.Target)
		var val any
		switch {
		case target == "hospital.name" || target == "hospital.archive.customerName":
			val = h.Name
		case strings.HasPrefix(target, "hospital.archive."):
			ak := strings.TrimPrefix(target, "hospital.archive.")
			if v, ok := raw[ak]; ok {
				val = v
			}
		case strings.HasPrefix(target, "hospital.attributes."), strings.HasPrefix(target, "hospital.metrics."):
			// attributes/metrics are not part of hospitalPrefillAnswers
		case strings.HasPrefix(target, "hospital."):
			col := strings.TrimPrefix(target, "hospital.")
			if v, ok := raw[col]; ok {
				val = v
			}
		default:
			if v, ok := raw[key]; ok {
				val = v
			}
		}
		if isHospitalNameSchemaField(f) && anyToString(val) == "" {
			val = h.Name
		}
		if anyToString(val) != "" {
			out[key] = val
		}
	}
	if schemaHasDevicesRepeat(schemaJSON) {
		if _, ok := out["devices"]; !ok {
			out["devices"] = []any{}
		}
	}
	return out
}

func hospitalPrefillAnswers(h *model.Hospital) map[string]any {
	out := map[string]any{
		"name":     h.Name,
		"province": h.Province,
		"city":     h.City,
		"level":    h.Level,
		"type":     h.Type,
	}
	if h.District != "" {
		out["district"] = h.District
	}
	if h.Address != "" {
		out["address"] = h.Address
	}
	if h.Archive != nil {
		for _, k := range []string{"region", "branchOffice", "customerCode", "customerName", "contactName", "contactPhone"} {
			if v := archiveString(h.Archive, k); v != "" {
				out[k] = v
			}
		}
	}
	return out
}

// filterPrefillBySchema keeps only keys declared in the template schema.
// devices[] is injected only when the schema has a repeat field named "devices".
func filterPrefillBySchema(schemaJSON json.RawMessage, prefill map[string]any) map[string]any {
	keys := schemaFieldKeySet(schemaJSON)
	out := map[string]any{}
	if len(keys) == 0 {
		// No fields declared: do not dump hospital columns into answers.
		if schemaHasDevicesRepeat(schemaJSON) {
			out["devices"] = []any{}
		}
		return out
	}
	for k, v := range prefill {
		if _, ok := keys[k]; ok {
			out[k] = v
		}
	}
	if schemaHasDevicesRepeat(schemaJSON) {
		if _, ok := out["devices"]; !ok {
			out["devices"] = []any{}
		}
	}
	return out
}

// pruneAnswersToSchema drops answer keys that are not part of the template schema,
// so collectors / review UI never see hospital-prefill leftovers from other templates.
func pruneAnswersToSchema(schemaJSON json.RawMessage, answers map[string]any) map[string]any {
	keys := schemaFieldKeySet(schemaJSON)
	if len(keys) == 0 {
		return map[string]any{}
	}
	out := map[string]any{}
	for k, v := range answers {
		if _, ok := keys[k]; ok {
			out[k] = v
		}
	}
	return out
}

func extractDeviceAnswers(raw any) []map[string]any {
	out := []map[string]any{}
	if raw == nil {
		return out
	}
	// device_block answer shape: { devices: [ {...}, ... ] }
	if m, ok := raw.(map[string]any); ok {
		if inner, has := m["devices"]; has {
			return extractDeviceAnswers(inner)
		}
		// single device row object
		if _, hasModel := m["model"]; hasModel {
			return []map[string]any{m}
		}
		return out
	}
	switch t := raw.(type) {
	case []any:
		for _, item := range t {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
	case []map[string]any:
		return t
	}
	return out
}

func answerString(answers map[string]any, key string) string {
	if answers == nil {
		return ""
	}
	return anyToString(answers[key])
}

func anyToString(v any) string {
	if v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		return strings.TrimSpace(fmt.Sprintf("%v", t))
	case json.Number:
		return strings.TrimSpace(t.String())
	case bool:
		if t {
			return "true"
		}
		return "false"
	default:
		s := strings.TrimSpace(fmt.Sprint(t))
		if s == "<nil>" {
			return ""
		}
		return s
	}
}

func uniquePreserve(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, v := range in {
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

func parseFlexibleDate(raw string) (time.Time, error) {
	raw = strings.TrimSpace(raw)
	layouts := []string{"2006-01-02", "2006/01/02", time.RFC3339, "2006-01-02T15:04:05"}
	var last error
	for _, layout := range layouts {
		t, err := time.ParseInLocation(layout, raw, time.Local)
		if err == nil {
			return t, nil
		}
		last = err
	}
	return time.Time{}, last
}

func archiveString(archive map[string]any, key string) string {
	if archive == nil {
		return ""
	}
	v, ok := archive[key]
	if !ok || v == nil {
		return ""
	}
	return anyToString(v)
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
	Key           string `json:"key"`
	Type          string `json:"type"`
	Default       string `json:"default"`
	Locked        bool   `json:"locked"`
	Target        string `json:"target"`
	Label         string `json:"label"`
	OptionsSource string `json:"optionsSource"`
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

func schemaFieldKeySet(schemaJSON json.RawMessage) map[string]struct{} {
	out := map[string]struct{}{}
	for _, f := range parseSchemaFields(schemaJSON) {
		k := strings.TrimSpace(f.Key)
		if k != "" {
			out[k] = struct{}{}
		}
	}
	return out
}

func schemaTargetSet(schemaJSON json.RawMessage) map[string]struct{} {
	out := map[string]struct{}{}
	for _, f := range parseSchemaFields(schemaJSON) {
		t := strings.TrimSpace(f.Target)
		if t != "" {
			out[t] = struct{}{}
		}
		if strings.EqualFold(strings.TrimSpace(f.Type), "repeat") {
			// nested targets not in schemaFieldMeta; ignore — repeat child
			// targets are validated against the active catalog on create/update.
		}
	}
	return out
}

func schemaHasDevicesRepeat(schemaJSON json.RawMessage) bool {
	for _, f := range parseSchemaFields(schemaJSON) {
		if strings.EqualFold(strings.TrimSpace(f.Type), "repeat") &&
			strings.TrimSpace(f.Key) == "devices" {
			return true
		}
	}
	return false
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
func mergePrefillAnswers(schemaJSON json.RawMessage, campaignDefaults map[string]string, saved map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range mergeTemplateDefaults(schemaJSON, campaignDefaults) {
		out[k] = v
	}
	for k, v := range saved {
		out[k] = v
	}
	if schemaHasDevicesRepeat(schemaJSON) {
		if _, ok := out["devices"]; !ok {
			out["devices"] = []any{}
		}
	}
	return out
}

func applyLockedAnswers(schemaJSON json.RawMessage, campaignDefaults map[string]string, campaignLocked []string, answers map[string]any) map[string]any {
	prefill := mergeTemplateDefaults(schemaJSON, campaignDefaults)
	lockedSet := map[string]struct{}{}
	for _, k := range effectiveLockedKeys(schemaJSON, campaignLocked) {
		lockedSet[k] = struct{}{}
	}
	out := map[string]any{}
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

// go-zero httpx cannot bind JSON objects into json.RawMessage; requests use map[string]any.
func marshalSchemaMap(schema map[string]any) ([]byte, error) {
	if schema == nil {
		return nil, nil
	}
	return json.Marshal(schema)
}
