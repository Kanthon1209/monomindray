-- +goose Up
-- Soft-deactivate 双大客户 (dual_major) from collectable catalog.
-- Keep hospital_attributes.dual_major data rows; UI no longer surfaces it.
-- collector_name stays active for fill-only (not shown on dashboard).

UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code IN (
        'hospital.attributes.dual_major',
        'hospital.archive.dualMajorCustomer'
    )
   OR storage_target IN (
        'hospital.attributes.dual_major',
        'hospital.archive.dualMajorCustomer'
    );

-- Drop dual_major-bound fields from live survey templates so collectors stop seeing them
UPDATE survey_templates t
SET schema = jsonb_set(
        schema,
        '{fields}',
        COALESCE((
            SELECT COALESCE(jsonb_agg(f ORDER BY ordinality), '[]'::jsonb)
            FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb))
                WITH ORDINALITY AS x(f, ordinality)
            WHERE COALESCE(f->>'target', '') NOT IN (
                    'hospital.attributes.dual_major',
                    'hospital.archive.dualMajorCustomer'
                )
              AND COALESCE(f->>'key', '') NOT IN ('dual_major', 'dualMajorCustomer')
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
    WHERE COALESCE(f->>'target', '') IN (
            'hospital.attributes.dual_major',
            'hospital.archive.dualMajorCustomer'
        )
       OR COALESCE(f->>'key', '') IN ('dual_major', 'dualMajorCustomer')
);

-- +goose Down
UPDATE collectable_fields
SET is_active = TRUE,
    label = '双大客户',
    updated_at = NOW()
WHERE code = 'hospital.attributes.dual_major'
   OR storage_target = 'hospital.attributes.dual_major';
