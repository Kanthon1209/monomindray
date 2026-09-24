package svc

import (
	"context"
	"fmt"

	"mindray/internal/config"
	"mindray/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/zeromicro/go-zero/core/logx"
)

type ServiceContext struct {
	Config        config.Config
	UserModel     model.UserModel
	HospitalModel model.HospitalModel
	DeviceModel   model.DeviceModel
	CustomerModel model.CustomerModel
	SurveyModel   model.SurveyModel
}

func NewServiceContext(c config.Config) *ServiceContext {
	ctx := context.Background()
	dsn := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?pool_max_conns=%d&pool_min_conns=%d",
		c.Postgres.User, c.Postgres.Password, c.Postgres.Host, c.Postgres.Port,
		c.Postgres.Database, c.Postgres.MaxConn, c.Postgres.MaxIdle,
	)
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		logx.Errorf("connect to postgres failed: %v", err)
		panic(fmt.Errorf("connect postgres: %w", err))
	}
	if err := pool.Ping(ctx); err != nil {
		logx.Errorf("ping postgres failed: %v", err)
		panic(fmt.Errorf("ping postgres: %w", err))
	}
	logx.Info("postgres connected successfully")

	return &ServiceContext{
		Config:        c,
		UserModel:     model.NewUserModel(pool),
		HospitalModel: model.NewHospitalModel(pool),
		DeviceModel:   model.NewDeviceModel(pool),
		CustomerModel: model.NewCustomerModel(pool),
		SurveyModel:   model.NewSurveyModel(pool),
	}
}
