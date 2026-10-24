package logic

import (
	"context"
	"net/http"
	"sort"
	"strings"

	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type AssayProjectLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewAssayProjectLogic(ctx context.Context, svcCtx *svc.ServiceContext) *AssayProjectLogic {
	return &AssayProjectLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *AssayProjectLogic) List(req *types.ListAssayProjectsRequest) (*types.ListAssayProjectsResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	page, size := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	// Empty / "all" = every kind (line|category|item). qs() on the web client
	// strips kind=all, so defaulting to "item" here made line/category Edit silent-no-op.
	kind := strings.TrimSpace(req.Kind)
	f := model.AssayProjectFilter{
		Keyword: req.Keyword,
		Company: req.Company,
		Line:    req.Line,
		Status:  req.Status,
		Kind:    kind,
		Limit:   size,
		Offset:  (page - 1) * size,
	}
	switch strings.TrimSpace(req.Ownership) {
	case "own":
		v := true
		f.OwnOnly = &v
	case "competitor":
		v := false
		f.OwnOnly = &v
	}
	items, total, err := l.svcCtx.MasterDataModel.ListAssayProjects(l.ctx, f)
	if err != nil {
		l.Errorf("list assay projects: %v", err)
		return nil, ErrInternal
	}
	companies, err := l.svcCtx.MasterDataModel.ListAssayCompanies(l.ctx)
	if err != nil {
		l.Errorf("list assay companies: %v", err)
		companies = []string{}
	}
	out := make([]types.AssayProjectInfo, 0, len(items))
	for i := range items {
		out = append(out, toAssayProjectInfo(&items[i]))
	}
	return &types.ListAssayProjectsResponse{Total: total, Items: out, Companies: companies}, nil
}

func (l *AssayProjectLogic) Tree() (*types.ListAssayTreeResponse, error) {
	// Any logged-in caller (survey fill + admin)
	nodes, err := l.svcCtx.MasterDataModel.ListAssayTree(l.ctx)
	if err != nil {
		l.Errorf("list assay tree: %v", err)
		return nil, ErrInternal
	}
	return &types.ListAssayTreeResponse{Items: mapAssayTree(nodes)}, nil
}

func mapAssayTree(nodes []model.AssayTreeNode) []types.AssayTreeNode {
	out := make([]types.AssayTreeNode, 0, len(nodes))
	for _, n := range nodes {
		out = append(out, types.AssayTreeNode{
			Code:      n.Code,
			Name:      n.Name,
			Kind:      n.Kind,
			SortOrder: n.SortOrder,
			Children:  mapAssayTree(n.Children),
		})
	}
	return out
}

func (l *AssayProjectLogic) Get(id int64) (*types.AssayProjectResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	p, err := l.svcCtx.MasterDataModel.GetAssayProject(l.ctx, id)
	if err != nil {
		l.Errorf("get assay project: %v", err)
		return nil, ErrInternal
	}
	if p == nil {
		return nil, NewCodeError(http.StatusNotFound, "项目不存在")
	}
	return &types.AssayProjectResponse{Project: toAssayProjectInfo(p)}, nil
}

func (l *AssayProjectLogic) Create(req *types.AssayProjectUpsertRequest) (*types.AssayProjectResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	code := strings.TrimSpace(req.Code)
	if name == "" || code == "" {
		return nil, NewCodeError(http.StatusBadRequest, "编码和名称不能为空")
	}
	p, err := l.svcCtx.MasterDataModel.CreateAssayProject(l.ctx, model.AssayProjectInput{
		Code: code, Name: name, ParentCode: req.ParentCode, Kind: req.Kind,
		SortOrder: req.SortOrder, LineCategory: req.LineCategory,
		Company: req.Company, Aliases: req.Aliases, Status: req.Status,
	})
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "duplicate") || strings.Contains(msg, "unique") {
			return nil, NewCodeError(http.StatusConflict, "项目编码已存在")
		}
		if strings.Contains(msg, "requires parent") || strings.Contains(msg, "must not have") ||
			strings.Contains(msg, "parent not found") || strings.Contains(msg, "parent must be") ||
			strings.Contains(msg, "invalid kind") {
			return nil, NewCodeError(http.StatusBadRequest, msg)
		}
		l.Errorf("create assay project: %v", err)
		return nil, ErrInternal
	}
	return &types.AssayProjectResponse{Project: toAssayProjectInfo(p)}, nil
}

func (l *AssayProjectLogic) Update(id int64, req *types.AssayProjectUpsertRequest) (*types.AssayProjectResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Name)
	code := strings.TrimSpace(req.Code)
	if name == "" || code == "" {
		return nil, NewCodeError(http.StatusBadRequest, "编码和名称不能为空")
	}
	p, err := l.svcCtx.MasterDataModel.UpdateAssayProject(l.ctx, id, model.AssayProjectInput{
		Code: code, Name: name, ParentCode: req.ParentCode, Kind: req.Kind,
		SortOrder: req.SortOrder, LineCategory: req.LineCategory,
		Company: req.Company, Aliases: req.Aliases, Status: req.Status,
	})
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "duplicate") || strings.Contains(msg, "unique") {
			return nil, NewCodeError(http.StatusConflict, "项目编码已存在")
		}
		if strings.Contains(msg, "requires parent") || strings.Contains(msg, "must not have") ||
			strings.Contains(msg, "parent not found") || strings.Contains(msg, "parent must be") ||
			strings.Contains(msg, "invalid kind") {
			return nil, NewCodeError(http.StatusBadRequest, msg)
		}
		l.Errorf("update assay project: %v", err)
		return nil, ErrInternal
	}
	if p == nil {
		return nil, NewCodeError(http.StatusNotFound, "项目不存在")
	}
	return &types.AssayProjectResponse{Project: toAssayProjectInfo(p)}, nil
}

func (l *AssayProjectLogic) Delete(id int64) error {
	if err := requireAdminCtx(l.ctx); err != nil {
		return err
	}
	if err := l.svcCtx.MasterDataModel.DeleteAssayProject(l.ctx, id); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "child nodes") || strings.Contains(msg, "not found") {
			return NewCodeError(http.StatusBadRequest, msg)
		}
		l.Errorf("delete assay project: %v", err)
		return ErrInternal
	}
	return nil
}

func (l *AssayProjectLogic) Options() (*types.ListAssayProjectOptionsResponse, error) {
	// Legacy flat options: active leaf items only (kept for old string_array fields).
	items, _, err := l.svcCtx.MasterDataModel.ListAssayProjects(l.ctx, model.AssayProjectFilter{
		Status: "active",
		Kind:   "item",
		Limit:  5000,
		Offset: 0,
	})
	if err != nil {
		l.Errorf("list assay options: %v", err)
		return nil, ErrInternal
	}
	out := make([]types.AssayProjectOption, 0, len(items))
	for i := range items {
		out = append(out, types.AssayProjectOption{
			Id:        items[i].Id,
			Code:      items[i].Code,
			Name:      items[i].Name,
			Company:   items[i].Company,
			Ownership: model.OwnershipLabel(items[i].Company),
		})
	}
	return &types.ListAssayProjectOptionsResponse{Items: out}, nil
}

func (l *AssayProjectLogic) ListHospitalAssays(hospitalID int64) (*types.HospitalAssaysResponse, error) {
	// Any logged-in caller (dashboard detail + survey fill)
	codes, err := l.svcCtx.MasterDataModel.ListHospitalAssayCodes(l.ctx, hospitalID)
	if err != nil {
		l.Errorf("list hospital assays: %v", err)
		return nil, ErrInternal
	}
	if codes == nil {
		codes = []string{}
	}
	names := make([]string, 0, len(codes))
	for _, code := range codes {
		p, e := l.svcCtx.MasterDataModel.GetAssayProjectByCode(l.ctx, code)
		if e == nil && p != nil {
			names = append(names, p.Name)
		} else {
			names = append(names, code)
		}
	}
	groups, err := l.svcCtx.MasterDataModel.ListHospitalAssayGroups(l.ctx, hospitalID)
	if err != nil {
		l.Errorf("list hospital assay groups: %v", err)
		return nil, ErrInternal
	}
	categories := make([]types.HospitalAssayCategory, 0, len(groups))
	for _, g := range groups {
		items := make([]types.HospitalAssayItem, 0, len(g.Items))
		for _, it := range g.Items {
			items = append(items, types.HospitalAssayItem{Code: it.Code, Name: it.Name})
		}
		categories = append(categories, types.HospitalAssayCategory{
			Code: g.Code, Name: g.Name, LineCode: g.LineCode, LineName: g.LineName,
			ItemCount: len(items), Items: items,
		})
	}
	competitors, mindrayLines, err := l.buildDeviceCoverageExtras(hospitalID)
	if err != nil {
		l.Errorf("device coverage extras: %v", err)
		// non-fatal
		competitors, mindrayLines = nil, nil
	}
	return &types.HospitalAssaysResponse{
		Codes: codes, Names: names, Categories: categories,
		Competitors: competitors, MindrayLines: mindrayLines,
	}, nil
}

// buildDeviceCoverageExtras derives Mindray line coverage and competitor products from devices.
func (l *AssayProjectLogic) buildDeviceCoverageExtras(hospitalID int64) ([]types.HospitalAssayCompetitorCategory, []string, error) {
	devices, err := l.svcCtx.DeviceModel.ListByHospital(l.ctx, hospitalID)
	if err != nil {
		return nil, nil, err
	}
	tree, err := l.svcCtx.MasterDataModel.ListAssayTree(l.ctx)
	if err != nil {
		return nil, nil, err
	}
	// code -> {name, parent, kind, lineCode, lineName, catCode, catName}
	type meta struct {
		name, kind, lineCode, lineName, catCode, catName string
	}
	byCode := map[string]meta{}
	var walk func(nodes []model.AssayTreeNode, lineCode, lineName, catCode, catName string)
	walk = func(nodes []model.AssayTreeNode, lineCode, lineName, catCode, catName string) {
		for _, n := range nodes {
			lc, ln, cc, cn := lineCode, lineName, catCode, catName
			switch n.Kind {
			case "line":
				lc, ln = n.Code, n.Name
			case "category":
				cc, cn = n.Code, n.Name
			}
			byCode[n.Code] = meta{name: n.Name, kind: n.Kind, lineCode: lc, lineName: ln, catCode: cc, catName: cn}
			if len(n.Children) > 0 {
				walk(n.Children, lc, ln, cc, cn)
			}
		}
	}
	walk(tree, "", "", "", "")

	mindrayLineSet := map[string]string{} // code -> name
	type catKey struct{ code, name, lineCode, lineName string }
	compByCat := map[catKey][]types.HospitalAssayCompetitorDevice{}
	catOrder := []catKey{}

	for _, d := range devices {
		if d.Status != "" && d.Status != "active" {
			continue
		}
		brand := strings.TrimSpace(d.Brand)
		if brand == "" {
			brand = "迈瑞"
		}
		itemNames := make([]string, 0, len(d.ItemCodes))
		for _, c := range d.ItemCodes {
			if m, ok := byCode[c]; ok {
				itemNames = append(itemNames, m.name)
			} else {
				itemNames = append(itemNames, c)
			}
		}
		isMindray := brand == "迈瑞"
		if isMindray {
			if d.AssayLineCode != "" {
				if m, ok := byCode[d.AssayLineCode]; ok {
					mindrayLineSet[d.AssayLineCode] = m.name
				} else {
					mindrayLineSet[d.AssayLineCode] = d.AssayLineCode
				}
			}
			for _, c := range d.ItemCodes {
				if m, ok := byCode[c]; ok && m.lineCode != "" {
					mindrayLineSet[m.lineCode] = m.lineName
				}
			}
			continue
		}
		// Competitor: group under categories touched by selected items (or line if no items)
		catKeys := []catKey{}
		seenCat := map[string]struct{}{}
		for _, c := range d.ItemCodes {
			m := byCode[c]
			ck := catKey{code: m.catCode, name: m.catName, lineCode: m.lineCode, lineName: m.lineName}
			if ck.code == "" {
				ck.code = "_line:" + (d.AssayLineCode)
				ck.name = "未分类"
				if lm, ok := byCode[d.AssayLineCode]; ok {
					ck.lineCode, ck.lineName = lm.lineCode, lm.lineName
					if ck.lineCode == "" {
						ck.lineCode, ck.lineName = d.AssayLineCode, lm.name
					}
				}
			}
			if _, ok := seenCat[ck.code]; ok {
				continue
			}
			seenCat[ck.code] = struct{}{}
			catKeys = append(catKeys, ck)
		}
		if len(catKeys) == 0 {
			ck := catKey{code: "_line:" + d.AssayLineCode, name: "未分类", lineCode: d.AssayLineCode}
			if lm, ok := byCode[d.AssayLineCode]; ok {
				ck.lineName = lm.name
				ck.lineCode = d.AssayLineCode
			}
			catKeys = append(catKeys, ck)
		}
		devInfo := types.HospitalAssayCompetitorDevice{
			DeviceId: d.Id, Brand: brand, Model: d.Model,
			ItemCodes: append([]string{}, d.ItemCodes...), ItemNames: itemNames,
		}
		for _, ck := range catKeys {
			if _, ok := compByCat[ck]; !ok {
				catOrder = append(catOrder, ck)
			}
			compByCat[ck] = append(compByCat[ck], devInfo)
		}
	}

	competitors := make([]types.HospitalAssayCompetitorCategory, 0, len(catOrder))
	for _, ck := range catOrder {
		competitors = append(competitors, types.HospitalAssayCompetitorCategory{
			Code: ck.code, Name: ck.name, LineCode: ck.lineCode, LineName: ck.lineName,
			Devices: compByCat[ck],
		})
	}
	mindrayLines := make([]string, 0, len(mindrayLineSet))
	for code, name := range mindrayLineSet {
		_ = code
		mindrayLines = append(mindrayLines, name)
	}
	sort.Strings(mindrayLines)
	return competitors, mindrayLines, nil
}

func (l *AssayProjectLogic) ReplaceHospitalAssays(hospitalID int64, req *types.ReplaceHospitalAssaysRequest) (*types.HospitalAssaysResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	if hospitalID <= 0 {
		return nil, NewCodeError(http.StatusBadRequest, "医院无效")
	}
	codes := req.Codes
	if codes == nil {
		codes = []string{}
	}
	if err := l.svcCtx.MasterDataModel.ReplaceHospitalAssaysByCodes(l.ctx, hospitalID, codes, req.Source); err != nil {
		msg := err.Error()
		if strings.Contains(msg, "unknown assay") || strings.Contains(msg, "not an item") {
			return nil, NewCodeError(http.StatusBadRequest, msg)
		}
		l.Errorf("replace hospital assays: %v", err)
		return nil, ErrInternal
	}
	return l.ListHospitalAssays(hospitalID)
}

// WritebackFromSurveyAnswers writes assay_block answers into hospital_assays by leaf codes.
func (l *AssayProjectLogic) WritebackFromSurveyAnswers(hospitalID int64, answers map[string]any) error {
	if hospitalID <= 0 || answers == nil {
		return nil
	}
	codes, ok := extractAssayBlockCodes(answers)
	if !ok {
		return nil
	}
	return l.svcCtx.MasterDataModel.ReplaceHospitalAssaysByCodes(l.ctx, hospitalID, codes, "own")
}

func extractAssayBlockCodes(answers map[string]any) ([]string, bool) {
	var raw any
	if v, ok := answers["assays"]; ok && v != nil {
		raw = v
	} else {
		for _, v := range answers {
			m, ok := v.(map[string]any)
			if !ok {
				continue
			}
			if _, has := m["codes"]; has {
				// Distinguish from EQA block which has national/provincial
				_, hasN := m["national"]
				_, hasP := m["provincial"]
				if hasN || hasP {
					continue
				}
				raw = v
				break
			}
		}
	}
	if raw == nil {
		return nil, false
	}
	switch t := raw.(type) {
	case map[string]any:
		return anyToStringSlice(t["codes"]), true
	case []any:
		return anyToStringSlice(t), true
	case []string:
		return append([]string{}, t...), true
	default:
		return nil, false
	}
}

func anyToStringSlice(v any) []string {
	out := []string{}
	switch t := v.(type) {
	case []string:
		for _, s := range t {
			s = strings.TrimSpace(s)
			if s != "" {
				out = append(out, s)
			}
		}
	case []any:
		for _, x := range t {
			s := strings.TrimSpace(anyToString(x))
			if s != "" {
				out = append(out, s)
			}
		}
	}
	return out
}

func toAssayProjectInfo(p *model.AssayProject) types.AssayProjectInfo {
	aliases := p.Aliases
	if aliases == nil {
		aliases = []string{}
	}
	return types.AssayProjectInfo{
		Id:           p.Id,
		Code:         p.Code,
		Name:         p.Name,
		ParentCode:   p.ParentCode,
		Kind:         p.Kind,
		SortOrder:    p.SortOrder,
		LineCategory: p.LineCategory,
		Company:      p.Company,
		Aliases:      aliases,
		Ownership:    model.OwnershipLabel(p.Company),
		Status:       p.Status,
		UsageCount:   p.UsageCount,
		CreatedAt:    formatTime(p.CreatedAt),
		UpdatedAt:    formatTime(p.UpdatedAt),
	}
}
