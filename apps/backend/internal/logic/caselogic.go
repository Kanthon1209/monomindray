package logic

import (
	"context"
	"strings"
	"time"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type CaseLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewCaseLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CaseLogic {
	return &CaseLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *CaseLogic) List(req *types.ListCasesRequest) (*types.ListCasesResponse, error) {
	page, size := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	items, total, err := l.svcCtx.CaseModel.List(l.ctx, model.CaseFilter{
		HospitalId: req.HospitalId, Status: req.Status, Keyword: req.Keyword,
		Limit: size, Offset: (page - 1) * size,
	})
	if err != nil {
		return nil, ErrInternal
	}
	out := make([]types.CaseInfo, 0, len(items))
	for i := range items {
		out = append(out, toCaseInfo(&items[i]))
	}
	return &types.ListCasesResponse{Total: total, Items: out}, nil
}

func (l *CaseLogic) Create(req *types.CaseUpsertRequest) (*types.CaseResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if err := validateCase(req); err != nil {
		return nil, err
	}
	h, err := l.svcCtx.HospitalModel.FindById(l.ctx, req.HospitalId)
	if err != nil {
		return nil, ErrInternal
	}
	if h == nil {
		return nil, NewCodeError(404, "医院不存在")
	}
	now := time.Now()
	c := &model.Case{
		HospitalId: req.HospitalId, DeviceId: req.DeviceId,
		Title: strings.TrimSpace(req.Title), Summary: strings.TrimSpace(req.Summary),
		Content: strings.TrimSpace(req.Content), Status: normalizeStatus(req.Status, "draft"),
		CollectedBy: ptrInt64(uid), CollectedAt: now, CreatedBy: ptrInt64(uid), UpdatedBy: ptrInt64(uid),
	}
	id, err := l.svcCtx.CaseModel.Insert(l.ctx, c)
	if err != nil {
		return nil, ErrInternal
	}
	got, err := l.svcCtx.CaseModel.FindById(l.ctx, id)
	if err != nil || got == nil {
		return nil, ErrInternal
	}
	return &types.CaseResponse{Case: toCaseInfo(got)}, nil
}

func (l *CaseLogic) Update(id int64, req *types.CaseUpsertRequest) (*types.CaseResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if err := validateCase(req); err != nil {
		return nil, err
	}
	existing, err := l.svcCtx.CaseModel.FindById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if existing == nil {
		return nil, NewCodeError(404, "案例不存在")
	}
	existing.HospitalId = req.HospitalId
	existing.DeviceId = req.DeviceId
	existing.Title = strings.TrimSpace(req.Title)
	existing.Summary = strings.TrimSpace(req.Summary)
	existing.Content = strings.TrimSpace(req.Content)
	existing.Status = normalizeStatus(req.Status, existing.Status)
	existing.UpdatedBy = ptrInt64(uid)
	if err := l.svcCtx.CaseModel.Update(l.ctx, existing); err != nil {
		return nil, ErrInternal
	}
	got, _ := l.svcCtx.CaseModel.FindById(l.ctx, id)
	return &types.CaseResponse{Case: toCaseInfo(got)}, nil
}

func (l *CaseLogic) Delete(id int64) error {
	existing, err := l.svcCtx.CaseModel.FindById(l.ctx, id)
	if err != nil {
		return ErrInternal
	}
	if existing == nil {
		return NewCodeError(404, "案例不存在")
	}
	return l.svcCtx.CaseModel.Delete(l.ctx, id)
}

func validateCase(req *types.CaseUpsertRequest) error {
	if req.HospitalId <= 0 || strings.TrimSpace(req.Title) == "" {
		return NewCodeError(400, "案例标题和所属医院不能为空")
	}
	return nil
}
