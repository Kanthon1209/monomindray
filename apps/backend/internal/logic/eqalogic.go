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

	"github.com/zeromicro/go-zero/core/logx"
)

type EqaLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewEqaLogic(ctx context.Context, svcCtx *svc.ServiceContext) *EqaLogic {
	return &EqaLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *EqaLogic) ListFields() (*types.EqaFieldTreeResponse, error) {
	if _, err := authx.UserIDFromCtx(l.ctx); err != nil {
		return nil, ErrUnauthorized
	}
	rows, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		l.Errorf("list fields: %v", err)
		return nil, ErrInternal
	}
	nodes := make([]types.EqaFieldNode, 0, len(rows))
	byCode := map[string]*types.EqaFieldNode{}
	for _, r := range rows {
		var enums []string
		_ = json.Unmarshal(r.EnumValues, &enums)
		if enums == nil {
			enums = []string{}
		}
		n := types.EqaFieldNode{
			Code: r.Code, Name: r.Name, ValueType: r.ValueType,
			EnumValues: enums, SortOrder: int64(r.SortOrder), Children: []types.EqaFieldNode{},
		}
		if r.ParentCode != nil {
			n.ParentCode = *r.ParentCode
		}
		nodes = append(nodes, n)
	}
	for i := range nodes {
		byCode[nodes[i].Code] = &nodes[i]
	}
	roots := make([]types.EqaFieldNode, 0)
	for i := range nodes {
		n := &nodes[i]
		if n.ParentCode != "" {
			if p, ok := byCode[n.ParentCode]; ok {
				p.Children = append(p.Children, *n)
				continue
			}
		}
		roots = append(roots, *n)
	}
	// rebuild children pointers after copy — flatten rebuild
	roots = buildFieldTree(rows)
	return &types.EqaFieldTreeResponse{Items: roots}, nil
}

func buildFieldTree(rows []model.FieldRegistry) []types.EqaFieldNode {
	type wrap struct {
		node     types.EqaFieldNode
		parent   string
		children []*wrap
	}
	all := make([]*wrap, 0, len(rows))
	byCode := map[string]*wrap{}
	for _, r := range rows {
		var enums []string
		_ = json.Unmarshal(r.EnumValues, &enums)
		if enums == nil {
			enums = []string{}
		}
		w := &wrap{node: types.EqaFieldNode{
			Code: r.Code, Name: r.Name, ValueType: r.ValueType,
			EnumValues: enums, SortOrder: int64(r.SortOrder), Children: []types.EqaFieldNode{},
		}}
		if r.ParentCode != nil {
			w.parent = *r.ParentCode
			w.node.ParentCode = *r.ParentCode
		}
		all = append(all, w)
		byCode[r.Code] = w
	}
	roots := make([]*wrap, 0)
	for _, w := range all {
		if w.parent != "" {
			if p, ok := byCode[w.parent]; ok {
				p.children = append(p.children, w)
				continue
			}
		}
		roots = append(roots, w)
	}
	var flatten func(*wrap) types.EqaFieldNode
	flatten = func(w *wrap) types.EqaFieldNode {
		n := w.node
		n.Children = make([]types.EqaFieldNode, 0, len(w.children))
		for _, c := range w.children {
			n.Children = append(n.Children, flatten(c))
		}
		return n
	}
	out := make([]types.EqaFieldNode, 0, len(roots))
	for _, r := range roots {
		out = append(out, flatten(r))
	}
	return out
}

func (l *EqaLogic) Dashboard(req *types.EqaDashboardRequest) (*types.EqaDashboardResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	stats, err := l.svcCtx.EqaModel.Dashboard(l.ctx, int(req.Year))
	if err != nil {
		l.Errorf("dashboard: %v", err)
		return nil, ErrInternal
	}
	resp := &types.EqaDashboardResponse{
		Year: req.Year, TotalParticipations: stats.TotalParticipations,
		CoverageHospitals: stats.CoverageHospitals,
		ByScope: make([]types.EqaScopeCount, 0), TopItems: make([]types.EqaItemCount, 0),
		OwnerProgress: make([]types.EqaOwnerProgress, 0),
	}
	if resp.Year <= 0 {
		resp.Year = int64(time.Now().Year())
	}
	for _, s := range stats.ByScope {
		resp.ByScope = append(resp.ByScope, types.EqaScopeCount{Scope: s.Scope, Count: s.Count})
	}
	for _, s := range stats.TopItems {
		resp.TopItems = append(resp.TopItems, types.EqaItemCount{FieldCode: s.FieldCode, FieldName: s.FieldName, Count: s.Count})
	}
	for _, s := range stats.OwnerProgress {
		op := types.EqaOwnerProgress{OwnerName: s.OwnerName, Participation: s.Participation, ItemCount: s.ItemCount}
		if s.OwnerUserId != nil {
			op.OwnerUserId = *s.OwnerUserId
		}
		resp.OwnerProgress = append(resp.OwnerProgress, op)
	}
	return resp, nil
}

func (l *EqaLogic) ListParticipations(req *types.ListEqaParticipationsRequest) (*types.ListEqaParticipationsResponse, error) {
	role := authx.RoleFromCtx(l.ctx)
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	ownerID := req.OwnerUserId
	if role != "admin" {
		ownerID = uid // collectors only see own
	}
	page, pageSize := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}
	items, total, err := l.svcCtx.EqaModel.ListParticipations(l.ctx, int(req.Year), strings.TrimSpace(req.Scope), req.HospitalId, ownerID, int(pageSize), int((page-1)*pageSize))
	if err != nil {
		l.Errorf("list participations: %v", err)
		return nil, ErrInternal
	}
	out := make([]types.EqaParticipationInfo, 0, len(items))
	for i := range items {
		out = append(out, toEqaParticipationInfo(&items[i], nil))
	}
	return &types.ListEqaParticipationsResponse{Total: total, Items: out}, nil
}

func (l *EqaLogic) GetParticipation(id int64) (*types.EqaParticipationResponse, error) {
	if _, err := authx.UserIDFromCtx(l.ctx); err != nil {
		return nil, ErrUnauthorized
	}
	p, err := l.svcCtx.EqaModel.FindParticipation(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if p == nil {
		return nil, NewCodeError(404, "参评记录不存在")
	}
	if err := l.guardParticipationAccess(p); err != nil {
		return nil, err
	}
	items, err := l.svcCtx.EqaModel.ListItems(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	infoItems := make([]types.EqaParticipationItemInfo, 0, len(items))
	for i := range items {
		infoItems = append(infoItems, types.EqaParticipationItemInfo{
			Id: items[i].Id, FieldCode: items[i].FieldCode, FieldName: items[i].FieldName, Value: items[i].Value,
		})
	}
	return &types.EqaParticipationResponse{Participation: toEqaParticipationInfo(p, infoItems)}, nil
}

func (l *EqaLogic) CreateParticipation(req *types.CreateEqaParticipationRequest) (*types.EqaParticipationResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, _ := authx.UserIDFromCtx(l.ctx)
	scope := strings.TrimSpace(req.Scope)
	if scope != "national" && scope != "provincial" {
		return nil, NewCodeError(400, "scope 须为 national 或 provincial")
	}
	if req.HospitalId <= 0 || req.Year < 2000 {
		return nil, NewCodeError(400, "请填写有效的医院与年份")
	}
	h, err := l.svcCtx.HospitalModel.FindById(l.ctx, req.HospitalId)
	if err != nil || h == nil {
		return nil, NewCodeError(404, "医院不存在")
	}
	existing, err := l.svcCtx.EqaModel.FindParticipationByKey(l.ctx, req.HospitalId, int(req.Year), scope)
	if err != nil {
		return nil, ErrInternal
	}
	if existing != nil {
		return nil, NewCodeError(409, "该医院该年该范围参评记录已存在")
	}
	var owner *int64
	if req.OwnerUserId > 0 {
		owner = &req.OwnerUserId
	}
	p, err := l.svcCtx.EqaModel.CreateParticipation(l.ctx, &model.EqaParticipation{
		HospitalId: req.HospitalId, Year: int(req.Year), Scope: scope, Tags: req.Tags, OwnerUserId: owner,
	})
	if err != nil {
		l.Errorf("create: %v", err)
		return nil, ErrInternal
	}
	if len(req.Items) > 0 {
		items := make([]model.EqaParticipationItem, 0, len(req.Items))
		for _, it := range req.Items {
			code := strings.TrimSpace(it.FieldCode)
			if code == "" {
				continue
			}
			items = append(items, model.EqaParticipationItem{FieldCode: code, Value: it.Value})
		}
		if err := l.svcCtx.EqaModel.ReplaceItems(l.ctx, p.Id, items); err != nil {
			l.Errorf("items: %v", err)
			return nil, ErrInternal
		}
	}
	hid, pid := p.HospitalId, p.Id
	_ = l.svcCtx.EqaModel.AddChangeLog(l.ctx, &pid, &hid, uid, "create", map[string]any{"year": p.Year, "scope": p.Scope})
	return l.GetParticipation(p.Id)
}

func (l *EqaLogic) UpdateParticipation(id int64, req *types.UpdateEqaParticipationRequest) (*types.EqaParticipationResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, _ := authx.UserIDFromCtx(l.ctx)
	p, err := l.svcCtx.EqaModel.FindParticipation(l.ctx, id)
	if err != nil || p == nil {
		return nil, NewCodeError(404, "参评记录不存在")
	}
	year := p.Year
	if req.Year > 0 {
		year = int(req.Year)
	}
	scope := p.Scope
	if s := strings.TrimSpace(req.Scope); s != "" {
		if s != "national" && s != "provincial" {
			return nil, NewCodeError(400, "无效 scope")
		}
		scope = s
	}
	owner := p.OwnerUserId
	if req.OwnerUserId > 0 {
		owner = &req.OwnerUserId
	} else if req.ClearOwner {
		owner = nil
	}
	tags := p.Tags
	if req.Tags != nil {
		tags = req.Tags
	}
	updated, err := l.svcCtx.EqaModel.UpdateParticipation(l.ctx, &model.EqaParticipation{
		Id: id, Year: year, Scope: scope, Tags: tags, OwnerUserId: owner,
	})
	if err != nil {
		return nil, ErrInternal
	}
	if req.Items != nil {
		items := make([]model.EqaParticipationItem, 0, len(req.Items))
		for _, it := range req.Items {
			code := strings.TrimSpace(it.FieldCode)
			if code == "" {
				continue
			}
			items = append(items, model.EqaParticipationItem{FieldCode: code, Value: it.Value})
		}
		if err := l.svcCtx.EqaModel.ReplaceItems(l.ctx, id, items); err != nil {
			return nil, ErrInternal
		}
	}
	hid, pid := updated.HospitalId, updated.Id
	_ = l.svcCtx.EqaModel.AddChangeLog(l.ctx, &pid, &hid, uid, "update", map[string]any{"year": year, "scope": scope})
	return l.GetParticipation(id)
}

func (l *EqaLogic) DeleteParticipation(id int64) (*types.OkResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, _ := authx.UserIDFromCtx(l.ctx)
	p, err := l.svcCtx.EqaModel.FindParticipation(l.ctx, id)
	if err != nil || p == nil {
		return nil, NewCodeError(404, "参评记录不存在")
	}
	hid, pid := p.HospitalId, p.Id
	if err := l.svcCtx.EqaModel.DeleteParticipation(l.ctx, id); err != nil {
		return nil, ErrInternal
	}
	_ = l.svcCtx.EqaModel.AddChangeLog(l.ctx, &pid, &hid, uid, "delete", map[string]any{})
	return &types.OkResponse{Ok: true}, nil
}

func (l *EqaLogic) EnsureEqaTemplate() (*types.SurveyTemplateResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	const code = "eqa_participation"
	existing, err := l.svcCtx.SurveyModel.FindTemplateByCode(l.ctx, code)
	if err != nil {
		return nil, ErrInternal
	}
	schema, err := l.buildEqaSchema()
	if err != nil {
		return nil, err
	}
	if existing != nil {
		t, err := l.svcCtx.SurveyModel.UpdateTemplate(l.ctx, existing.Id, "室间质评参评采集", "根据字段注册表生成的 EQA 勾选问卷", "active", schema, true)
		if err != nil {
			return nil, ErrInternal
		}
		return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(t)}, nil
	}
	t, err := l.svcCtx.SurveyModel.CreateTemplate(l.ctx, &model.SurveyTemplate{
		Code: code, Title: "室间质评参评采集", Description: "根据字段注册表生成的 EQA 勾选问卷",
		Schema: schema, Status: "active", CreatedBy: &uid,
	})
	if err != nil {
		l.Errorf("insert template: %v", err)
		return nil, ErrInternal
	}
	return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(t)}, nil
}

func (l *EqaLogic) buildEqaSchema() (json.RawMessage, error) {
	rows, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		return nil, err
	}
	byCode := map[string]model.FieldRegistry{}
	for _, r := range rows {
		byCode[r.Code] = r
	}
	type field struct {
		Key      string   `json:"key"`
		Label    string   `json:"label"`
		Section  string   `json:"section"`
		Type     string   `json:"type"`
		Target   string   `json:"target"`
		Required bool     `json:"required"`
		Options  []string `json:"options,omitempty"`
	}
	fields := []field{
		{Key: "eqa_year", Label: "参评年份", Section: "基本信息", Type: "number", Target: "eqa.year", Required: true},
		{Key: "eqa_scope", Label: "参评范围", Section: "基本信息", Type: "enum", Target: "eqa.scope", Required: true, Options: []string{"national", "provincial"}},
	}
	for _, r := range rows {
		if r.ValueType == "group" {
			continue
		}
		section := "其他"
		if r.ParentCode != nil {
			if p, ok := byCode[*r.ParentCode]; ok {
				section = p.Name
			}
		}
		ftype := r.ValueType
		if ftype == "boolean" {
			ftype = "boolean"
		}
		var enums []string
		_ = json.Unmarshal(r.EnumValues, &enums)
		fields = append(fields, field{
			Key: r.Code, Label: r.Name, Section: section, Type: ftype,
			Target: "eqa.field." + r.Code, Options: enums,
		})
	}
	sections := []string{"基本信息"}
	seen := map[string]bool{"基本信息": true}
	for _, f := range fields {
		if !seen[f.Section] {
			sections = append(sections, f.Section)
			seen[f.Section] = true
		}
	}
	payload := map[string]any{"fields": fields, "sections": sections}
	b, err := json.Marshal(payload)
	return json.RawMessage(b), err
}

func (l *EqaLogic) guardParticipationAccess(p *model.EqaParticipation) error {
	role := authx.RoleFromCtx(l.ctx)
	if role == "admin" {
		return nil
	}
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return ErrUnauthorized
	}
	if p.OwnerUserId != nil && *p.OwnerUserId == uid {
		return nil
	}
	return ErrForbidden
}

func toEqaParticipationInfo(p *model.EqaParticipation, items []types.EqaParticipationItemInfo) types.EqaParticipationInfo {
	info := types.EqaParticipationInfo{
		Id: p.Id, HospitalId: p.HospitalId, HospitalName: p.HospitalName,
		Year: int64(p.Year), Scope: p.Scope, Tags: p.Tags, ItemCount: p.ItemCount,
		CreatedAt: formatTime(p.CreatedAt), UpdatedAt: formatTime(p.UpdatedAt),
		Items: items,
	}
	if info.Tags == nil {
		info.Tags = []string{}
	}
	if items == nil {
		info.Items = []types.EqaParticipationItemInfo{}
	}
	if p.OwnerUserId != nil {
		info.OwnerUserId = *p.OwnerUserId
		info.OwnerName = p.OwnerName
	}
	return info
}

// WritebackFromSurveyAnswers upserts EQA participation from approved survey answers.
func (l *EqaLogic) WritebackFromSurveyAnswers(actorID, hospitalID int64, answers map[string]any) error {
	if hospitalID <= 0 || answers == nil {
		return nil
	}
	year := int(anyToInt64(answers["eqa_year"]))
	if year <= 0 {
		year = time.Now().Year()
	}
	scope := strings.TrimSpace(anyToString(answers["eqa_scope"]))
	if scope != "national" && scope != "provincial" {
		// infer from answered field codes
		for k, v := range answers {
			if truthy(v) && strings.HasPrefix(k, "national.") {
				scope = "national"
				break
			}
			if truthy(v) && strings.HasPrefix(k, "provincial.") {
				scope = "provincial"
				break
			}
		}
	}
	if scope != "national" && scope != "provincial" {
		return nil // not an EQA survey
	}

	p, err := l.svcCtx.EqaModel.FindParticipationByKey(l.ctx, hospitalID, year, scope)
	if err != nil {
		return err
	}
	if p == nil {
		owner := actorID
		p, err = l.svcCtx.EqaModel.CreateParticipation(l.ctx, &model.EqaParticipation{
			HospitalId: hospitalID, Year: year, Scope: scope, OwnerUserId: &owner,
		})
		if err != nil {
			return err
		}
	}
	fields, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		return err
	}
	items := make([]model.EqaParticipationItem, 0)
	for _, f := range fields {
		if f.ValueType == "group" || f.ValueType == "enum" || f.ValueType == "text" || f.ValueType == "number" {
			// boolean participation items only for boolean fields
			if f.ValueType != "boolean" {
				continue
			}
		}
		if f.ValueType != "boolean" {
			continue
		}
		v, ok := answers[f.Code]
		if !ok {
			continue
		}
		items = append(items, model.EqaParticipationItem{FieldCode: f.Code, Value: truthy(v)})
	}
	if len(items) > 0 {
		if err := l.svcCtx.EqaModel.ReplaceItems(l.ctx, p.Id, items); err != nil {
			return err
		}
	}
	pid, hid := p.Id, hospitalID
	return l.svcCtx.EqaModel.AddChangeLog(l.ctx, &pid, &hid, actorID, "survey_approve_writeback", map[string]any{
		"year": year, "scope": scope, "itemCount": len(items),
	})
}

func truthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		s := strings.TrimSpace(strings.ToLower(t))
		return s == "1" || s == "true" || s == "yes" || s == "是" || s == "on"
	case float64:
		return t != 0
	case int:
		return t != 0
	case int64:
		return t != 0
	default:
		return false
	}
}

func anyToInt64(v any) int64 {
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case int:
		return int64(t)
	case string:
		var n int64
		_, _ = fmtSscanf(t, &n)
		return n
	default:
		return 0
	}
}

func fmtSscanf(s string, n *int64) (int, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	var x int64
	for _, c := range s {
		if c < '0' || c > '9' {
			break
		}
		x = x*10 + int64(c-'0')
	}
	*n = x
	return 1, nil
}
