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
	AdminUpdateUserRequest struct {
		Id     int64  `path:"id"`
		Name   string `json:"name"`
		Email  string `json:"email"`
		Role   string `json:"role"`
		Status string `json:"status"`
		Avatar string `json:"avatar,optional"`
	}
	AdminDeleteUserResponse struct {
		Id int64 `json:"id"`
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
		CustomerCode string            `json:"customerCode,omitempty"`
		Region       string            `json:"region,omitempty"`
		BranchOffice string            `json:"branchOffice,omitempty"`
		Archive      map[string]any    `json:"archive,omitempty"`
		Attributes   map[string]string `json:"attributes,omitempty"`
		Metrics      map[string]string `json:"metrics,omitempty"`
		DeviceCount  int               `json:"deviceCount"`
		DeviceModels []string          `json:"deviceModels"`
		AssayNames   []string          `json:"assayNames,omitempty"`
		CreatedAt    string            `json:"createdAt,omitempty"`
	}
	HospitalUpsertRequest struct {
		Name         string            `json:"name"`
		Province     string            `json:"province"`
		City         string            `json:"city"`
		District     string            `json:"district,omitempty"`
		Level        string            `json:"level"`
		Type         string            `json:"type"`
		Status       string            `json:"status,omitempty"`
		Address      string            `json:"address,omitempty"`
		Remark       string            `json:"remark,omitempty"`
		CustomerCode string            `json:"customerCode,optional"`
		Region       string            `json:"region,optional"`
		BranchOffice string            `json:"branchOffice,optional"`
		Attributes   map[string]string `json:"attributes,optional"`
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
		Sort           string `form:"sort,optional"`
		Page           int    `form:"page,optional"`
		PageSize       int    `form:"pageSize,optional"`
	}
	ListHospitalsResponse struct {
		Total int64          `json:"total"`
		Items []HospitalInfo `json:"items"`
	}
	// Lightweight hospital lookup for survey fill (collectors + admins).
	SearchHospitalsRequest struct {
		Keyword string `form:"keyword,optional"`
		Limit   int    `form:"limit,optional"`
	}
	HospitalSearchOption struct {
		Id       int64  `json:"id"`
		Name     string `json:"name"`
		Province string `json:"province,omitempty"`
		City     string `json:"city,omitempty"`
		District string `json:"district,omitempty"`
		Level    string `json:"level,omitempty"`
		Type     string `json:"type,omitempty"`
	}
	SearchHospitalsResponse struct {
		Items []HospitalSearchOption `json:"items"`
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
		Id                 int64    `json:"id"`
		HospitalId         int64    `json:"hospitalId"`
		HospitalName       string   `json:"hospitalName,omitempty"`
		Brand              string   `json:"brand,omitempty"`
		Category           string   `json:"category"`
		AssayLineCode      string   `json:"assayLineCode,omitempty"`
		Model              string   `json:"model"`
		SerialNo           string   `json:"serialNo,omitempty"`
		Status             string   `json:"status"`
		InstalledAt        string   `json:"installedAt,omitempty"`
		EnabledAt          string   `json:"enabledAt,omitempty"`
		Remark             string   `json:"remark,omitempty"`
		ServiceEvaluation  string   `json:"serviceEvaluation,omitempty"`
		ItemCodes          []string `json:"itemCodes,omitempty"`
	}
	DeviceUpsertRequest struct {
		HospitalId         int64    `json:"hospitalId,optional"`
		Brand              string   `json:"brand,optional"`
		Category           string   `json:"category,optional"`
		AssayLineCode      string   `json:"assayLineCode,optional"`
		Model              string   `json:"model"`
		SerialNo           string   `json:"serialNo,optional"`
		Status             string   `json:"status,optional"`
		InstalledAt        string   `json:"installedAt,optional"`
		EnabledAt          string   `json:"enabledAt,optional"`
		Remark             string   `json:"remark,optional"`
		ServiceEvaluation  string   `json:"serviceEvaluation,optional"`
		ItemCodes          []string `json:"itemCodes,optional"`
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
	SuggestDeviceBrandsRequest struct {
		Q     string `form:"q,optional"`
		Limit int    `form:"limit,optional"`
	}
	SuggestDeviceBrandsResponse struct {
		Items []string `json:"items"`
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
		Code        string         `json:"code"`
		Title       string         `json:"title"`
		Description string         `json:"description,optional"`
		Schema      map[string]any `json:"schema,optional"`
		Status      string         `json:"status,optional"`
	}
	UpdateSurveyTemplateRequest struct {
		Title       string         `json:"title,optional"`
		Description string         `json:"description,optional"`
		Schema      map[string]any `json:"schema"`
		Status      string         `json:"status,optional"`
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
		Id               int64                   `json:"id"`
		TemplateId       int64                   `json:"templateId"`
		TemplateCode     string                  `json:"templateCode,omitempty"`
		TemplateTitle    string                  `json:"templateTitle,omitempty"`
		Title            string                  `json:"title"`
		Description      string                  `json:"description,omitempty"`
		DueAt            string                  `json:"dueAt,omitempty"`
		Status           string                  `json:"status"`
		Defaults         map[string]string       `json:"defaults,omitempty"`
		LockedKeys       []string                `json:"lockedKeys,omitempty"`
		DistributionMode string                  `json:"distributionMode,omitempty"`
		AssignmentCount  int                     `json:"assignmentCount"`
		CreatedAt        string                  `json:"createdAt,omitempty"`
		Assignments      []SurveyAssignmentBrief `json:"assignments,omitempty"`
	}
	CreateSurveyCampaignRequest struct {
		TemplateId  int64             `json:"templateId"`
		Title       string            `json:"title"`
		Description string            `json:"description,optional"`
		DueAt       string            `json:"dueAt,optional"`
		Defaults    map[string]string `json:"defaults,optional"`
		LockedKeys  []string          `json:"lockedKeys,optional"`
		// hospital (default): one collector + many hospitals → locked hospital per task.
		// collector_open: collectors only → open hospital picker; multi-fill after submit.
		DistributionMode string  `json:"distributionMode,optional"`
		AssigneeId       int64   `json:"assigneeId,optional"`
		HospitalIds      []int64 `json:"hospitalIds,optional"`
		AssigneeIds      []int64 `json:"assigneeIds,optional"`
	}
	ListSurveyCampaignsRequest struct {
		Status   string `form:"status,optional"`
		Page     int    `form:"page,optional"`
		PageSize int    `form:"pageSize,optional"`
	}
	ListSurveyCampaignsResponse struct {
		Total int64                `json:"total"`
		Items []SurveyCampaignInfo `json:"items"`
	}
	SurveyCampaignResponse struct {
		Campaign SurveyCampaignInfo `json:"campaign"`
	}

	SurveyAssignmentInfo struct {
		Id               int64           `json:"id"`
		CampaignId       int64           `json:"campaignId"`
		CampaignTitle    string          `json:"campaignTitle,omitempty"`
		CampaignStatus   string          `json:"campaignStatus,omitempty"`
		DueAt            string          `json:"dueAt,omitempty"`
		Status           string          `json:"status"`
		HospitalId       *int64          `json:"hospitalId,omitempty"`
		HospitalName     string          `json:"hospitalName,omitempty"`
		HospitalOpen     bool            `json:"hospitalOpen,omitempty"`
		TemplateId       int64           `json:"templateId"`
		TemplateCode     string          `json:"templateCode,omitempty"`
		TemplateTitle    string          `json:"templateTitle,omitempty"`
		Schema           json.RawMessage `json:"schema,omitempty"`
		SubmissionId     *int64          `json:"submissionId,omitempty"`
		SubmissionStatus string          `json:"submissionStatus,omitempty"`
		Answers          map[string]any  `json:"answers,omitempty"`
		LockedKeys       []string        `json:"lockedKeys,omitempty"`
		ReviewNote       string          `json:"reviewNote,omitempty"`
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
		Id            int64           `json:"id"`
		AssignmentId  int64           `json:"assignmentId"`
		CampaignTitle string          `json:"campaignTitle,omitempty"`
		AssigneeName  string          `json:"assigneeName,omitempty"`
		AssigneeEmail string          `json:"assigneeEmail,omitempty"`
		CollectorName string          `json:"collectorName,omitempty"`
		HospitalId    *int64          `json:"hospitalId,omitempty"`
		HospitalName  string          `json:"hospitalName,omitempty"`
		Answers       map[string]any  `json:"answers"`
		Schema        json.RawMessage `json:"schema,omitempty"`
		Status        string          `json:"status"`
		SubmittedAt   string          `json:"submittedAt,omitempty"`
		ReviewedAt    string          `json:"reviewedAt,omitempty"`
		ReviewNote    string          `json:"reviewNote,omitempty"`
	}
	ListSurveySubmissionsRequest struct {
		Status   string `form:"status,optional"`
		Page     int    `form:"page,optional"`
		PageSize int    `form:"pageSize,optional"`
	}
	ListSurveySubmissionsResponse struct {
		Total int64                  `json:"total"`
		Items []SurveySubmissionInfo `json:"items"`
	}
	SurveySubmissionResponse struct {
		Submission       SurveySubmissionInfo `json:"submission"`
		NextAssignmentId *int64               `json:"nextAssignmentId,omitempty"`
	}
	ReviewSurveySubmissionRequest struct {
		Note string `json:"note,optional"`
	}

	// ---- assay projects (检测项目字典 / 层级树) ----
	AssayProjectInfo struct {
		Id           int64    `json:"id"`
		Code         string   `json:"code,omitempty"`
		Name         string   `json:"name"`
		ParentCode   string   `json:"parentCode,omitempty"`
		Kind         string   `json:"kind,omitempty"` // line|category|item
		SortOrder    int      `json:"sortOrder,omitempty"`
		LineCategory string   `json:"lineCategory,omitempty"`
		Company      string   `json:"company,omitempty"`
		Aliases      []string `json:"aliases"`
		// Ownership is derived from company (own=迈瑞/Mindray, else competitor); not a stored flag.
		Ownership  string `json:"ownership"` // own | competitor
		Status     string `json:"status"`
		UsageCount int64  `json:"usageCount"`
		CreatedAt  string `json:"createdAt,omitempty"`
		UpdatedAt  string `json:"updatedAt,omitempty"`
	}
	AssayTreeNode struct {
		Code      string          `json:"code"`
		Name      string          `json:"name"`
		Kind      string          `json:"kind"`
		SortOrder int             `json:"sortOrder"`
		Children  []AssayTreeNode `json:"children,omitempty"`
	}
	ListAssayTreeResponse struct {
		Items []AssayTreeNode `json:"items"`
	}
	ListAssayProjectsRequest struct {
		Keyword   string `form:"keyword,optional"`
		Company   string `form:"company,optional"`
		Line      string `form:"line,optional"`
		Status    string `form:"status,optional"`
		Kind      string `form:"kind,optional"`      // line|category|item|all
		Ownership string `form:"ownership,optional"` // own | competitor | all
		Page      int    `form:"page,optional"`
		PageSize  int    `form:"pageSize,optional"`
	}
	ListAssayProjectsResponse struct {
		Total     int64              `json:"total"`
		Items     []AssayProjectInfo `json:"items"`
		Companies []string           `json:"companies"`
	}
	AssayProjectUpsertRequest struct {
		Code         string   `json:"code,optional"`
		Name         string   `json:"name"`
		ParentCode   string   `json:"parentCode,optional"`
		Kind         string   `json:"kind,optional"`
		SortOrder    int      `json:"sortOrder,optional"`
		LineCategory string   `json:"lineCategory,optional"`
		Company      string   `json:"company,optional"`
		Aliases      []string `json:"aliases,optional"`
		Status       string   `json:"status,optional"`
	}
	AssayProjectResponse struct {
		Project AssayProjectInfo `json:"project"`
	}
	AssayProjectOption struct {
		Id        int64  `json:"id"`
		Code      string `json:"code,omitempty"`
		Name      string `json:"name"`
		Company   string `json:"company,omitempty"`
		Ownership string `json:"ownership"`
	}
	ListAssayProjectOptionsResponse struct {
		Items []AssayProjectOption `json:"items"`
	}
	HospitalAssayItem struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	HospitalAssayCategory struct {
		Code      string              `json:"code"`
		Name      string              `json:"name"`
		LineCode  string              `json:"lineCode,omitempty"`
		LineName  string              `json:"lineName,omitempty"`
		ItemCount int                 `json:"itemCount"`
		Items     []HospitalAssayItem `json:"items"`
	}
	HospitalAssayCompetitorDevice struct {
		DeviceId   int64    `json:"deviceId"`
		Brand      string   `json:"brand"`
		Model      string   `json:"model"`
		ItemCodes  []string `json:"itemCodes,omitempty"`
		ItemNames  []string `json:"itemNames,omitempty"`
	}
	HospitalAssayCompetitorCategory struct {
		Code      string                           `json:"code"`
		Name      string                           `json:"name"`
		LineCode  string                           `json:"lineCode,omitempty"`
		LineName  string                           `json:"lineName,omitempty"`
		Devices   []HospitalAssayCompetitorDevice  `json:"devices"`
	}
	HospitalAssaysResponse struct {
		Codes        []string                            `json:"codes"`
		Names        []string                            `json:"names,omitempty"`
		Categories   []HospitalAssayCategory             `json:"categories,omitempty"`
		Competitors  []HospitalAssayCompetitorCategory   `json:"competitors,omitempty"`
		MindrayLines []string                            `json:"mindrayLines,omitempty"`
	}
	ReplaceHospitalAssaysRequest struct {
		Codes  []string `json:"codes"`
		Source string   `json:"source,optional"` // own|competitor|...
	}

	OkResponse struct {
		Ok bool `json:"ok"`
	}

	EqaFieldNode struct {
		Code       string         `json:"code"`
		Name       string         `json:"name"`
		ValueType  string         `json:"valueType"`
		ParentCode string         `json:"parentCode,omitempty"`
		EnumValues []string       `json:"enumValues,omitempty"`
		SortOrder  int64          `json:"sortOrder"`
		Children   []EqaFieldNode `json:"children"`
	}
	EqaFieldTreeResponse struct {
		Items []EqaFieldNode `json:"items"`
	}
	EqaParticipationItemInfo struct {
		Id        int64  `json:"id,omitempty"`
		FieldCode string `json:"fieldCode"`
		FieldName string `json:"fieldName,omitempty"`
		Value     bool   `json:"value"`
	}
	EqaParticipationInfo struct {
		Id           int64                      `json:"id"`
		HospitalId   int64                      `json:"hospitalId"`
		HospitalName string                     `json:"hospitalName,omitempty"`
		Year         int64                      `json:"year"`
		Scope        string                     `json:"scope"`
		Tags         []string                   `json:"tags"`
		OwnerUserId  int64                      `json:"ownerUserId,omitempty"`
		OwnerName    string                     `json:"ownerName,omitempty"`
		ItemCount    int64                      `json:"itemCount"`
		Items        []EqaParticipationItemInfo `json:"items,omitempty"`
		CreatedAt    string                     `json:"createdAt,omitempty"`
		UpdatedAt    string                     `json:"updatedAt,omitempty"`
	}
	EqaParticipationItemInput struct {
		FieldCode string `json:"fieldCode"`
		Value     bool   `json:"value"`
	}
	CreateEqaParticipationRequest struct {
		HospitalId  int64                       `json:"hospitalId"`
		Year        int64                       `json:"year"`
		Scope       string                      `json:"scope"`
		Tags        []string                    `json:"tags,optional"`
		OwnerUserId int64                       `json:"ownerUserId,optional"`
		Items       []EqaParticipationItemInput `json:"items,optional"`
	}
	UpdateEqaParticipationRequest struct {
		Year        int64                       `json:"year,optional"`
		Scope       string                      `json:"scope,optional"`
		Tags        []string                    `json:"tags,optional"`
		OwnerUserId int64                       `json:"ownerUserId,optional"`
		ClearOwner  bool                        `json:"clearOwner,optional"`
		Items       []EqaParticipationItemInput `json:"items,optional"`
	}
	EqaParticipationResponse struct {
		Participation EqaParticipationInfo `json:"participation"`
	}
	ListEqaParticipationsRequest struct {
		Year        int64  `form:"year,optional"`
		Scope       string `form:"scope,optional"`
		HospitalId  int64  `form:"hospitalId,optional"`
		OwnerUserId int64  `form:"ownerUserId,optional"`
		Page        int64  `form:"page,optional"`
		PageSize    int64  `form:"pageSize,optional"`
	}
	ListEqaParticipationsResponse struct {
		Total int64                  `json:"total"`
		Items []EqaParticipationInfo `json:"items"`
	}
	EqaDashboardRequest struct {
		Year int64 `form:"year,optional"`
	}
	EqaScopeCount struct {
		Scope string `json:"scope"`
		Count int64  `json:"count"`
	}
	EqaItemCount struct {
		FieldCode string `json:"fieldCode"`
		FieldName string `json:"fieldName"`
		Count     int64  `json:"count"`
	}
	EqaOwnerProgress struct {
		OwnerUserId   int64  `json:"ownerUserId,omitempty"`
		OwnerName     string `json:"ownerName"`
		Participation int64  `json:"participation"`
		ItemCount     int64  `json:"itemCount"`
	}

	CollectableFieldInfo struct {
		Code          string   `json:"code"`
		Domain        string   `json:"domain"`
		StorageTarget string   `json:"storageTarget"`
		ValueType     string   `json:"valueType"`
		Label         string   `json:"label"`
		Section       string   `json:"section"`
		EnumValues    []string `json:"enumValues,omitempty"`
		OptionsSource string   `json:"optionsSource,omitempty"`
		SortOrder     int64    `json:"sortOrder"`
	}
	ListCollectableFieldsRequest struct {
		Domain string `form:"domain,optional"`
	}
	ListCollectableFieldsResponse struct {
		Items []CollectableFieldInfo `json:"items"`
	}
	EqaDashboardResponse struct {
		Year                int64              `json:"year"`
		TotalParticipations int64              `json:"totalParticipations"`
		CoverageHospitals   int64              `json:"coverageHospitals"`
		ByScope             []EqaScopeCount    `json:"byScope"`
		TopItems            []EqaItemCount     `json:"topItems"`
		OwnerProgress       []EqaOwnerProgress `json:"ownerProgress"`
	}
)
