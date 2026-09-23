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
	items, err := l.svcCtx.SurveyModel.ListTemplates(l.ctx, true)
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
		t, err := time.Parse(time.RFC3339, strings.TrimSpace(req.DueAt))
		if err != nil {
			return nil, NewCodeError(400, "截止时间格式无效，请使用 RFC3339")
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
	}
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
	info := toSurveyAssignmentInfo(a, answers, note)
	return &types.SurveyAssignmentResponse{Assignment: info}, nil
}

func (l *SurveyLogic) SaveDraft(id int64, req *types.SaveSurveyAnswersRequest) (*types.SurveySubmissionResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if _, err := l.ensureAssignee(id, uid); err != nil {
		return nil, err
	}
	sub, err := l.svcCtx.SurveyModel.UpsertDraft(l.ctx, id, uid, normalizeAnswers(req.Answers), req.HospitalId)
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
	answers := normalizeAnswers(req.Answers)
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
	return l.review(id, "approved", req.Note)
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
