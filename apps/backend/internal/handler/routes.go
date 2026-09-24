package handler

import (
	"net/http"

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

	server.AddRoutes(
		[]rest.Route{
			{Method: http.MethodGet, Path: "/api/v1/user/profile", Handler: GetUserHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/user/profile", Handler: UpdateUserHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/admin/users", Handler: ListUsersHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/admin/users/:id/approve", Handler: ApproveUserHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/admin/users/:id/reject", Handler: RejectUserHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/dashboard/hospitals", Handler: DashboardHospitalsHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/dashboard/provinces", Handler: DashboardProvincesHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/hospitals", Handler: ListHospitalsHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/hospitals", Handler: CreateHospitalHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/hospitals/:id", Handler: GetHospitalHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/hospitals/:id", Handler: UpdateHospitalHandler(svcCtx)},
			{Method: http.MethodDelete, Path: "/api/v1/hospitals/:id", Handler: DeleteHospitalHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/hospitals/:id/devices", Handler: ListDevicesHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/hospitals/:id/devices", Handler: CreateDeviceHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/devices/:id", Handler: UpdateDeviceHandler(svcCtx)},
			{Method: http.MethodDelete, Path: "/api/v1/devices/:id", Handler: DeleteDeviceHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/customers", Handler: ListCustomersHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/customers", Handler: CreateCustomerHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/customers/:id", Handler: UpdateCustomerHandler(svcCtx)},
			{Method: http.MethodDelete, Path: "/api/v1/customers/:id", Handler: DeleteCustomerHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/cases", Handler: ListCasesHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/cases", Handler: CreateCaseHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/cases/:id", Handler: UpdateCaseHandler(svcCtx)},
			{Method: http.MethodDelete, Path: "/api/v1/cases/:id", Handler: DeleteCaseHandler(svcCtx)},

			{Method: http.MethodGet, Path: "/api/v1/surveys/templates", Handler: ListSurveyTemplatesHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/surveys/templates", Handler: CreateSurveyTemplateHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/surveys/templates/:id", Handler: GetSurveyTemplateHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/surveys/templates/:id", Handler: UpdateSurveyTemplateHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/surveys/campaigns", Handler: ListSurveyCampaignsHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/surveys/campaigns", Handler: CreateSurveyCampaignHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/surveys/campaigns/:id", Handler: GetSurveyCampaignHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/surveys/campaigns/:id/close", Handler: CloseSurveyCampaignHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/me/survey-assignments", Handler: ListMySurveyAssignmentsHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/me/survey-assignments/:id", Handler: GetMySurveyAssignmentHandler(svcCtx)},
			{Method: http.MethodPut, Path: "/api/v1/me/survey-assignments/:id/draft", Handler: SaveSurveyDraftHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/me/survey-assignments/:id/submit", Handler: SubmitSurveyAssignmentHandler(svcCtx)},
			{Method: http.MethodGet, Path: "/api/v1/surveys/submissions", Handler: ListSurveySubmissionsHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/surveys/submissions/:id/approve", Handler: ApproveSurveySubmissionHandler(svcCtx)},
			{Method: http.MethodPost, Path: "/api/v1/surveys/submissions/:id/reject", Handler: RejectSurveySubmissionHandler(svcCtx)},
		},
		rest.WithJwt(svcCtx.Config.Auth.AccessSecret),
	)
}
