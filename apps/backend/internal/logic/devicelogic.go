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
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	items, err := l.svcCtx.DeviceModel.ListByHospital(l.ctx, hospitalID)
	if err != nil {
		return nil, ErrInternal
	}
	out := make([]types.DeviceInfo, 0, len(items))
	for i := range items {
		out = append(out, toDeviceInfo(&items[i]))
	}
	return &types.ListDevicesResponse{Total: int64(len(out)), Items: out}, nil
}

func (l *DeviceLogic) ListAll(req *types.ListDevicesRequest) (*types.ListDevicesResponse, error) {
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
	items, total, err := l.svcCtx.DeviceModel.List(l.ctx, model.DeviceFilter{
		HospitalID: req.HospitalId,
		Brand:      req.Brand,
		Category:   req.Category,
		Status:     req.Status,
		Keyword:    req.Keyword,
		Limit:      size,
		Offset:     (page - 1) * size,
	})
	if err != nil {
		l.Errorf("list devices: %v", err)
		return nil, ErrInternal
	}
	out := make([]types.DeviceInfo, 0, len(items))
	for i := range items {
		out = append(out, toDeviceInfo(&items[i]))
	}
	return &types.ListDevicesResponse{Total: total, Items: out}, nil
}

func (l *DeviceLogic) Create(hospitalID int64, req *types.DeviceUpsertRequest) (*types.DeviceResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if hospitalID <= 0 {
		hospitalID = req.HospitalId
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
	brand := strings.TrimSpace(req.Brand)
	if brand == "" {
		brand = "迈瑞"
	}
	line := strings.TrimSpace(req.AssayLineCode)
	cat := strings.TrimSpace(req.Category)
	if cat == "" {
		cat = model.CategoryFromAssayLine(line)
	}
	if cat == "" {
		cat = "immuno"
	}
	d := &model.Device{
		HospitalId: hospitalID, Brand: brand, Category: cat, AssayLineCode: line,
		Model: strings.TrimSpace(req.Model),
		SerialNo: strings.TrimSpace(req.SerialNo), Status: normalizeStatus(req.Status, "active"),
		Remark: strings.TrimSpace(req.Remark), ServiceEvaluation: strings.TrimSpace(req.ServiceEvaluation),
		CreatedBy: ptrInt64(uid), UpdatedBy: ptrInt64(uid),
		InstalledAt: parseDate(req.InstalledAt), ItemCodes: req.ItemCodes,
	}
	id, err := l.svcCtx.DeviceModel.Insert(l.ctx, d)
	if err != nil {
		return nil, ErrInternal
	}
	_ = l.svcCtx.DeviceModel.SyncHospitalAssaysFromDevices(l.ctx, hospitalID)
	got, _ := l.svcCtx.DeviceModel.FindById(l.ctx, id)
	if got != nil {
		return &types.DeviceResponse{Device: toDeviceInfo(got)}, nil
	}
	d.Id = id
	d.HospitalName = h.Name
	return &types.DeviceResponse{Device: toDeviceInfo(d)}, nil
}

func (l *DeviceLogic) Update(id int64, req *types.DeviceUpsertRequest) (*types.DeviceResponse, error) {
	if err := requireAdminCtx(l.ctx); err != nil {
		return nil, err
	}
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
	if req.HospitalId > 0 && req.HospitalId != existing.HospitalId {
		h, err := l.svcCtx.HospitalModel.FindById(l.ctx, req.HospitalId)
		if err != nil {
			return nil, ErrInternal
		}
		if h == nil {
			return nil, NewCodeError(404, "医院不存在")
		}
		existing.HospitalId = req.HospitalId
		existing.HospitalName = h.Name
	}
	brand := strings.TrimSpace(req.Brand)
	if brand == "" {
		brand = existing.Brand
	}
	if brand == "" {
		brand = "迈瑞"
	}
	existing.Brand = brand
	line := strings.TrimSpace(req.AssayLineCode)
	if line != "" {
		existing.AssayLineCode = line
	}
	cat := strings.TrimSpace(req.Category)
	if cat == "" {
		cat = model.CategoryFromAssayLine(existing.AssayLineCode)
	}
	if cat != "" {
		existing.Category = cat
	}
	existing.Model = strings.TrimSpace(req.Model)
	existing.SerialNo = strings.TrimSpace(req.SerialNo)
	existing.Status = normalizeStatus(req.Status, existing.Status)
	existing.Remark = strings.TrimSpace(req.Remark)
	existing.ServiceEvaluation = strings.TrimSpace(req.ServiceEvaluation)
	existing.InstalledAt = parseDate(req.InstalledAt)
	existing.UpdatedBy = ptrInt64(uid)
	if req.ItemCodes != nil {
		existing.ItemCodes = req.ItemCodes
	}
	if err := l.svcCtx.DeviceModel.Update(l.ctx, existing); err != nil {
		return nil, ErrInternal
	}
	_ = l.svcCtx.DeviceModel.SyncHospitalAssaysFromDevices(l.ctx, existing.HospitalId)
	got, _ := l.svcCtx.DeviceModel.FindById(l.ctx, existing.Id)
	if got != nil {
		return &types.DeviceResponse{Device: toDeviceInfo(got)}, nil
	}
	return &types.DeviceResponse{Device: toDeviceInfo(existing)}, nil
}

func (l *DeviceLogic) Delete(id int64) error {
	if err := requireAdminCtx(l.ctx); err != nil {
		return err
	}
	existing, err := l.svcCtx.DeviceModel.FindById(l.ctx, id)
	if err != nil {
		return ErrInternal
	}
	if existing == nil {
		return NewCodeError(404, "设备不存在")
	}
	hid := existing.HospitalId
	if err := l.svcCtx.DeviceModel.Delete(l.ctx, id); err != nil {
		return err
	}
	_ = l.svcCtx.DeviceModel.SyncHospitalAssaysFromDevices(l.ctx, hid)
	return nil
}

func validateDevice(req *types.DeviceUpsertRequest) error {
	if strings.TrimSpace(req.Model) == "" {
		return NewCodeError(400, "设备型号不能为空")
	}
	if strings.TrimSpace(req.Category) == "" && strings.TrimSpace(req.AssayLineCode) == "" {
		return NewCodeError(400, "请选择所属检测线或设备类别")
	}
	if !model.IsAllowedEnum(req.ServiceEvaluation, model.DeviceServiceEvaluationEnum) {
		return NewCodeError(400, "客户服务评价不在可选范围内")
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
