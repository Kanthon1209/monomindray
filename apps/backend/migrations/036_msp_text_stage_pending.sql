-- +goose Up
-- 1) MSP工单号: catalog + templates must be text (was wrongly type=number / key=m)
-- 2) Reactivate customer_stage + pending_issues (soft-off in 032)
-- 3) Keep hospital.archive.mspOrderNo active for immuno_archive_v1 binding

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order, is_active)
VALUES
    (
        'hospital.archive.mspOrderNo',
        'hospital',
        'hospital.archive.mspOrderNo',
        'text',
        'MSP工单号',
        '档案扩展',
        '[]'::jsonb,
        '',
        840,
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

-- Fix existing template fields: MSP must be text; normalize key when it was truncated to "m"
UPDATE survey_templates t
SET schema = jsonb_set(
        schema,
        '{fields}',
        COALESCE((
            SELECT jsonb_agg(
                CASE
                    WHEN COALESCE(f->>'label', '') = 'MSP工单号'
                      OR COALESCE(f->>'target', '') = 'hospital.archive.mspOrderNo'
                      OR lower(COALESCE(f->>'key', '')) IN ('m', 'msporderno', 'msp_order_no')
                    THEN jsonb_strip_nulls(
                        f
                        || jsonb_build_object(
                            'type', 'text',
                            'target', 'hospital.archive.mspOrderNo',
                            'key', CASE
                                WHEN COALESCE(f->>'key', '') IN ('', 'm') THEN 'mspOrderNo'
                                ELSE f->>'key'
                            END
                        )
                    )
                    ELSE f
                END
                ORDER BY ord
            )
            FROM jsonb_array_elements(t.schema->'fields') WITH ORDINALITY AS x(f, ord)
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE schema ? 'fields'
  AND (
        schema::text ILIKE '%MSP工单号%'
     OR schema::text ILIKE '%mspOrderNo%'
     OR schema::text ILIKE '%"key": "m"%'
  );

-- Allow assignment status「驳回」
ALTER TABLE survey_assignments
    DROP CONSTRAINT IF EXISTS survey_assignments_status_check;
ALTER TABLE survey_assignments
    ADD CONSTRAINT survey_assignments_status_check CHECK (
        status::text = ANY (ARRAY[
            'todo'::text,
            'in_progress'::text,
            'submitted'::text,
            'rejected'::text,
            'cancelled'::text
        ])
    );

-- Clear dirty enum values outside the preset list
DELETE FROM hospital_attributes
WHERE attr_key = 'customer_stage'
  AND TRIM(attr_value) <> ''
  AND TRIM(attr_value) NOT IN ('覆盖不满足', '覆盖满足', '客户满意', '客户认可');

-- +goose Down
UPDATE survey_assignments SET status = 'in_progress' WHERE status = 'rejected';
ALTER TABLE survey_assignments
    DROP CONSTRAINT IF EXISTS survey_assignments_status_check;
ALTER TABLE survey_assignments
    ADD CONSTRAINT survey_assignments_status_check CHECK (
        status::text = ANY (ARRAY[
            'todo'::text,
            'in_progress'::text,
            'submitted'::text,
            'cancelled'::text
        ])
    );

UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code IN (
    'hospital.archive.mspOrderNo',
    'hospital.attributes.customer_stage',
    'hospital.attributes.pending_issues'
);
