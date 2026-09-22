package handler

import (
	"net/http"

	"mindray/internal/svc"

	"github.com/zeromicro/go-zero/rest"
)

func RegisterHandlers(server *rest.Server, svcCtx *svc.ServiceContext) {
	// 公开路由（无需认证）
	server.AddRoutes(
		[]rest.Route{
			{
				Method:  http.MethodPost,
				Path:    "/api/v1/auth/login",
				Handler: LoginHandler(svcCtx),
			},
			{
				Method:  http.MethodPost,
				Path:    "/api/v1/auth/signup",
				Handler: SignupHandler(svcCtx),
			},
		},
	)

	// 需要认证的路由（JWT）
	server.AddRoutes(
		[]rest.Route{
			{
				Method:  http.MethodGet,
				Path:    "/api/v1/user/profile",
				Handler: GetUserHandler(svcCtx),
			},
			{
				Method:  http.MethodPut,
				Path:    "/api/v1/user/profile",
				Handler: UpdateUserHandler(svcCtx),
			},
		},
		rest.WithJwt(svcCtx.Config.Auth.AccessSecret),
	)
}
