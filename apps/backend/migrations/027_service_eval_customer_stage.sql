-- +goose Up
-- Device: 客户服务评价 (column on devices)
-- Customer: 客户所在阶段 + 客户端待解决问题及需求 (hospital_attributes EAV)
-- Enum options are system-preset in collectable_fields.enum_values (admin cannot invent options).

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS service_evaluation VARCHAR(128) NOT NULL DEFAULT '';

COMMENT ON COLUMN devices.service_evaluation IS
    '客户服务评价: 无专人负责 | 新人 有资质 | 负责区域一年以上 | 客户关系良好, 口碑优于竞品';

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order, is_active)
VALUES
    (
        'device.service_evaluation',
        'device',
        'device.service_evaluation',
        'enum',
        '客户服务评价',
        '设备',
        '["无专人负责","新人 有资质","负责区域一年以上","客户关系良好, 口碑优于竞品"]'::jsonb,
        '',
        810,
        TRUE
    ),
    (
        'hospital.attributes.customer_stage',
        'hospital',
        'hospital.attributes.customer_stage',
        'enum',
        '客户所在阶段',
        '医院属性',
        '["覆盖不满足","覆盖满足","客户满意","客户认可"]'::jsonb,
        '',
        300,
        TRUE
    ),
    (
        'hospital.attributes.pending_issues',
        'hospital',
        'hospital.attributes.pending_issues',
        'text',
        '客户端待解决问题及需求',
        '医院属性',
        '[]'::jsonb,
        '',
        310,
        TRUE
    )
ON CONFLICT (code) DO UPDATE SET
    domain = EXCLUDED.domain,
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    enum_values = EXCLUDED.enum_values,
    options_source = EXCLUDED.options_source,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- Clear dirty enum values if any were previously free-texted under these keys
DELETE FROM hospital_attributes
WHERE attr_key = 'customer_stage'
  AND TRIM(attr_value) NOT IN ('覆盖不满足', '覆盖满足', '客户满意', '客户认可');

UPDATE devices
SET service_evaluation = ''
WHERE service_evaluation <> ''
  AND TRIM(service_evaluation) NOT IN (
      '无专人负责',
      '新人 有资质',
      '负责区域一年以上',
      '客户关系良好, 口碑优于竞品'
  );

-- +goose Down
DELETE FROM collectable_fields
WHERE code IN (
    'device.service_evaluation',
    'hospital.attributes.customer_stage',
    'hospital.attributes.pending_issues'
);

ALTER TABLE devices DROP COLUMN IF EXISTS service_evaluation;
