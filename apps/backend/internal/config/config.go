package config

import "github.com/zeromicro/go-zero/rest"

type Config struct {
	rest.RestConf
	Auth struct {
		AccessSecret string
		ExpireAfter  int64 // seconds
	}
	Postgres struct {
		Host     string
		Port     int
		User     string
		Password string
		Database string
		MaxConn  int
		MaxIdle  int
	}
}
