-- +goose Up
-- ============================================================
-- Device ↔ assay line/items + survey device_block catalog.
-- Coverage model:
--   - devices.assay_line_code = which 检测线 the device belongs to
--   - device_assay_items = leaf items that device covers
--   - On survey approve, leaf codes sync into hospital_assays with
--     device_id set (source own|competitor from brand). Rows with
--     device_id NULL remain owned by assay_block (source=own).
--   - Dashboard coverage = union of hospital_assays (existing queries).
--   - Competitor view = devices (brand≠迈瑞) + their items by line/category.
-- ============================================================

-- Link device to assay line (code of kind=line node)
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS assay_line_code VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_devices_assay_line ON devices (assay_line_code)
    WHERE assay_line_code <> '';

COMMENT ON COLUMN devices.assay_line_code IS
    'assay_projects.code of kind=line (biochem/immuno/coag/heme); drives leaf checkbox set';

-- Backfill line from legacy category when possible
UPDATE devices SET assay_line_code = 'biochem' WHERE assay_line_code = '' AND category = 'biochem';
UPDATE devices SET assay_line_code = 'immuno'  WHERE assay_line_code = '' AND category = 'immuno';
UPDATE devices SET assay_line_code = 'coag'    WHERE assay_line_code = '' AND category = 'coag';
UPDATE devices SET assay_line_code = 'heme'    WHERE assay_line_code = '' AND category = 'hematology';

-- Junction: device covers leaf assay items
CREATE TABLE IF NOT EXISTS device_assay_items (
    device_id         BIGINT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    assay_project_id  BIGINT NOT NULL REFERENCES assay_projects(id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, assay_project_id)
);

CREATE INDEX IF NOT EXISTS idx_device_assay_items_assay ON device_assay_items (assay_project_id);

COMMENT ON TABLE device_assay_items IS
    'Leaf assay items covered by a hospital device; source of device-derived coverage';

-- Allow hospital_assays rows to be tied to devices without fighting assay_block replaces
-- (ReplaceHospitalAssaysByCodes will only touch device_id IS NULL rows.)
COMMENT ON COLUMN hospital_assays.device_id IS
    'When set, row was synced from that device''s selected leaf items; cleared/rewritten on device writeback';

-- collectable_fields: device_block
ALTER TABLE collectable_fields
    DROP CONSTRAINT IF EXISTS collectable_fields_domain_check;
ALTER TABLE collectable_fields
    ADD CONSTRAINT collectable_fields_domain_check CHECK (
        domain IN ('hospital', 'eqa', 'assay', 'device')
    );

ALTER TABLE collectable_fields
    DROP CONSTRAINT IF EXISTS collectable_fields_value_type_check;
ALTER TABLE collectable_fields
    ADD CONSTRAINT collectable_fields_value_type_check CHECK (
        value_type IN (
            'text', 'number', 'boolean', 'enum', 'date',
            'string_array', 'competitor_list', 'group',
            'eqa_block', 'assay_block', 'device_block'
        )
    );

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order, is_active)
VALUES
    ('device.block', 'device', 'device.block', 'device_block', '设备列表', '设备', '[]'::jsonb, '', 800, TRUE)
ON CONFLICT (code) DO UPDATE SET
    domain = 'device',
    storage_target = 'device.block',
    value_type = 'device_block',
    label = '设备列表',
    section = '设备',
    is_active = TRUE,
    sort_order = 800,
    updated_at = NOW();

-- +goose Down
DELETE FROM collectable_fields WHERE code = 'device.block';
DROP TABLE IF EXISTS device_assay_items;
DROP INDEX IF EXISTS idx_devices_assay_line;
ALTER TABLE devices DROP COLUMN IF EXISTS assay_line_code;
