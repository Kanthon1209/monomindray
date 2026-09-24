package types

import "encoding/json"

type (
	LoginRequest struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	LoginResponse struct {
		Token string   `json:"token"`
		User  UserInfo `json:"user"`
	}
	SignupRequest struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	SignupResponse struct {
		Message string   `json:"message"`
		User    UserInfo `json:"user"`
	}
	UserInfo struct {
		Id        int64  `json:"id"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		Role      string `json:"role"`
		Status    string `json:"status"`
		Avatar    string `json:"avatar,omitempty"`
		CreatedAt string `json:"createdAt,omitempty"`
	}
	UpdateUserRequest struct {
		Name   string `json:"name"`
		Email  string `json:"email"`
		Avatar string `json:"avatar,omitempty"`
	}
	GetUserResponse struct {
		User UserInfo `json:"user"`
	}
	ListUsersRequest struct {
		Status   string `form:"status,optional"`
		Page     int    `form:"page,optional"`
		PageSize int    `form:"pageSize,optional"`
	}
	ListUsersResponse struct {
		Total int64      `json:"total"`
		Items []UserInfo `json:"items"`
	}
	ReviewUserRequest struct {
		Id int64 `path:"id"`
	}
	ReviewUserResponse struct {
		User UserInfo `json:"user"`
	}

	HospitalInfo struct {
		Id           int64             `json:"id"`
		Name         string            `json:"name"`
		Province     string            `json:"province"`
		City         string            `json:"city"`
		District     string            `json:"district,omitempty"`
		Level        string            `json:"level"`
		Type         string            `json:"type"`
		Status       string            `json:"status"`
		Address      string            `json:"address,omitempty"`
		Remark       string            `json:"remark,omitempty"`
		Archive      map[string]any    `json:"archive,omitempty"`
		DeviceCount  int               `json:"deviceCount"`
		DeviceModels []string          `json:"deviceModels"`
		CreatedAt    string            `json:"createdAt,omitempty"`
	}
	HospitalUpsertRequest struct {
		Name     string `json:"name"`
		Province string `json:"province"`
		City     string `json:"city"`
		District string `json:"district,omitempty"`
		Level    string `json:"level"`
		Type     string `json:"type"`
		Status   string `json:"status,omitempty"`
		Address  string `json:"address,omitempty"`
		Remark   string `json:"remark,omitempty"`
	}
	IdPathRequest struct {
		Id int64 `path:"id"`
	}
	HospitalIdPathRequest struct {
		Id int64 `path:"id"`
	}
	ListHospitalsRequest struct {
		Province       string `form:"province,optional"`
		Level          string `form:"level,optional"`
		Type           string `form:"type,optional"`
		Status         string `form:"status,optional"`
		DeviceCategory string `form:"deviceCategory,optional"`
		DeviceModel    string `form:"deviceModel,optional"`
		Keyword        string `form:"keyword,optional"`
		Page           int    `form:"page,optional"`
		PageSize       int    `form:"pageSize,optional"`
	}
	ListHospitalsResponse struct {
		Total int64          `json:"total"`
		Items []HospitalInfo `json:"items"`
	}
	HospitalResponse struct {
		Hospital HospitalInfo `json:"hospital"`
	}
	DashboardHospitalsRequest struct {
		Region         string `form:"region,optional"`
		Province       string `form:"province,optional"`
		City           string `form:"city,optional"`
		Level          string `form:"level,optional"`
		Type           string `form:"type,optional"`
		Status         string `form:"status,optional"`
		DeviceCategory string `form:"deviceCategory,optional"`
		DeviceModel    string `form:"deviceModel,optional"`
		Keyword        string `form:"keyword,optional"`
	}
	ProvinceStat struct {
		Name  string `json:"name"`
		Value int    `json:"value"`
	}
	DashboardProvincesRequest struct {
		Region string `form:"region,optional"`
	}
	DashboardProvincesResponse struct {
		Items []ProvinceStat `json:"items"`
	}

	DeviceInfo struct {
		Id           int64  `json:"id"`
		HospitalId   int64  `json:"hospitalId"`
		HospitalName string `json:"hospitalName,omitempty"`
		Brand        string `json:"brand,omitempty"`
		Category     string `json:"category"`
		Model        string `json:"model"`
		SerialNo     string `json:"serialNo,omitempty"`
		Status       string `json:"status"`
		InstalledAt  string `json:"installedAt,omitempty"`
		Remark       string `json:"remark,omitempty"`
	}
	DeviceUpsertRequest struct {
		HospitalId  int64  `json:"hospitalId,optional"`
		Brand       string `json:"brand,optional"`
		Category    string `json:"category"`
		Model       string `json:"model"`
		SerialNo    string `json:"serialNo,optional"`
		Status      string `json:"status,optional"`
		InstalledAt string `json:"installedAt,optional"`
		Remark      string `json:"remark,optional"`
	}
	ListDevicesRequest struct {
		HospitalId int64  `form:"hospitalId,optional"`
		Brand      string `form:"brand,optional"`
		Category   string `form:"category,optional"`
		Status     string `form:"status,optional"`
		Keyword    string `form:"keyword,optional"`
		Page       int    `form:"page,optional"`
		PageSize   int    `form:"pageSize,optional"`
	}
	ListDevicesResponse struct {
		Total int64        `json:"total"`
		Items []DeviceInfo `json:"items"`
	}
	DeviceResponse struct {
		Device DeviceInfo `json:"device"`
	}

	CustomerInfo struct {
		Id           int64  `json:"id"`
		HospitalId   *int64 `json:"hospitalId,omitempty"`
		HospitalName string `json:"hospitalName,omitempty"`
		Name         string `json:"name"`
		Title        string `json:"title,omitempty"`
		Phone        string `json:"phone,omitempty"`
		Email        string `json:"email,omitempty"`
		Remark       string `json:"remark,omitempty"`
		CreatedAt    string `json:"createdAt,omitempty"`
	}
	CustomerUpsertRequest struct {
		HospitalId *int64 `json:"hospitalId,omitempty"`
		Name       string `json:"name"`
		Title      string `json:"title,omitempty"`
		Phone      string `json:"phone,omitempty"`
		Email      string `json:"email,omitempty"`
		Remark     string `json:"remark,omitempty"`
	}
	ListCustomersRequest struct {
		HospitalId int64  `form:"hospitalId,optional"`
		Keyword    string `form:"keyword,optional"`
		Page       int    `form:"page,optional"`
		PageSize   int    `form:"pageSize,optional"`
	}
	ListCustomersResponse struct {
		Total int64          `json:"total"`
		Items []CustomerInfo `json:"items"`
	}
	CustomerResponse struct {
		Customer CustomerInfo `json:"customer"`
	}

	// ---- surveys ----
	SurveyTemplateInfo struct {
		Id          int64           `json:"id"`
		Code        string          `json:"code"`
		Title       string          `json:"title"`
		Description string          `json:"description,omitempty"`
		Schema      json.RawMessage `json:"schema"`
		Version     int             `json:"version"`
		Status      string          `json:"status"`
	}
	ListSurveyTemplatesResponse struct {
		Items []SurveyTemplateInfo `json:"items"`
	}
	SurveyTemplateResponse struct {
		Template SurveyTemplateInfo `json:"template"`
	}
	CreateSurveyTemplateRequest struct {
		Code        string          `json:"code"`
		Title       string          `json:"title"`
		Description string          `json:"description,optional"`
		Schema      json.RawMessage `json:"schema,optional"`
		Status      string          `json:"status,optional"`
	}
	UpdateSurveyTemplateRequest struct {
		Title       string          `json:"title,optional"`
		Description string          `json:"description,optional"`
		Schema      json.RawMessage `json:"schema"`
		Status      string          `json:"status,optional"`
	}

	SurveyAssignmentBrief struct {
		Id               int64  `json:"id"`
		AssigneeId       int64  `json:"assigneeId"`
		AssigneeName     string `json:"assigneeName,omitempty"`
		AssigneeEmail    string `json:"assigneeEmail,omitempty"`
		HospitalId       *int64 `json:"hospitalId,omitempty"`
		HospitalName     string `json:"hospitalName,omitempty"`
		Status           string `json:"status"`
		SubmissionId     *int64 `json:"submissionId,omitempty"`
		SubmissionStatus string `json:"submissionStatus,omitempty"`
	}
	SurveyCampaignInfo struct {
		Id              int64                   `json:"id"`
		TemplateId      int64                   `json:"templateId"`
		TemplateCode    string                  `json:"templateCode,omitempty"`
		TemplateTitle   string                  `json:"templateTitle,omitempty"`
		Title           string                  `json:"title"`
		Description     string                  `json:"description,omitempty"`
		DueAt           string                  `json:"dueAt,omitempty"`
		Status          string                  `json:"status"`
		Defaults        map[string]string       `json:"defaults,omitempty"`
		LockedKeys      []string                `json:"lockedKeys,omitempty"`
		AssignmentCount int                     `json:"assignmentCount"`
		CreatedAt       string                  `json:"createdAt,omitempty"`
		Assignments     []SurveyAssignmentBrief `json:"assignments,omitempty"`
	}
	CreateSurveyCampaignRequest struct {
		TemplateId  int64             `json:"templateId"`
		Title       string            `json:"title"`
		Description string            `json:"description,optional"`
		DueAt       string            `json:"dueAt,optional"`
		Defaults    map[string]string `json:"defaults,optional"`
		LockedKeys  []string          `json:"lockedKeys,optional"`
		// V1: one collector + many hospitals → one task per hospital.
		AssigneeId  int64   `json:"assigneeId,optional"`
		HospitalIds []int64 `json:"hospitalIds,optional"`
		// Legacy fallback (no hospital binding).
		AssigneeIds []int64 `json:"assigneeIds,optional"`
	}
	ListSurveyCampaignsRequest struct {
		Status   string `form:"status,optional"`
		Page     int    `form:"page,optional"`
		PageSize int    `form:"pageSize,optional"`
	}
	ListSurveyCampaignsResponse struct {
		Total int64                 `json:"total"`
		Items []SurveyCampaignInfo  `json:"items"`
	}
	SurveyCampaignResponse struct {
		Campaign SurveyCampaignInfo `json:"campaign"`
	}

	SurveyAssignmentInfo struct {
		Id               int64          `json:"id"`
		CampaignId       int64          `json:"campaignId"`
		CampaignTitle    string         `json:"campaignTitle,omitempty"`
		CampaignStatus   string         `json:"campaignStatus,omitempty"`
		DueAt            string         `json:"dueAt,omitempty"`
		Status           string         `json:"status"`
		HospitalId       *int64         `json:"hospitalId,omitempty"`
		HospitalName     string         `json:"hospitalName,omitempty"`
		TemplateId       int64          `json:"templateId"`
		TemplateCode     string         `json:"templateCode,omitempty"`
		TemplateTitle    string         `json:"templateTitle,omitempty"`
		Schema           json.RawMessage `json:"schema,omitempty"`
		SubmissionId     *int64         `json:"submissionId,omitempty"`
		SubmissionStatus string         `json:"submissionStatus,omitempty"`
		Answers          map[string]any `json:"answers,omitempty"`
		LockedKeys       []string       `json:"lockedKeys,omitempty"`
		ReviewNote       string         `json:"reviewNote,omitempty"`
	}
	ListMySurveyAssignmentsRequest struct {
		Status   string `form:"status,optional"`
		Page     int    `form:"page,optional"`
		PageSize int    `form:"pageSize,optional"`
	}
	ListMySurveyAssignmentsResponse struct {
		Total int64                  `json:"total"`
		Items []SurveyAssignmentInfo `json:"items"`
	}
	SurveyAssignmentResponse struct {
		Assignment SurveyAssignmentInfo `json:"assignment"`
	}
	SaveSurveyAnswersRequest struct {
		Answers    map[string]any `json:"answers"`
		HospitalId *int64         `json:"hospitalId,optional"`
	}

	SurveySubmissionInfo struct {
		Id            int64          `json:"id"`
		AssignmentId  int64          `json:"assignmentId"`
		CampaignTitle string         `json:"campaignTitle,omitempty"`
		AssigneeName  string         `json:"assigneeName,omitempty"`
		AssigneeEmail string         `json:"assigneeEmail,omitempty"`
		CollectorName string         `json:"collectorName,omitempty"`
		HospitalId    *int64         `json:"hospitalId,omitempty"`
		HospitalName  string         `json:"hospitalName,omitempty"`
		Answers       map[string]any `json:"answers"`
		Status        string         `json:"status"`
		SubmittedAt   string         `json:"submittedAt,omitempty"`
		ReviewedAt    string         `json:"reviewedAt,omitempty"`
		ReviewNote    string         `json:"reviewNote,omitempty"`
	}
	ListSurveySubmissionsRequest struct {
		Status   string `form:"status,optional"`
		Page     int    `form:"page,optional"`
		PageSize int    `form:"pageSize,optional"`
	}
	ListSurveySubmissionsResponse struct {
		Total int64                   `json:"total"`
		Items []SurveySubmissionInfo  `json:"items"`
	}
	SurveySubmissionResponse struct {
		Submission SurveySubmissionInfo `json:"submission"`
	}
	ReviewSurveySubmissionRequest struct {
		Note string `json:"note,optional"`
	}
)
