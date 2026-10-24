-- +goose Up
-- Soft-archive SVIP级别 from the active collectable catalog.
-- Product already has:
--   hospital.attributes.customer_level  (客户等级: V1/V2/V3/非V)
--   hospital.level                      (医院等级: 二甲/三甲 …)
-- Legacy Excel「24年SVIP客户档案」imported svip_level as a parallel label;
-- keeping it in the picker confuses template authors. Historical
-- hospital_attributes rows are retained; only the catalog entry is deactivated.
-- Also strip the field from active survey templates so save/validate no longer
-- references an inactive catalog target.

UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code = 'hospital.attributes.svip_level'
   OR storage_target IN (
        'hospital.attributes.svip_level',
        'hospital.archive.svipLevel'
   );

-- Drop SVIP级别 field blocks from active templates (any remaining legacy embeds).
UPDATE survey_templates t
SET schema = jsonb_set(
        t.schema,
        '{fields}',
        COALESCE((
            SELECT jsonb_agg(f ORDER BY ord)
            FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb))
                 WITH ORDINALITY AS x(f, ord)
            WHERE NOT (
                COALESCE(f->>'key', '') IN ('svipLevel', 'svip_level')
                OR COALESCE(f->>'target', '') IN (
                    'hospital.attributes.svip_level',
                    'hospital.archive.svipLevel'
                )
                OR COALESCE(f->>'label', '') IN ('SVIP级别', 'SVIP等级')
            )
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE t.status = 'active'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
      WHERE COALESCE(f->>'key', '') IN ('svipLevel', 'svip_level')
         OR COALESCE(f->>'target', '') IN (
              'hospital.attributes.svip_level',
              'hospital.archive.svipLevel'
          )
         OR COALESCE(f->>'label', '') IN ('SVIP级别', 'SVIP等级')
  );

-- +goose Down
UPDATE collectable_fields
SET is_active = TRUE,
    updated_at = NOW()
WHERE code = 'hospital.attributes.svip_level'
   OR storage_target = 'hospital.attributes.svip_level';
