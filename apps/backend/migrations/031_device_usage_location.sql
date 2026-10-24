-- +goose Up
-- 使用位置 is a per-device attribute (devices.usage_location), not a hospital
-- attribute. Soft-deactivate hospital.attributes.usage_location from the
-- collectable catalog, strip it from active survey templates, ensure the
-- devices column exists, and backfill from legacy hospital_attributes /
-- remark "位置:…" prefixes.

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS usage_location VARCHAR(128) NOT NULL DEFAULT '';

UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code = 'hospital.attributes.usage_location'
   OR storage_target IN (
        'hospital.attributes.usage_location',
        'hospital.archive.usageLocation'
   );

-- Drop 使用位置 field blocks from active templates (hospital-level only).
UPDATE survey_templates t
SET schema = jsonb_set(
        t.schema,
        '{fields}',
        COALESCE((
            SELECT jsonb_agg(f ORDER BY ord)
            FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb))
                 WITH ORDINALITY AS x(f, ord)
            WHERE NOT (
                COALESCE(f->>'key', '') IN ('usageLocation', 'usage_location')
                OR COALESCE(f->>'target', '') IN (
                    'hospital.attributes.usage_location',
                    'hospital.archive.usageLocation'
                )
                OR COALESCE(f->>'label', '') IN ('使用位置', '使用地点')
            )
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE t.status = 'active'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
      WHERE COALESCE(f->>'key', '') IN ('usageLocation', 'usage_location')
         OR COALESCE(f->>'target', '') IN (
              'hospital.attributes.usage_location',
              'hospital.archive.usageLocation'
          )
         OR COALESCE(f->>'label', '') IN ('使用位置', '使用地点')
  );

-- Backfill devices.usage_location from hospital_attributes when empty.
UPDATE devices d
SET usage_location = LEFT(TRIM(ha.attr_value), 128),
    updated_at = NOW()
FROM hospital_attributes ha
WHERE ha.hospital_id = d.hospital_id
  AND ha.attr_key = 'usage_location'
  AND TRIM(COALESCE(ha.attr_value, '')) <> ''
  AND TRIM(COALESCE(d.usage_location, '')) = '';

-- Backfill from remark prefix "位置:xxx" / "位置：xxx" when still empty.
UPDATE devices
SET usage_location = LEFT(
        TRIM(BOTH FROM regexp_replace(
            remark,
            '^位置[:：]\s*([^；;]+).*$',
            '\1'
        )),
        128
    ),
    updated_at = NOW()
WHERE TRIM(COALESCE(usage_location, '')) = ''
  AND remark ~ '^位置[:：]';

-- +goose Down
UPDATE collectable_fields
SET is_active = TRUE,
    updated_at = NOW()
WHERE code = 'hospital.attributes.usage_location'
   OR storage_target = 'hospital.attributes.usage_location';
-- Keep devices.usage_location column (shared with 014).
SELECT 1;
