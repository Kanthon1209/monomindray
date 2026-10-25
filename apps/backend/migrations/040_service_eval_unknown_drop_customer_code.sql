-- +goose Up
-- 35: add 竞品未知 to device service evaluation enum
-- 36: soft-deactivate 客户编码 (hospital.customerCode) from catalog + live templates

UPDATE collectable_fields
SET enum_values = '["无专人负责","新人 有资质","负责区域一年以上","客户关系良好, 口碑优于竞品","竞品未知"]'::jsonb,
    updated_at = NOW()
WHERE code = 'device.service_evaluation'
   OR storage_target = 'device.service_evaluation';

COMMENT ON COLUMN devices.service_evaluation IS
    '客户服务评价: 无专人负责 | 新人 有资质 | 负责区域一年以上 | 客户关系良好, 口碑优于竞品 | 竞品未知';

-- Soft-deactivate 客户编码 from collectable catalog (keep hospitals.customer_code column + data)
UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code IN (
        'hospital.customerCode',
        'hospital.archive.customerCode'
    )
   OR storage_target IN (
        'hospital.customerCode',
        'hospital.archive.customerCode'
    );

-- Drop customerCode-bound fields from live survey templates
UPDATE survey_templates t
SET schema = jsonb_set(
        schema,
        '{fields}',
        COALESCE((
            SELECT COALESCE(jsonb_agg(f ORDER BY ordinality), '[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb))
                WITH ORDINALITY AS x(f, ordinality)
            WHERE COALESCE(f->>'target', '') NOT IN (
                    'hospital.customerCode',
                    'hospital.archive.customerCode'
                )
              AND COALESCE(f->>'key', '') NOT IN ('customerCode', 'customer_code')
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
    WHERE COALESCE(f->>'target', '') IN (
            'hospital.customerCode',
            'hospital.archive.customerCode'
        )
       OR COALESCE(f->>'key', '') IN ('customerCode', 'customer_code')
);

-- +goose Down
UPDATE collectable_fields
SET enum_values = '["无专人负责","新人 有资质","负责区域一年以上","客户关系良好, 口碑优于竞品"]'::jsonb,
    updated_at = NOW()
WHERE code = 'device.service_evaluation'
   OR storage_target = 'device.service_evaluation';

COMMENT ON COLUMN devices.service_evaluation IS
    '客户服务评价: 无专人负责 | 新人 有资质 | 负责区域一年以上 | 客户关系良好, 口碑优于竞品';

UPDATE collectable_fields
SET is_active = TRUE,
    label = CASE
        WHEN code = 'hospital.customerCode' THEN '客户编码'
        WHEN code = 'hospital.archive.customerCode' THEN '客户代码'
        ELSE label
    END,
    updated_at = NOW()
WHERE code IN (
        'hospital.customerCode',
        'hospital.archive.customerCode'
    )
   OR storage_target IN (
        'hospital.customerCode',
        'hospital.archive.customerCode'
    );
