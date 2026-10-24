-- +goose Up
-- Ensure devices.enabled_at exists (014 adds it; belt-and-suspenders after 029 backfill).
-- Ensure every active non-EQA template exposes device_block so device attrs
-- (model / serialNo / installedAt / enabledAt) are collectable in survey fill.

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS enabled_at DATE;

-- Append device_block to active product templates that still lack it.
UPDATE survey_templates t
SET schema = jsonb_set(
        t.schema,
        '{fields}',
        COALESCE(t.schema->'fields', '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
                'key', 'devices',
                'label', '设备列表',
                'section', '设备',
                'required', false,
                'type', 'device_block',
                'target', 'device.block'
            )
        )
    ),
    updated_at = NOW()
WHERE t.status = 'active'
  AND t.code <> 'eqa_participation'
  AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
      WHERE COALESCE(f->>'type', '') = 'device_block'
         OR COALESCE(f->>'target', '') = 'device.block'
         OR COALESCE(f->>'key', '') = 'devices'
  );

-- +goose Down
-- Keep enabled_at column (shared with 014/029). Only strip auto-appended device_block
-- when it is the sole devices key we added — leave templates that already had it alone.
-- Down is intentionally a no-op for schema fields to avoid deleting user-edited blocks.
SELECT 1;
