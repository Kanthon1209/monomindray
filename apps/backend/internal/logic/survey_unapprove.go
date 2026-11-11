package logic

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"mindray/internal/authx"
	"mindray/internal/model"
	"mindray/internal/types"

	"github.com/jackc/pgx/v5"
)

type hospitalPublishOutcome struct {
	HospitalID int64
	Created    bool
	Before     *approvalHospitalState
}

type approvalHospitalState struct {
	Hospital   *approvalHospitalSnap  `json:"hospital,omitempty"`
	Devices    []approvalDeviceSnap   `json:"devices,omitempty"`
	Attributes map[string]string      `json:"attributes,omitempty"`
	Metrics    []model.HospitalMetric `json:"metrics,omitempty"`
	AssayCodes []string               `json:"assayCodes,omitempty"`
	Eqa        []approvalEqaSnap      `json:"eqa,omitempty"`
}

type approvalSnapshot struct {
	Version             int                    `json:"version"`
	PreviousHospitalId  *int64                 `json:"previousHospitalId,omitempty"`
	PublishedHospitalId int64                  `json:"publishedHospitalId"`
	HospitalCreated     bool                   `json:"hospitalCreated"`
	Hospital            *approvalHospitalSnap  `json:"hospital,omitempty"`
	Devices             []approvalDeviceSnap   `json:"devices,omitempty"`
	Attributes          map[string]string      `json:"attributes,omitempty"`
	Metrics             []model.HospitalMetric `json:"metrics,omitempty"`
	AssayCodes          []string               `json:"assayCodes,omitempty"`
	Eqa                 []approvalEqaSnap      `json:"eqa,omitempty"`
}

type approvalHospitalSnap struct {
	Name         string         `json:"name"`
	Province     string         `json:"province"`
	City         string         `json:"city"`
	District     string         `json:"district"`
	Level        string         `json:"level"`
	Type         string         `json:"type"`
	Status       string         `json:"status"`
	Address      string         `json:"address"`
	Remark       string         `json:"remark"`
	CustomerCode string         `json:"customerCode"`
	Region       string         `json:"region"`
	BranchOffice string         `json:"branchOffice"`
	Archive      map[string]any `json:"archive,omitempty"`
}

type approvalDeviceSnap struct {
	Id                  int64    `json:"id"`
	Brand               string   `json:"brand"`
	Category            string   `json:"category"`
	AssayLineCode       string   `json:"assayLineCode"`
	Model               string   `json:"model"`
	SerialNo            string   `json:"serialNo"`
	Status              string   `json:"status"`
	InstalledAt         string   `json:"installedAt,omitempty"`
	EnabledAt           string   `json:"enabledAt,omitempty"`
	UsageLocation       string   `json:"usageLocation"`
	Remark              string   `json:"remark"`
	ServiceEvaluation   string   `json:"serviceEvaluation"`
	ReagentBrand        string   `json:"reagentBrand"`
	MonthlySampleVolume string   `json:"monthlySampleVolume"`
	DeptHead            string   `json:"deptHead"`
	ChannelCsa          string   `json:"channelCsa"`
	ItemCodes           []string `json:"itemCodes,omitempty"`
}

type approvalEqaSnap struct {
	Id          int64                 `json:"id"`
	Year        int                   `json:"year"`
	Scope       string                `json:"scope"`
	Tags        []string              `json:"tags,omitempty"`
	OwnerUserId *int64                `json:"ownerUserId,omitempty"`
	Items       []approvalEqaItemSnap `json:"items,omitempty"`
}

type approvalEqaItemSnap struct {
	FieldCode string `json:"fieldCode"`
	Value     bool   `json:"value"`
}

const (
	publishRollbackRestored        = "restored"
	publishRollbackHospitalDeleted = "hospital_deleted"
	publishRollbackUnavailable     = "unavailable"
	publishRollbackSkippedInUse    = "skipped_in_use"
)

func (l *SurveyLogic) UnapproveSubmission(id int64) (*types.UnapproveSurveySubmissionResponse, error) {
	if err := requireAdmin(authx.RoleFromCtx(l.ctx)); err != nil {
		return nil, err
	}
	sub, err := l.svcCtx.SurveyModel.FindSubmissionById(l.ctx, id)
	if err != nil {
		l.Errorf("unapprove find submission: %v", err)
		return nil, ErrInternal
	}
	if sub == nil {
		return nil, NewCodeError(404, "答卷不存在")
	}
	if sub.Status != "approved" {
		return nil, NewCodeError(409, "仅能撤销已通过的答卷")
	}

	raw, err := l.svcCtx.SurveyModel.FindApprovalSnapshot(l.ctx, id)
	if err != nil {
		l.Errorf("find approval snapshot: %v", err)
		return nil, ErrInternal
	}
	if len(raw) == 0 {
		if err := l.svcCtx.SurveyModel.UnapproveSubmission(l.ctx, id, sub.HospitalId); err != nil {
			if err == pgx.ErrNoRows {
				return nil, NewCodeError(409, "仅能撤销已通过的答卷")
			}
			l.Errorf("unapprove without snapshot: %v", err)
			return nil, ErrInternal
		}
		return l.unapproveResult(id, publishRollbackUnavailable, "答卷已回到待审核，但此次通过时未保存客户资料快照，无法自动回滚已发布的客户数据。请人工核对。")
	}

	var snap approvalSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		l.Errorf("parse approval snapshot: %v", err)
		return nil, NewCodeError(500, "撤销快照无法解析")
	}

	if !snap.HospitalCreated {
		later, err := l.svcCtx.SurveyModel.CountLaterApprovedOnHospital(l.ctx, snap.PublishedHospitalId, id, sub.ReviewedAt)
		if err != nil {
			l.Errorf("count later approved: %v", err)
			return nil, ErrInternal
		}
		if later > 0 {
			return nil, NewCodeError(409, "该客户在此次通过之后又有已通过的答卷，撤销会覆盖较新的客户资料。请先撤销较新的答卷。")
		}
		if err := l.restoreHospitalPublishState(snap.PublishedHospitalId, &snap); err != nil {
			l.Errorf("restore hospital publish state: %v", err)
			return nil, err
		}
		if err := l.svcCtx.SurveyModel.UnapproveSubmission(l.ctx, id, snap.PreviousHospitalId); err != nil {
			if err == pgx.ErrNoRows {
				return nil, NewCodeError(409, "仅能撤销已通过的答卷")
			}
			l.Errorf("unapprove after restore: %v", err)
			return nil, ErrInternal
		}
		return l.unapproveResult(id, publishRollbackRestored, "答卷已回到待审核，客户资料已恢复到此次通过前的状态。")
	}

	unsafe, reason, err := l.createdHospitalInUse(snap.PublishedHospitalId, id)
	if err != nil {
		l.Errorf("created hospital in-use check: %v", err)
		return nil, ErrInternal
	}
	if err := l.svcCtx.SurveyModel.UnapproveSubmission(l.ctx, id, snap.PreviousHospitalId); err != nil {
		if err == pgx.ErrNoRows {
			return nil, NewCodeError(409, "仅能撤销已通过的答卷")
		}
		l.Errorf("unapprove before hospital delete: %v", err)
		return nil, ErrInternal
	}
	if unsafe {
		msg := "答卷已回到待审核，但此次通过时新建的客户仍被其他答卷、任务或商机引用，已保留该客户资料。"
		if reason != "" {
			msg = reason
		}
		return l.unapproveResult(id, publishRollbackSkippedInUse, msg)
	}
	if snap.PublishedHospitalId > 0 {
		if err := l.svcCtx.HospitalModel.Delete(l.ctx, snap.PublishedHospitalId); err != nil {
			l.Errorf("delete created hospital: %v", err)
			return l.unapproveResult(id, publishRollbackSkippedInUse, "答卷已回到待审核，但此次通过时新建的客户无法删除（可能仍被引用），已保留该客户资料。")
		}
	}
	return l.unapproveResult(id, publishRollbackHospitalDeleted, "答卷已回到待审核，此次通过时新建的客户已删除。")
}

func (l *SurveyLogic) unapproveResult(id int64, rollback, message string) (*types.UnapproveSurveySubmissionResponse, error) {
	sub, err := l.svcCtx.SurveyModel.FindSubmissionById(l.ctx, id)
	if err != nil || sub == nil {
		l.Errorf("reload unapproved submission: %v", err)
		return nil, ErrInternal
	}
	return &types.UnapproveSurveySubmissionResponse{
		Submission:      toSurveySubmissionInfo(sub),
		PublishRollback: rollback,
		Message:         message,
	}, nil
}

func (l *SurveyLogic) createdHospitalInUse(hospitalID, excludeSubmissionID int64) (bool, string, error) {
	if hospitalID <= 0 {
		return false, "", nil
	}
	subs, err := l.svcCtx.SurveyModel.CountSubmissionsByHospital(l.ctx, hospitalID, excludeSubmissionID)
	if err != nil {
		return false, "", err
	}
	assigns, err := l.svcCtx.SurveyModel.CountAssignmentsByHospital(l.ctx, hospitalID)
	if err != nil {
		return false, "", err
	}
	// cases was dropped in 010_drop_cases.sql; do not query it.
	if subs > 0 || assigns > 0 {
		return true, "答卷已回到待审核，但此次通过时新建的客户仍被其他答卷或任务引用，已保留该客户资料。", nil
	}
	return false, "", nil
}

func (l *SurveyLogic) saveApprovalSnapshot(id int64, previousHospitalID *int64, outcome hospitalPublishOutcome) error {
	snap := approvalSnapshot{
		Version:             1,
		PreviousHospitalId:  previousHospitalID,
		PublishedHospitalId: outcome.HospitalID,
		HospitalCreated:     outcome.Created,
	}
	if outcome.Before != nil {
		snap.Hospital = outcome.Before.Hospital
		snap.Devices = outcome.Before.Devices
		snap.Attributes = outcome.Before.Attributes
		snap.Metrics = outcome.Before.Metrics
		snap.AssayCodes = outcome.Before.AssayCodes
		snap.Eqa = outcome.Before.Eqa
	}
	raw, err := json.Marshal(snap)
	if err != nil {
		return err
	}
	return l.svcCtx.SurveyModel.SetApprovalSnapshot(l.ctx, id, raw)
}

func (l *SurveyLogic) captureHospitalPublishState(hospitalID int64) (*approvalHospitalState, error) {
	if hospitalID <= 0 {
		return nil, nil
	}
	h, err := l.svcCtx.HospitalModel.FindById(l.ctx, hospitalID)
	if err != nil {
		return nil, err
	}
	if h == nil {
		return nil, nil
	}
	devices, err := l.svcCtx.DeviceModel.ListByHospital(l.ctx, hospitalID)
	if err != nil {
		return nil, err
	}
	attrs, err := l.svcCtx.MasterDataModel.ListAttributes(l.ctx, hospitalID)
	if err != nil {
		return nil, err
	}
	metrics, err := l.svcCtx.MasterDataModel.ListAllMetrics(l.ctx, hospitalID)
	if err != nil {
		return nil, err
	}
	assayCodes, err := l.svcCtx.MasterDataModel.ListHospitalOwnAssayCodes(l.ctx, hospitalID)
	if err != nil {
		return nil, err
	}
	eqa, err := l.captureEqaState(hospitalID)
	if err != nil {
		return nil, err
	}
	state := &approvalHospitalState{
		Hospital:   hospitalToSnap(h),
		Devices:    make([]approvalDeviceSnap, 0, len(devices)),
		Attributes: attrs,
		Metrics:    metrics,
		AssayCodes: assayCodes,
		Eqa:        eqa,
	}
	if state.Attributes == nil {
		state.Attributes = map[string]string{}
	}
	if state.Metrics == nil {
		state.Metrics = []model.HospitalMetric{}
	}
	if state.AssayCodes == nil {
		state.AssayCodes = []string{}
	}
	for i := range devices {
		state.Devices = append(state.Devices, deviceToSnap(&devices[i]))
	}
	return state, nil
}

func (l *SurveyLogic) captureEqaState(hospitalID int64) ([]approvalEqaSnap, error) {
	out := []approvalEqaSnap{}
	if hospitalID <= 0 {
		return out, nil
	}
	offset := 0
	var total int64 = -1
	for {
		page, n, err := l.svcCtx.EqaModel.ListParticipations(l.ctx, 0, "", hospitalID, 0, "", 200, offset)
		if err != nil {
			return nil, err
		}
		if total < 0 {
			total = n
		}
		for i := range page {
			p := page[i]
			items, err := l.svcCtx.EqaModel.ListItems(l.ctx, p.Id)
			if err != nil {
				return nil, err
			}
			snap := approvalEqaSnap{
				Id:          p.Id,
				Year:        p.Year,
				Scope:       p.Scope,
				Tags:        p.Tags,
				OwnerUserId: p.OwnerUserId,
				Items:       make([]approvalEqaItemSnap, 0, len(items)),
			}
			for _, it := range items {
				snap.Items = append(snap.Items, approvalEqaItemSnap{FieldCode: it.FieldCode, Value: it.Value})
			}
			out = append(out, snap)
		}
		offset += len(page)
		if len(page) == 0 || int64(offset) >= total {
			break
		}
	}
	return out, nil
}

func (l *SurveyLogic) restoreHospitalPublishState(hospitalID int64, snap *approvalSnapshot) error {
	if hospitalID <= 0 {
		return NewCodeError(409, "无法回滚：原客户资料已不存在")
	}
	h, err := l.svcCtx.HospitalModel.FindById(l.ctx, hospitalID)
	if err != nil {
		l.Errorf("restore find hospital: %v", err)
		return ErrInternal
	}
	if h == nil {
		return NewCodeError(409, "无法回滚：原客户资料已不存在")
	}
	if snap.Hospital != nil {
		hs := snap.Hospital
		h.Name = hs.Name
		h.Province = hs.Province
		h.City = hs.City
		h.District = hs.District
		h.Level = hs.Level
		h.Type = hs.Type
		if hs.Status != "" {
			h.Status = hs.Status
		}
		h.Address = hs.Address
		h.Remark = hs.Remark
		h.CustomerCode = hs.CustomerCode
		h.Region = hs.Region
		h.BranchOffice = hs.BranchOffice
		if hs.Archive != nil {
			h.Archive = hs.Archive
		} else {
			h.Archive = map[string]any{}
		}
		if err := l.svcCtx.HospitalModel.Update(l.ctx, h); err != nil {
			l.Errorf("restore hospital update: %v", err)
			return ErrInternal
		}
	}
	if err := l.restoreDevices(hospitalID, snap.Devices); err != nil {
		return err
	}
	attrs := snap.Attributes
	if attrs == nil {
		attrs = map[string]string{}
	}
	if err := l.svcCtx.MasterDataModel.ReplaceAttributes(l.ctx, hospitalID, attrs); err != nil {
		l.Errorf("restore attributes: %v", err)
		return ErrInternal
	}
	metrics := snap.Metrics
	if metrics == nil {
		metrics = []model.HospitalMetric{}
	}
	if err := l.svcCtx.MasterDataModel.ReplaceAllMetrics(l.ctx, hospitalID, metrics); err != nil {
		l.Errorf("restore metrics: %v", err)
		return ErrInternal
	}
	if err := l.svcCtx.DeviceModel.SyncHospitalAssaysFromDevices(l.ctx, hospitalID); err != nil {
		l.Errorf("restore sync assays from devices: %v", err)
		return ErrInternal
	}
	codes := snap.AssayCodes
	if codes == nil {
		codes = []string{}
	}
	if err := l.svcCtx.MasterDataModel.ReplaceHospitalAssaysByCodes(l.ctx, hospitalID, codes, "own"); err != nil {
		l.Errorf("restore own assays: %v", err)
		return ErrInternal
	}
	if err := l.restoreEqaState(hospitalID, snap.Eqa); err != nil {
		return err
	}
	return nil
}

func (l *SurveyLogic) restoreDevices(hospitalID int64, snaps []approvalDeviceSnap) error {
	current, err := l.svcCtx.DeviceModel.ListByHospital(l.ctx, hospitalID)
	if err != nil {
		l.Errorf("restore list devices: %v", err)
		return ErrInternal
	}
	byID := map[int64]*model.Device{}
	bySerial := map[string]*model.Device{}
	for i := range current {
		d := &current[i]
		byID[d.Id] = d
		if s := strings.TrimSpace(d.SerialNo); s != "" {
			bySerial[s] = d
		}
	}
	keep := map[int64]struct{}{}
	for i := range snaps {
		s := snaps[i]
		target := byID[s.Id]
		if target == nil {
			if serial := strings.TrimSpace(s.SerialNo); serial != "" {
				target = bySerial[serial]
			}
		}
		dev := &model.Device{
			HospitalId:          hospitalID,
			Brand:               s.Brand,
			Category:            s.Category,
			AssayLineCode:       s.AssayLineCode,
			Model:               s.Model,
			SerialNo:            s.SerialNo,
			Status:              s.Status,
			InstalledAt:         parseSnapDate(s.InstalledAt),
			EnabledAt:           parseSnapDate(s.EnabledAt),
			UsageLocation:       s.UsageLocation,
			Remark:              s.Remark,
			ServiceEvaluation:   s.ServiceEvaluation,
			ReagentBrand:        s.ReagentBrand,
			MonthlySampleVolume: s.MonthlySampleVolume,
			DeptHead:            s.DeptHead,
			ChannelCsa:          s.ChannelCsa,
			ItemCodes:           s.ItemCodes,
		}
		if dev.ItemCodes == nil {
			dev.ItemCodes = []string{}
		}
		if dev.Status == "" {
			dev.Status = "active"
		}
		if target != nil {
			dev.Id = target.Id
			if err := l.svcCtx.DeviceModel.Update(l.ctx, dev); err != nil {
				l.Errorf("restore update device: %v", err)
				return ErrInternal
			}
			keep[dev.Id] = struct{}{}
			continue
		}
		newID, err := l.svcCtx.DeviceModel.Insert(l.ctx, dev)
		if err != nil {
			l.Errorf("restore insert device: %v", err)
			return ErrInternal
		}
		keep[newID] = struct{}{}
	}
	for _, d := range current {
		if _, ok := keep[d.Id]; ok {
			continue
		}
		if err := l.svcCtx.DeviceModel.Delete(l.ctx, d.Id); err != nil {
			l.Errorf("restore delete device: %v", err)
			return ErrInternal
		}
	}
	return nil
}

func (l *SurveyLogic) restoreEqaState(hospitalID int64, snaps []approvalEqaSnap) error {
	current, err := l.captureEqaState(hospitalID)
	if err != nil {
		l.Errorf("restore list eqa: %v", err)
		return ErrInternal
	}
	byID := map[int64]int64{}
	byKey := map[string]int64{}
	for _, p := range current {
		byID[p.Id] = p.Id
		byKey[eqaKey(p.Year, p.Scope)] = p.Id
	}
	keep := map[int64]struct{}{}
	for i := range snaps {
		s := snaps[i]
		pid := byID[s.Id]
		if pid == 0 {
			pid = byKey[eqaKey(s.Year, s.Scope)]
		}
		items := make([]model.EqaParticipationItem, 0, len(s.Items))
		for _, it := range s.Items {
			code := strings.TrimSpace(it.FieldCode)
			if code == "" {
				continue
			}
			items = append(items, model.EqaParticipationItem{FieldCode: code, Value: it.Value})
		}
		if pid > 0 {
			p, err := l.svcCtx.EqaModel.FindParticipation(l.ctx, pid)
			if err != nil || p == nil {
				l.Errorf("restore find eqa: %v", err)
				return ErrInternal
			}
			p.Year = s.Year
			p.Scope = s.Scope
			if s.Tags != nil {
				p.Tags = s.Tags
			} else {
				p.Tags = []string{}
			}
			p.OwnerUserId = s.OwnerUserId
			if _, err := l.svcCtx.EqaModel.UpdateParticipation(l.ctx, p); err != nil {
				l.Errorf("restore update eqa: %v", err)
				return ErrInternal
			}
			if err := l.svcCtx.EqaModel.ReplaceItems(l.ctx, pid, items); err != nil {
				l.Errorf("restore replace eqa items: %v", err)
				return ErrInternal
			}
			keep[pid] = struct{}{}
			continue
		}
		created, err := l.svcCtx.EqaModel.CreateParticipation(l.ctx, &model.EqaParticipation{
			HospitalId:  hospitalID,
			Year:        s.Year,
			Scope:       s.Scope,
			Tags:        s.Tags,
			OwnerUserId: s.OwnerUserId,
		})
		if err != nil || created == nil {
			l.Errorf("restore create eqa: %v", err)
			return ErrInternal
		}
		if err := l.svcCtx.EqaModel.ReplaceItems(l.ctx, created.Id, items); err != nil {
			l.Errorf("restore create eqa items: %v", err)
			return ErrInternal
		}
		keep[created.Id] = struct{}{}
	}
	for _, p := range current {
		if _, ok := keep[p.Id]; ok {
			continue
		}
		if err := l.svcCtx.EqaModel.DeleteParticipation(l.ctx, p.Id); err != nil {
			l.Errorf("restore delete eqa: %v", err)
			return ErrInternal
		}
	}
	return nil
}

func hospitalToSnap(h *model.Hospital) *approvalHospitalSnap {
	if h == nil {
		return nil
	}
	archive := h.Archive
	if archive == nil {
		archive = map[string]any{}
	}
	return &approvalHospitalSnap{
		Name:         h.Name,
		Province:     h.Province,
		City:         h.City,
		District:     h.District,
		Level:        h.Level,
		Type:         h.Type,
		Status:       h.Status,
		Address:      h.Address,
		Remark:       h.Remark,
		CustomerCode: h.CustomerCode,
		Region:       h.Region,
		BranchOffice: h.BranchOffice,
		Archive:      archive,
	}
}

func deviceToSnap(d *model.Device) approvalDeviceSnap {
	codes := d.ItemCodes
	if codes == nil {
		codes = []string{}
	}
	return approvalDeviceSnap{
		Id:                  d.Id,
		Brand:               d.Brand,
		Category:            d.Category,
		AssayLineCode:       d.AssayLineCode,
		Model:               d.Model,
		SerialNo:            d.SerialNo,
		Status:              d.Status,
		InstalledAt:         formatSnapDate(d.InstalledAt),
		EnabledAt:           formatSnapDate(d.EnabledAt),
		UsageLocation:       d.UsageLocation,
		Remark:              d.Remark,
		ServiceEvaluation:   d.ServiceEvaluation,
		ReagentBrand:        d.ReagentBrand,
		MonthlySampleVolume: d.MonthlySampleVolume,
		DeptHead:            d.DeptHead,
		ChannelCsa:          d.ChannelCsa,
		ItemCodes:           codes,
	}
}

func formatSnapDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}

func parseSnapDate(raw string) *time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	layouts := []string{time.RFC3339, "2006-01-02", "2006-01-02T15:04:05", "2006/01/02"}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return &t
		}
	}
	return nil
}

func eqaKey(year int, scope string) string {
	return strings.TrimSpace(scope) + ":" + strconv.Itoa(year)
}
