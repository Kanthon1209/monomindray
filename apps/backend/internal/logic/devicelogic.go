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

type DeviceLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewDeviceLogic(ctx context.Context, svcCtx *svc.ServiceContext) *DeviceLogic {
	return &DeviceLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *DeviceLogic) List(hospitalID int64) (*types.ListDevicesResponse, error) {
	items, err := l.svcCtx.DeviceModel.ListByHospital(l.ctx, hospitalID)
	if err != nil {
		return nil, ErrInternal
	}
	out := make([]types.DeviceInfo, 0, len(items))
	for i := range items {
		out = append(out, toDeviceInfo(&items[i]))
	}
	return &types.ListDevicesResponse{Items: out}, nil
}

func (l *DeviceLogic) Create(hospitalID int64, req *types.DeviceUpsertRequest) (*types.DeviceResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	h, err := l.svcCtx.HospitalModel.FindById(l.ctx, hospitalID)
	if err != nil {
		return nil, ErrInternal
	}
	if h == nil {
		return nil, NewCodeError(404, "医院不存在")
	}
	if err := validateDevice(req); err != nil {
		return nil, err
	}
	d := &model.Device{
		HospitalId: hospitalID, Category: req.Category, Model: strings.TrimSpace(req.Model),
		SerialNo: strings.TrimSpace(req.SerialNo), Status: normalizeStatus(req.Status, "active"),
		Remark: strings.TrimSpace(req.Remark), CreatedBy: ptrInt64(uid), UpdatedBy: ptrInt64(uid),
		InstalledAt: parseDate(req.InstalledAt),
	}
	id, err := l.svcCtx.DeviceModel.Insert(l.ctx, d)
	if err != nil {
		return nil, ErrInternal
	}
	d.Id = id
	return &types.DeviceResponse{Device: toDeviceInfo(d)}, nil
}

func (l *DeviceLogic) Update(id int64, req *types.DeviceUpsertRequest) (*types.DeviceResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	existing, err := l.svcCtx.DeviceModel.FindById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if existing == nil {
		return nil, NewCodeError(404, "设备不存在")
	}
	if err := validateDevice(req); err != nil {
		return nil, err
	}
	existing.Category = req.Category
	existing.Model = strings.TrimSpace(req.Model)
	existing.SerialNo = strings.TrimSpace(req.SerialNo)
	existing.Status = normalizeStatus(req.Status, existing.Status)
	existing.Remark = strings.TrimSpace(req.Remark)
	existing.InstalledAt = parseDate(req.InstalledAt)
	existing.UpdatedBy = ptrInt64(uid)
	if err := l.svcCtx.DeviceModel.Update(l.ctx, existing); err != nil {
		return nil, ErrInternal
	}
	return &types.DeviceResponse{Device: toDeviceInfo(existing)}, nil
}

func (l *DeviceLogic) Delete(id int64) error {
	existing, err := l.svcCtx.DeviceModel.FindById(l.ctx, id)
	if err != nil {
		return ErrInternal
	}
	if existing == nil {
		return NewCodeError(404, "设备不存在")
	}
	return l.svcCtx.DeviceModel.Delete(l.ctx, id)
}

func validateDevice(req *types.DeviceUpsertRequest) error {
	if strings.TrimSpace(req.Category) == "" || strings.TrimSpace(req.Model) == "" {
		return NewCodeError(400, "设备类别和型号不能为空")
	}
	return nil
}

func parseDate(v string) *time.Time {
	v = strings.TrimSpace(v)
	if v == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", v)
	if err != nil {
		return nil
	}
	return &t
}
