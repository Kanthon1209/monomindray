package logic

import (
	"context"
	"strings"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type CustomerLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewCustomerLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CustomerLogic {
	return &CustomerLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *CustomerLogic) List(req *types.ListCustomersRequest) (*types.ListCustomersResponse, error) {
	page, size := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	items, total, err := l.svcCtx.CustomerModel.List(l.ctx, model.CustomerFilter{
		HospitalId: req.HospitalId, Keyword: req.Keyword, Limit: size, Offset: (page - 1) * size,
	})
	if err != nil {
		return nil, ErrInternal
	}
	out := make([]types.CustomerInfo, 0, len(items))
	for i := range items {
		out = append(out, toCustomerInfo(&items[i]))
	}
	return &types.ListCustomersResponse{Total: total, Items: out}, nil
}

func (l *CustomerLogic) Create(req *types.CustomerUpsertRequest) (*types.CustomerResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if strings.TrimSpace(req.Name) == "" {
		return nil, NewCodeError(400, "客户姓名不能为空")
	}
	c := &model.Customer{
		HospitalId: req.HospitalId, Name: strings.TrimSpace(req.Name), Title: strings.TrimSpace(req.Title),
		Phone: strings.TrimSpace(req.Phone), Email: strings.TrimSpace(req.Email), Remark: strings.TrimSpace(req.Remark),
		CreatedBy: ptrInt64(uid), UpdatedBy: ptrInt64(uid),
	}
	id, err := l.svcCtx.CustomerModel.Insert(l.ctx, c)
	if err != nil {
		return nil, ErrInternal
	}
	got, err := l.svcCtx.CustomerModel.FindById(l.ctx, id)
	if err != nil || got == nil {
		return nil, ErrInternal
	}
	return &types.CustomerResponse{Customer: toCustomerInfo(got)}, nil
}

func (l *CustomerLogic) Update(id int64, req *types.CustomerUpsertRequest) (*types.CustomerResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	existing, err := l.svcCtx.CustomerModel.FindById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if existing == nil {
		return nil, NewCodeError(404, "客户不存在")
	}
	if strings.TrimSpace(req.Name) == "" {
		return nil, NewCodeError(400, "客户姓名不能为空")
	}
	existing.HospitalId = req.HospitalId
	existing.Name = strings.TrimSpace(req.Name)
	existing.Title = strings.TrimSpace(req.Title)
	existing.Phone = strings.TrimSpace(req.Phone)
	existing.Email = strings.TrimSpace(req.Email)
	existing.Remark = strings.TrimSpace(req.Remark)
	existing.UpdatedBy = ptrInt64(uid)
	if err := l.svcCtx.CustomerModel.Update(l.ctx, existing); err != nil {
		return nil, ErrInternal
	}
	got, _ := l.svcCtx.CustomerModel.FindById(l.ctx, id)
	return &types.CustomerResponse{Customer: toCustomerInfo(got)}, nil
}

func (l *CustomerLogic) Delete(id int64) error {
	existing, err := l.svcCtx.CustomerModel.FindById(l.ctx, id)
	if err != nil {
		return ErrInternal
	}
	if existing == nil {
		return NewCodeError(404, "客户不存在")
	}
	return l.svcCtx.CustomerModel.Delete(l.ctx, id)
}
