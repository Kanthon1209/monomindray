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

type HospitalLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewHospitalLogic(ctx context.Context, svcCtx *svc.ServiceContext) *HospitalLogic {
	return &HospitalLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *HospitalLogic) List(req *types.ListHospitalsRequest) (*types.ListHospitalsResponse, error) {
	page, size := req.Page, req.PageSize
	if page <= 0 {
		page = 1
	}
	if size <= 0 {
		size = 50
	}
	items, total, err := l.svcCtx.HospitalModel.List(l.ctx, model.HospitalFilter{
		Province: req.Province, Level: resolveLevel(req.Level), Type: resolveType(req.Type),
		Status: req.Status, DeviceCategory: req.DeviceCategory, DeviceModel: resolveModel(req.DeviceModel),
		Keyword: req.Keyword, Limit: size, Offset: (page - 1) * size,
	})
	if err != nil {
		l.Errorf("list hospitals: %v", err)
		return nil, ErrInternal
	}
	out := make([]types.HospitalInfo, 0, len(items))
	for i := range items {
		out = append(out, toHospitalInfo(&items[i]))
	}
	return &types.ListHospitalsResponse{Total: total, Items: out}, nil
}

func (l *HospitalLogic) DashboardList(req *types.DashboardHospitalsRequest) (*types.ListHospitalsResponse, error) {
	province := strings.TrimSpace(req.Province)
	if province == "" {
		province = defaultDashboardProvince
	}
	f := model.HospitalFilter{
		Province: province,
		Level: resolveLevel(req.Level), Type: resolveType(req.Type),
		Status: req.Status, DeviceCategory: req.DeviceCategory, DeviceModel: resolveModel(req.DeviceModel),
		Keyword: req.Keyword, Limit: 500, Offset: 0,
	}
	if city := strings.TrimSpace(req.City); city != "" {
		f.Cities = cityVariants(city)
	} else {
		f.Cities = citiesByAnhuiRegion(req.Region)
	}
	items, total, err := l.svcCtx.HospitalModel.List(l.ctx, f)
	if err != nil {
		l.Errorf("dashboard hospitals: %v", err)
		return nil, ErrInternal
	}
	out := make([]types.HospitalInfo, 0, len(items))
	for i := range items {
		out = append(out, toHospitalInfo(&items[i]))
	}
	return &types.ListHospitalsResponse{Total: total, Items: out}, nil
}

func (l *HospitalLogic) Provinces(req *types.DashboardProvincesRequest) (*types.DashboardProvincesResponse, error) {
	// 看板已收敛为安徽省：返回地市医院数量，供安徽地图着色
	stats, err := l.svcCtx.HospitalModel.CityStats(l.ctx, defaultDashboardProvince, citiesByAnhuiRegion(req.Region))
	if err != nil {
		l.Errorf("city stats: %v", err)
		return nil, ErrInternal
	}
	items := make([]types.ProvinceStat, 0, len(stats))
	for _, s := range stats {
		items = append(items, types.ProvinceStat{Name: normalizeAnhuiCity(s.Name), Value: s.Value})
	}
	return &types.DashboardProvincesResponse{Items: items}, nil
}

func (l *HospitalLogic) Get(id int64) (*types.HospitalResponse, error) {
	h, err := l.svcCtx.HospitalModel.FindById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if h == nil {
		return nil, NewCodeError(404, "医院不存在")
	}
	info := toHospitalInfo(h)
	if attrs, err := l.svcCtx.MasterDataModel.ListAttributes(l.ctx, id); err == nil {
		info.Attributes = attrs
	}
	if metrics, err := l.svcCtx.MasterDataModel.ListMetrics(l.ctx, id, model.CurrentMetricYear()); err == nil {
		info.Metrics = metrics
	}
	return &types.HospitalResponse{Hospital: info}, nil
}

func (l *HospitalLogic) Create(req *types.HospitalUpsertRequest) (*types.HospitalResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if err := l.validateUpsert(req); err != nil {
		return nil, err
	}
	status := normalizeStatus(req.Status, "pending")
	h := &model.Hospital{
		Name: strings.TrimSpace(req.Name), Province: strings.TrimSpace(req.Province),
		City: strings.TrimSpace(req.City), District: strings.TrimSpace(req.District),
		Level: req.Level, Type: req.Type, Status: status,
		Address: strings.TrimSpace(req.Address), Remark: strings.TrimSpace(req.Remark),
		CustomerCode: strings.TrimSpace(req.CustomerCode), Region: strings.TrimSpace(req.Region),
		BranchOffice: strings.TrimSpace(req.BranchOffice),
		CreatedBy: ptrInt64(uid), UpdatedBy: ptrInt64(uid),
	}
	id, err := l.svcCtx.HospitalModel.Insert(l.ctx, h)
	if err != nil {
		l.Errorf("create hospital: %v", err)
		return nil, NewCodeError(400, "创建医院失败，可能已存在同名医院")
	}
	h.Id = id
	return l.Get(id)
}

func (l *HospitalLogic) Update(id int64, req *types.HospitalUpsertRequest) (*types.HospitalResponse, error) {
	uid, err := authx.UserIDFromCtx(l.ctx)
	if err != nil {
		return nil, ErrUnauthorized
	}
	if err := l.validateUpsert(req); err != nil {
		return nil, err
	}
	existing, err := l.svcCtx.HospitalModel.FindById(l.ctx, id)
	if err != nil {
		return nil, ErrInternal
	}
	if existing == nil {
		return nil, NewCodeError(404, "医院不存在")
	}
	status := normalizeStatus(req.Status, existing.Status)
	h := &model.Hospital{
		Id: id, Name: strings.TrimSpace(req.Name), Province: strings.TrimSpace(req.Province),
		City: strings.TrimSpace(req.City), District: strings.TrimSpace(req.District),
		Level: req.Level, Type: req.Type, Status: status,
		Address: strings.TrimSpace(req.Address), Remark: strings.TrimSpace(req.Remark),
		CustomerCode: strings.TrimSpace(req.CustomerCode), Region: strings.TrimSpace(req.Region),
		BranchOffice: strings.TrimSpace(req.BranchOffice),
		Archive: existing.Archive, UpdatedBy: ptrInt64(uid),
	}
	if h.CustomerCode == "" {
		h.CustomerCode = existing.CustomerCode
	}
	if h.Region == "" {
		h.Region = existing.Region
	}
	if h.BranchOffice == "" {
		h.BranchOffice = existing.BranchOffice
	}
	if err := l.svcCtx.HospitalModel.Update(l.ctx, h); err != nil {
		l.Errorf("update hospital: %v", err)
		return nil, ErrInternal
	}
	return l.Get(id)
}

func (l *HospitalLogic) Delete(id int64) error {
	existing, err := l.svcCtx.HospitalModel.FindById(l.ctx, id)
	if err != nil {
		return ErrInternal
	}
	if existing == nil {
		return NewCodeError(404, "医院不存在")
	}
	if err := l.svcCtx.HospitalModel.Delete(l.ctx, id); err != nil {
		l.Errorf("delete hospital: %v", err)
		return NewCodeError(400, "删除失败，可能仍有关联案例")
	}
	return nil
}

func (l *HospitalLogic) validateUpsert(req *types.HospitalUpsertRequest) error {
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Province) == "" || strings.TrimSpace(req.City) == "" {
		return NewCodeError(400, "医院名称、省份、城市不能为空")
	}
	if req.Level == "" || req.Type == "" {
		return NewCodeError(400, "医院级别和类型不能为空")
	}
	return nil
}
