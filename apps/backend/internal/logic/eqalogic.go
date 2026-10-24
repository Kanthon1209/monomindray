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
			EnumValues: enums, SortOrder: int64(r.SortOrder), UsageCount: r.UsageCount,
			Children: []types.EqaFieldNode{},
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
			EnumValues: enums, SortOrder: int64(r.SortOrder), UsageCount: r.UsageCount,
			Children: []types.EqaFieldNode{},
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

func toEqaFieldNode(r *model.FieldRegistry) types.EqaFieldNode {
	var enums []string
	_ = json.Unmarshal(r.EnumValues, &enums)
	if enums == nil {
		enums = []string{}
	}
	n := types.EqaFieldNode{
		Code: r.Code, Name: r.Name, ValueType: r.ValueType,
		EnumValues: enums, SortOrder: int64(r.SortOrder), UsageCount: r.UsageCount,
		Children: []types.EqaFieldNode{},
	}
	if r.ParentCode != nil {
		n.ParentCode = *r.ParentCode
	}
	return n
}

func (l *EqaLogic) CreateField(req *types.EqaFieldUpsertRequest) (*types.EqaFieldResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	f, err := l.svcCtx.EqaModel.CreateField(l.ctx, model.FieldRegistryInput{
		Code: req.Code, Name: req.Name, ValueType: req.ValueType,
		ParentCode: req.ParentCode, EnumValues: req.EnumValues, SortOrder: req.SortOrder,
	})
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "duplicate") || strings.Contains(msg, "unique") {
			return nil, NewCodeError(409, "科目编码已存在")
		}
		if strings.Contains(msg, "不能") || strings.Contains(msg, "必须") ||
			strings.Contains(msg, "不存在") || strings.Contains(msg, "无效") {
			return nil, NewCodeError(400, msg)
		}
		l.Errorf("create eqa field: %v", err)
		return nil, ErrInternal
	}
	return &types.EqaFieldResponse{Field: toEqaFieldNode(f)}, nil
}

func (l *EqaLogic) UpdateField(code string, req *types.EqaFieldUpsertRequest) (*types.EqaFieldResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, NewCodeError(400, "编码不能为空")
	}
	f, err := l.svcCtx.EqaModel.UpdateField(l.ctx, code, model.FieldRegistryInput{
		Code: code, Name: req.Name, ValueType: req.ValueType,
		ParentCode: req.ParentCode, EnumValues: req.EnumValues, SortOrder: req.SortOrder,
	})
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "不能") || strings.Contains(msg, "必须") ||
			strings.Contains(msg, "不存在") || strings.Contains(msg, "无效") {
			return nil, NewCodeError(400, msg)
		}
		l.Errorf("update eqa field: %v", err)
		return nil, ErrInternal
	}
	if f == nil {
		return nil, NewCodeError(404, "科目不存在")
	}
	return &types.EqaFieldResponse{Field: toEqaFieldNode(f)}, nil
}

func (l *EqaLogic) DeleteField(code string) error {
	if err := requireAdminCtx(l.ctx); err != nil {
		return err
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return NewCodeError(400, "编码不能为空")
	}
	if err := l.svcCtx.EqaModel.DeleteField(l.ctx, code); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "子科目") || strings.Contains(msg, "引用") ||
			strings.Contains(msg, "不存在") {
			return NewCodeError(400, msg)
		}
		l.Errorf("delete eqa field: %v", err)
		return ErrInternal
	}
	return nil
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
		ByScope:           make([]types.EqaScopeCount, 0), TopItems: make([]types.EqaItemCount, 0),
		OwnerProgress: make([]types.EqaOwnerProgress, 0),
	}
	if resp.Year <= 0 {
		resp.Year = int64(time.Now().Year())
	}
	{
		scopeCount := map[string]int64{"national": 0, "provincial": 0}
		for _, s := range stats.ByScope {
			scope := strings.TrimSpace(s.Scope)
			if scope == "" {
				continue
			}
			scopeCount[scope] = s.Count
		}
		for _, scope := range []string{"national", "provincial"} {
			resp.ByScope = append(resp.ByScope, types.EqaScopeCount{Scope: scope, Count: scopeCount[scope]})
		}
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
		t, err := l.svcCtx.SurveyModel.UpdateTemplate(l.ctx, existing.Id, "室间质评参评采集", "EQA 复合块：国考/省考可选，科目来自字段注册表", "active", schema, true)
		if err != nil {
			return nil, ErrInternal
		}
		return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(t)}, nil
	}
	t, err := l.svcCtx.SurveyModel.CreateTemplate(l.ctx, &model.SurveyTemplate{
		Code: code, Title: "室间质评参评采集", Description: "EQA 复合块：国考/省考可选，科目来自字段注册表",
		Schema: schema, Status: "active", CreatedBy: &uid,
	})
	if err != nil {
		l.Errorf("insert template: %v", err)
		return nil, ErrInternal
	}
	return &types.SurveyTemplateResponse{Template: toSurveyTemplateInfo(t)}, nil
}

func (l *EqaLogic) buildEqaSchema() (json.RawMessage, error) {
	levelOptions := []string{"V1", "V2", "V3", "非V"}
	if cf, err := l.svcCtx.CollectableFieldModel.FindByStorageTarget(l.ctx, "hospital.attributes.customer_level"); err == nil && cf != nil {
		var enums []string
		if json.Unmarshal(cf.EnumValues, &enums) == nil && len(enums) > 0 {
			levelOptions = enums
		}
	}

	type field struct {
		Key              string   `json:"key"`
		Label            string   `json:"label"`
		Section          string   `json:"section"`
		Type             string   `json:"type"`
		Target           string   `json:"target"`
		Required         bool     `json:"required"`
		Options          []string `json:"options,omitempty"`
		OptionsSource    string   `json:"optionsSource,omitempty"`
		EnableNational   *bool    `json:"enableNational,omitempty"`
		EnableProvincial *bool    `json:"enableProvincial,omitempty"`
	}
	enNat, enProv := true, true
	fields := []field{
		{
			Key: "hospital_name", Label: "医院名称", Section: "基本信息", Type: "text",
			Target: "hospital.name", Required: true, OptionsSource: "hospitals",
		},
		{
			Key: "customer_level", Label: "客户等级", Section: "基本信息", Type: "enum",
			Target: "hospital.attributes.customer_level", Options: levelOptions,
		},
		{
			Key: "eqa", Label: "室间质评", Section: "室间质评", Type: "eqa_block",
			Target: "eqa.block", EnableNational: &enNat, EnableProvincial: &enProv,
		},
	}
	payload := map[string]any{
		"fields":   fields,
		"sections": []string{"基本信息", "室间质评"},
	}
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

// EqaScopeUpsert is one exam scope (national / provincial) for dual-scope writeback.
type EqaScopeUpsert struct {
	Participating bool
	Codes         []string
}

// EqaHospitalUpsert is the domain payload for a hospital × year EQA snapshot.
type EqaHospitalUpsert struct {
	Year       int
	National   *EqaScopeUpsert
	Provincial *EqaScopeUpsert
}

// UpsertHospitalEQA writes national and/or provincial participation for one hospital×year.
// participating=false deletes that scope's participation row (if any).
// Codes must belong to the matching field_registry parent (scope.national / scope.provincial).
func (l *EqaLogic) UpsertHospitalEQA(actorID, hospitalID int64, payload EqaHospitalUpsert) error {
	if hospitalID <= 0 {
		return nil
	}
	year := payload.Year
	if year <= 0 {
		year = time.Now().Year()
	}
	fields, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		return err
	}
	allowed := map[string]map[string]struct{}{
		"national":   {},
		"provincial": {},
	}
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

	applyScope := func(scope string, part *EqaScopeUpsert) error {
		if part == nil {
			return nil
		}
		existing, err := l.svcCtx.EqaModel.FindParticipationByKey(l.ctx, hospitalID, year, scope)
		if err != nil {
			return err
		}
		clear := func() error {
			if existing == nil {
				return nil
			}
			hid, pid := hospitalID, existing.Id
			if err := l.svcCtx.EqaModel.DeleteParticipation(l.ctx, existing.Id); err != nil {
				return err
			}
			_ = l.svcCtx.EqaModel.AddChangeLog(l.ctx, &pid, &hid, actorID, "survey_approve_clear", map[string]any{
				"year": year, "scope": scope,
			})
			return nil
		}
		if !part.Participating {
			return clear()
		}
		// validate codes; empty after filter ⇒ not participating
		codes := make([]string, 0, len(part.Codes))
		seen := map[string]struct{}{}
		allow := allowed[scope]
		for _, c := range part.Codes {
			c = strings.TrimSpace(c)
			if c == "" {
				continue
			}
			if _, ok := allow[c]; !ok {
				return NewCodeError(400, "无效 EQA 科目："+c)
			}
			if _, ok := seen[c]; ok {
				continue
			}
			seen[c] = struct{}{}
			codes = append(codes, c)
		}
		if len(codes) == 0 {
			return clear()
		}
		p := existing
		if p == nil {
			owner := actorID
			p, err = l.svcCtx.EqaModel.CreateParticipation(l.ctx, &model.EqaParticipation{
				HospitalId: hospitalID, Year: year, Scope: scope, OwnerUserId: &owner,
			})
			if err != nil {
				return err
			}
		}
		items := make([]model.EqaParticipationItem, 0, len(codes))
		for _, c := range codes {
			items = append(items, model.EqaParticipationItem{FieldCode: c, Value: true})
		}
		if err := l.svcCtx.EqaModel.ReplaceItems(l.ctx, p.Id, items); err != nil {
			return err
		}
		pid, hid := p.Id, hospitalID
		return l.svcCtx.EqaModel.AddChangeLog(l.ctx, &pid, &hid, actorID, "survey_approve_writeback", map[string]any{
			"year": year, "scope": scope, "itemCount": len(items),
		})
	}

	if err := applyScope("national", payload.National); err != nil {
		return err
	}
	if err := applyScope("provincial", payload.Provincial); err != nil {
		return err
	}
	return nil
}

// WritebackFromSurveyAnswers upserts EQA participation from approved survey answers.
// Prefers structured eqa_block answer; falls back to legacy flat eqa_scope + boolean fields.
func (l *EqaLogic) WritebackFromSurveyAnswers(actorID, hospitalID int64, answers map[string]any) error {
	if hospitalID <= 0 || answers == nil {
		return nil
	}
	if payload, ok := extractEqaBlockUpsert(answers); ok {
		return l.UpsertHospitalEQA(actorID, hospitalID, payload)
	}
	return l.writebackLegacyFlat(actorID, hospitalID, answers)
}

func extractEqaBlockUpsert(answers map[string]any) (EqaHospitalUpsert, bool) {
	var raw any
	if v, ok := answers["eqa"]; ok && v != nil {
		raw = v
	} else {
		for _, v := range answers {
			m, ok := v.(map[string]any)
			if !ok {
				continue
			}
			// Heuristic: object with national/provincial keys
			_, hasN := m["national"]
			_, hasP := m["provincial"]
			if hasN || hasP {
				raw = v
				break
			}
		}
	}
	if raw == nil {
		return EqaHospitalUpsert{}, false
	}
	m, ok := raw.(map[string]any)
	if !ok {
		return EqaHospitalUpsert{}, false
	}
	_, hasN := m["national"]
	_, hasP := m["provincial"]
	if !hasN && !hasP && m["year"] == nil {
		return EqaHospitalUpsert{}, false
	}
	out := EqaHospitalUpsert{Year: int(anyToInt64(m["year"]))}
	if hasN {
		out.National = parseScopeUpsert(m["national"])
	}
	if hasP {
		out.Provincial = parseScopeUpsert(m["provincial"])
	}
	// If both nil pointers somehow, still treat as block present with neither participating
	if out.National == nil && out.Provincial == nil {
		out.National = &EqaScopeUpsert{Participating: false}
		out.Provincial = &EqaScopeUpsert{Participating: false}
	}
	return out, true
}

func parseScopeUpsert(v any) *EqaScopeUpsert {
	if v == nil {
		return &EqaScopeUpsert{Participating: false}
	}
	switch t := v.(type) {
	case bool:
		// Legacy bool-only scope: no subjects → treat as not participating when false;
		// true without codes is invalid under subject-derived rules → not participating.
		return &EqaScopeUpsert{Participating: false}
	case map[string]any:
		codes := make([]string, 0)
		switch c := t["codes"].(type) {
		case []any:
			for _, x := range c {
				s := strings.TrimSpace(anyToString(x))
				if s != "" {
					codes = append(codes, s)
				}
			}
		case []string:
			for _, x := range c {
				s := strings.TrimSpace(x)
				if s != "" {
					codes = append(codes, s)
				}
			}
		}
		// Participation is implied solely by selected subjects (no empty parent checkbox).
		if len(codes) == 0 {
			return &EqaScopeUpsert{Participating: false}
		}
		return &EqaScopeUpsert{Participating: true, Codes: codes}
	default:
		return &EqaScopeUpsert{Participating: false}
	}
}

func (l *EqaLogic) writebackLegacyFlat(actorID, hospitalID int64, answers map[string]any) error {
	year := int(anyToInt64(answers["eqa_year"]))
	if year <= 0 {
		year = time.Now().Year()
	}

	fields, err := l.svcCtx.EqaModel.ListFields(l.ctx)
	if err != nil {
		return err
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
		// No EQA signal at all
		return nil
	}

	payload := EqaHospitalUpsert{Year: year}
	if hasNat || scopeHint == "national" || scopeHint == "" {
		// If only provincial hint, skip national unless codes present
		if len(natCodes) > 0 || scopeHint == "national" {
			payload.National = &EqaScopeUpsert{Participating: true, Codes: natCodes}
		}
	}
	if hasProv || scopeHint == "provincial" {
		if len(provCodes) > 0 || scopeHint == "provincial" {
			payload.Provincial = &EqaScopeUpsert{Participating: true, Codes: provCodes}
		}
	}
	// Dual: if both code sets present, write both regardless of single scope hint
	if len(natCodes) > 0 {
		payload.National = &EqaScopeUpsert{Participating: true, Codes: natCodes}
	}
	if len(provCodes) > 0 {
		payload.Provincial = &EqaScopeUpsert{Participating: true, Codes: provCodes}
	}
	if payload.National == nil && payload.Provincial == nil {
		return nil
	}
	return l.UpsertHospitalEQA(actorID, hospitalID, payload)
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
