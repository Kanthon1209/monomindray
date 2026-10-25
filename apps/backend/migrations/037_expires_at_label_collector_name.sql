-- +goose Up
-- 28) Relabel devices.enabled_at / enabledAt UI as 到期时间 (column stays enabled_at)
-- 31) Add hospital.attributes.collector_name (采集者姓名) to catalog + writeback

UPDATE collectable_fields
SET label = '到期时间',
    updated_at = NOW()
WHERE code = 'hospital.archive.enabledAt'
   OR storage_target = 'hospital.archive.enabledAt';

-- Template field labels that still say 启用日期 / 启用时期 / 到期日期
UPDATE survey_templates t
SET schema = jsonb_set(
        schema,
        '{fields}',
        COALESCE((
            SELECT jsonb_agg(
                CASE
                    WHEN COALESCE(f->>'key', '') IN ('enabledAt')
                      OR COALESCE(f->>'target', '') IN (
                            'hospital.archive.enabledAt',
                            'device.enabledAt',
                            'devices.enabledAt'
                        )
                      OR COALESCE(f->>'label', '') IN ('启用日期', '启用时期', '到期日期')
                    THEN f || jsonb_build_object('label', '到期时间')
                    ELSE f
                END
                ORDER BY ordinality
            )
            FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb))
                WITH ORDINALITY AS t(f, ordinality)
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
    WHERE COALESCE(f->>'key', '') IN ('enabledAt')
       OR COALESCE(f->>'target', '') IN (
            'hospital.archive.enabledAt',
            'device.enabledAt',
            'devices.enabledAt'
        )
       OR COALESCE(f->>'label', '') IN ('启用日期', '启用时期', '到期日期')
);

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order, is_active)
VALUES
    (
        'hospital.attributes.collector_name',
        'hospital',
        'hospital.attributes.collector_name',
        'text',
        '采集者姓名',
        '医院属性',
        '[]'::jsonb,
        '',
        320,
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

-- +goose Down
UPDATE collectable_fields
SET label = '启用日期',
    updated_at = NOW()
WHERE code = 'hospital.archive.enabledAt'
   OR storage_target = 'hospital.archive.enabledAt';

UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code = 'hospital.attributes.collector_name'
   OR storage_target = 'hospital.attributes.collector_name';
