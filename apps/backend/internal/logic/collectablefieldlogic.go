package logic

import (
	"context"
	"encoding/json"
	"strings"

	"mindray/internal/authx"
	"mindray/internal/svc"
	"mindray/internal/types"

	"github.com/zeromicro/go-zero/core/logx"
)

type CollectableFieldLogic struct {
	logx.Logger
	ctx    context.Context
	svcCtx *svc.ServiceContext
}

func NewCollectableFieldLogic(ctx context.Context, svcCtx *svc.ServiceContext) *CollectableFieldLogic {
	return &CollectableFieldLogic{Logger: logx.WithContext(ctx), ctx: ctx, svcCtx: svcCtx}
}

func (l *CollectableFieldLogic) List(req *types.ListCollectableFieldsRequest) (*types.ListCollectableFieldsResponse, error) {
	if _, err := authx.UserIDFromCtx(l.ctx); err != nil {
		return nil, ErrUnauthorized
	}
	domain := strings.TrimSpace(req.Domain)
	rows, err := l.svcCtx.CollectableFieldModel.List(l.ctx, domain, true)
	if err != nil {
		l.Errorf("list collectable fields: %v", err)
		return nil, ErrInternal
	}
	items := make([]types.CollectableFieldInfo, 0, len(rows))
	for _, r := range rows {
		var enums []string
		_ = json.Unmarshal(r.EnumValues, &enums)
		items = append(items, types.CollectableFieldInfo{
			Code:          r.Code,
			Domain:        r.Domain,
			StorageTarget: r.StorageTarget,
			ValueType:     r.ValueType,
			Label:         r.Label,
			Section:       r.Section,
			EnumValues:    enums,
			OptionsSource: r.OptionsSource,
			SortOrder:     int64(r.SortOrder),
		})
	}
	return &types.ListCollectableFieldsResponse{Items: items}, nil
}
