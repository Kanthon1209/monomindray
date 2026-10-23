package handler

import (
	"net/http"

	"mindray/internal/middleware"
	"mindray/internal/svc"

	"github.com/zeromicro/go-zero/rest"
)

func RegisterHandlers(server *rest.Server, svcCtx *svc.ServiceContext) {
	server.AddRoutes(
		[]rest.Route{
			{Method: http.MethodPost, Path: "/api/v1/auth/login", Handler: LoginHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/auth/signup", Handler: SignupHandler(svcCtx)},
		},
	)

	// 登录用户共用：个人资料 + 采集员任务接口
	server.AddRoutes(
		[]rest.Route{
			{Method: http.MethodGet, Path: "/api/v1/user/profile", Handler: GetUserHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/user/profile", Handler: UpdateUserHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/me/survey-assignments", Handler: ListMySurveyAssignmentsHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/me/survey-assignments/:id", Handler: GetMySurveyAssignmentHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/me/survey-assignments/:id/draft", Handler: SaveSurveyDraftHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/me/survey-assignments/:id/submit", Handler: SubmitSurveyAssignmentHandler(svcCtx)},

			// Active assay dictionary for survey fill (collectors + admins)
			{Method: http.MethodGet, Path: "/api/v1/assay-projects/options", Handler: ListAssayProjectOptionsHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/assay-projects/tree", Handler: ListAssayTreeHandler(svcCtx)},

			// Hospital name typeahead for survey fill (collectors + admins)
			{Method: http.MethodGet, Path: "/api/v1/hospitals/search", Handler: SearchHospitalsHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/collectable-fields", Handler: ListCollectableFieldsHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/eqa/fields", Handler: ListEqaFieldsHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/eqa/participations", Handler: ListEqaParticipationsHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/eqa/participations/:id", Handler: GetEqaParticipationHandler(svcCtx)},
		},
		rest.WithJwt(svcCtx.Config.Auth.AccessSecret),
	)

	adminRoutes := []rest.Route{
		{Method: http.MethodGet, Path: "/api/v1/admin/users", Handler: ListUsersHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/admin/users/:id/approve", Handler: ApproveUserHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/admin/users/:id/reject", Handler: RejectUserHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/admin/users/:id", Handler: AdminUpdateUserHandler(svcCtx)},
		{Method: http.MethodDelete, Path: "/api/v1/admin/users/:id", Handler: AdminDeleteUserHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/dashboard/hospitals", Handler: DashboardHospitalsHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/dashboard/provinces", Handler: DashboardProvincesHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/hospitals", Handler: ListHospitalsHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/hospitals", Handler: CreateHospitalHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/hospitals/:id", Handler: GetHospitalHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/hospitals/:id", Handler: UpdateHospitalHandler(svcCtx)},
		{Method: http.MethodDelete, Path: "/api/v1/hospitals/:id", Handler: DeleteHospitalHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/hospitals/:id/devices", Handler: ListDevicesHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/hospitals/:id/devices", Handler: CreateDeviceHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/devices", Handler: ListAllDevicesHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/devices", Handler: CreateDeviceGlobalHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/devices/:id", Handler: UpdateDeviceHandler(svcCtx)},
		{Method: http.MethodDelete, Path: "/api/v1/devices/:id", Handler: DeleteDeviceHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/customers", Handler: ListCustomersHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/customers", Handler: CreateCustomerHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/customers/:id", Handler: UpdateCustomerHandler(svcCtx)},
		{Method: http.MethodDelete, Path: "/api/v1/customers/:id", Handler: DeleteCustomerHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/assay-projects", Handler: ListAssayProjectsHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/assay-projects", Handler: CreateAssayProjectHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/assay-projects/:id", Handler: GetAssayProjectHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/assay-projects/:id", Handler: UpdateAssayProjectHandler(svcCtx)},
		{Method: http.MethodDelete, Path: "/api/v1/assay-projects/:id", Handler: DeleteAssayProjectHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/hospitals/:id/assays", Handler: ListHospitalAssaysHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/hospitals/:id/assays", Handler: ReplaceHospitalAssaysHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/surveys/templates", Handler: ListSurveyTemplatesHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/surveys/templates", Handler: CreateSurveyTemplateHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/surveys/templates/:id", Handler: GetSurveyTemplateHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/surveys/templates/:id", Handler: UpdateSurveyTemplateHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/surveys/campaigns", Handler: ListSurveyCampaignsHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/surveys/campaigns", Handler: CreateSurveyCampaignHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/surveys/campaigns/:id", Handler: GetSurveyCampaignHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/surveys/campaigns/:id/close", Handler: CloseSurveyCampaignHandler(svcCtx)},
		{Method: http.MethodGet, Path: "/api/v1/surveys/submissions", Handler: ListSurveySubmissionsHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/surveys/submissions/:id/approve", Handler: ApproveSurveySubmissionHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/surveys/submissions/:id/reject", Handler: RejectSurveySubmissionHandler(svcCtx)},

		{Method: http.MethodGet, Path: "/api/v1/eqa/dashboard", Handler: EqaDashboardHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/eqa/participations", Handler: CreateEqaParticipationHandler(svcCtx)},
		{Method: http.MethodPut, Path: "/api/v1/eqa/participations/:id", Handler: UpdateEqaParticipationHandler(svcCtx)},
		{Method: http.MethodDelete, Path: "/api/v1/eqa/participations/:id", Handler: DeleteEqaParticipationHandler(svcCtx)},
		{Method: http.MethodPost, Path: "/api/v1/eqa/survey-template/ensure", Handler: EnsureEqaSurveyTemplateHandler(svcCtx)},
	}

	// 仅管理员：看板 / 医院 / 设备 / 客户 / 用户管理 / 问卷管理审核
	server.AddRoutes(
		rest.WithMiddlewares([]rest.Middleware{middleware.AdminOnly}, adminRoutes...),
		rest.WithJwt(svcCtx.Config.Auth.AccessSecret),
	)
}
