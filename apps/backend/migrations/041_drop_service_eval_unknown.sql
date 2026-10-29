-- +goose Up
-- Remove 竞品未知 from device 客户服务评价 enum options (keep historical device rows as-is)

UPDATE collectable_fields
SET enum_values = '["无专人负责","新人 有资质","负责区域一年以上","客户关系良好, 口碑优于竞品"]'::jsonb,
    updated_at = NOW()
WHERE code = 'device.service_evaluation'
   OR storage_target = 'device.service_evaluation';

COMMENT ON COLUMN devices.service_evaluation IS
    '客户服务评价: 无专人负责 | 新人 有资质 | 负责区域一年以上 | 客户关系良好, 口碑优于竞品';

-- +goose Down
UPDATE collectable_fields
SET enum_values = '["无专人负责","新人 有资质","负责区域一年以上","客户关系良好, 口碑优于竞品","竞品未知"]'::jsonb,
    updated_at = NOW()
WHERE code = 'device.service_evaluation'
   OR storage_target = 'device.service_evaluation';

COMMENT ON COLUMN devices.service_evaluation IS
    '客户服务评价: 无专人负责 | 新人 有资质 | 负责区域一年以上 | 客户关系良好, 口碑优于竞品 | 竞品未知';
