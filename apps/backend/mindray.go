package main

import (
	"flag"
	"fmt"

	"mindray/internal/config"
	"mindray/internal/handler"
	"mindray/internal/logic"
	"mindray/internal/svc"

	"github.com/zeromicro/go-zero/core/conf"
	"github.com/zeromicro/go-zero/rest"
	"github.com/zeromicro/go-zero/rest/httpx"
)

var configFile = flag.String("f", "etc/mindray-api.yaml", "the config file")

func main() {
	flag.Parse()

	var c config.Config
	conf.MustLoad(*configFile, &c)

	httpx.SetErrorHandler(func(err error) (int, any) {
		code := logic.HTTPStatus(err)
		return code, map[string]any{
			"code": code,
			"msg":  err.Error(),
		}
	})

	server := rest.MustNewServer(c.RestConf, rest.WithCors("*"))
	defer server.Stop()

	ctx := svc.NewServiceContext(c)
	handler.RegisterHandlers(server, ctx)

	fmt.Printf("Starting server at %s:%d...\n", c.Host, c.Port)
	server.Start()
}
