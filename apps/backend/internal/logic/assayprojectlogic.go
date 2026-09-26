package logic

import (
	"context"
	"net/http"
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
	f := model.AssayProjectFilter{
		Keyword: req.Keyword,
		Company: req.Company,
		Line:    req.Line,
		Status:  req.Status,
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
	if name == "" {
		return nil, NewCodeError(http.StatusBadRequest, "项目名称不能为空")
	}
	p, err := l.svcCtx.MasterDataModel.CreateAssayProject(l.ctx, model.AssayProjectInput{
		Code: req.Code, Name: name, LineCategory: req.LineCategory,
		Company: req.Company, Aliases: req.Aliases, Status: req.Status,
	})
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return nil, NewCodeError(http.StatusConflict, "项目名称已存在")
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
	if name == "" {
		return nil, NewCodeError(http.StatusBadRequest, "项目名称不能为空")
	}
	p, err := l.svcCtx.MasterDataModel.UpdateAssayProject(l.ctx, id, model.AssayProjectInput{
		Code: req.Code, Name: name, LineCategory: req.LineCategory,
		Company: req.Company, Aliases: req.Aliases, Status: req.Status,
	})
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			return nil, NewCodeError(http.StatusConflict, "项目名称已存在")
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
		l.Errorf("delete assay project: %v", err)
		return ErrInternal
	}
	return nil
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
