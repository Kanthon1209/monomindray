-- +goose Up
-- Device attributes that were wrongly offered as hospital.archive.*
-- collectable fields. Canonical home is devices (+ device_block).
--
-- Mis-placed catalog keys (soft-deactivate; archive JSON kept for read):
--   hospital.archive.model              -> devices.model
--   hospital.archive.serialNo           -> devices.serial_no
--   hospital.archive.installedAt        -> devices.installed_at
--   hospital.archive.enabledAt          -> devices.enabled_at
--   hospital.archive.equipment          -> devices rows (device_block)
--   hospital.archive.otherAnalyzers     -> devices brand≠迈瑞 (device_block)
--   hospital.archive.competitorDevicesProjects
--                                       -> device_block + device_assay_items
--   hospital.archive.mindrayDevicesProjectsVolume
--                                       -> device_block + hospital.metrics
--   hospital.archive.competitorProjectDistribution
--                                       -> device_block (competitor brands)
--
-- Kept as hospital (not moved):
--   contactName / contactPhone (机构联系人)
--   projectCount / mindrayReagentCount / unusedProjects / missingProjects
--   reagent* / QC / metrics / customer_level / EQA / assay tree
--
-- Phased: catalog inactive + strip active templates + seed devices from
-- archive when hospital has no devices yet. Archive JSON keys retained.

UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code IN (
        'hospital.archive.model',
        'hospital.archive.serialNo',
        'hospital.archive.installedAt',
        'hospital.archive.enabledAt',
        'hospital.archive.equipment',
        'hospital.archive.otherAnalyzers',
        'hospital.archive.competitorDevicesProjects',
        'hospital.archive.mindrayDevicesProjectsVolume',
        'hospital.archive.competitorProjectDistribution'
    )
   OR storage_target IN (
        'hospital.archive.model',
        'hospital.archive.serialNo',
        'hospital.archive.installedAt',
        'hospital.archive.enabledAt',
        'hospital.archive.equipment',
        'hospital.archive.otherAnalyzers',
        'hospital.archive.competitorDevicesProjects',
        'hospital.archive.mindrayDevicesProjectsVolume',
        'hospital.archive.competitorProjectDistribution'
   );

-- Strip these fields from active templates so authors cannot keep mapping them.
UPDATE survey_templates t
SET schema = jsonb_set(
        t.schema,
        '{fields}',
        COALESCE((
            SELECT jsonb_agg(f ORDER BY ord)
            FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb))
                 WITH ORDINALITY AS x(f, ord)
            WHERE NOT (
                COALESCE(f->>'key', '') IN (
                    'model', 'serialNo', 'installedAt', 'enabledAt',
                    'equipment', 'otherAnalyzers',
                    'competitorDevicesProjects', 'mindrayDevicesProjectsVolume',
                    'competitorProjectDistribution'
                )
                OR COALESCE(f->>'target', '') IN (
                    'hospital.archive.model',
                    'hospital.archive.serialNo',
                    'hospital.archive.installedAt',
                    'hospital.archive.enabledAt',
                    'hospital.archive.equipment',
                    'hospital.archive.otherAnalyzers',
                    'hospital.archive.competitorDevicesProjects',
                    'hospital.archive.mindrayDevicesProjectsVolume',
                    'hospital.archive.competitorProjectDistribution'
                )
                OR COALESCE(f->>'label', '') IN (
                    '机型', '序列号', '安装日期', '启用日期', '到期日期',
                    '设备', '其它发光仪', '竞品设备+项目',
                    '迈瑞设备+项目+样本量', '竞品仪器项目分布'
                )
            )
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE t.status = 'active'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
      WHERE COALESCE(f->>'key', '') IN (
                'model', 'serialNo', 'installedAt', 'enabledAt',
                'equipment', 'otherAnalyzers',
                'competitorDevicesProjects', 'mindrayDevicesProjectsVolume',
                'competitorProjectDistribution'
            )
         OR COALESCE(f->>'target', '') IN (
              'hospital.archive.model',
              'hospital.archive.serialNo',
              'hospital.archive.installedAt',
              'hospital.archive.enabledAt',
              'hospital.archive.equipment',
              'hospital.archive.otherAnalyzers',
              'hospital.archive.competitorDevicesProjects',
              'hospital.archive.mindrayDevicesProjectsVolume',
              'hospital.archive.competitorProjectDistribution'
          )
         OR COALESCE(f->>'label', '') IN (
              '机型', '序列号', '安装日期', '启用日期', '到期日期',
              '设备', '其它发光仪', '竞品设备+项目',
              '迈瑞设备+项目+样本量', '竞品仪器项目分布'
          )
  );

-- Ensure the two product templates still expose device_block when missing.
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
WHERE t.code = 'immuno_archive_v1'
  AND t.status = 'active'
  AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(t.schema->'fields', '[]'::jsonb)) f
      WHERE COALESCE(f->>'type', '') = 'device_block'
         OR COALESCE(f->>'target', '') = 'device.block'
  );

-- Backfill devices from archive when hospital has device-ish archive fields
-- but no devices row yet. Dates only when ISO-like YYYY-MM-DD.
INSERT INTO devices (
    hospital_id, brand, category, assay_line_code, model, serial_no,
    status, installed_at, enabled_at, remark
)
SELECT
    h.id,
    '迈瑞',
    'immuno',
    'immuno',
    COALESCE(NULLIF(TRIM(h.archive->>'model'), ''), '未知机型'),
    COALESCE(NULLIF(TRIM(h.archive->>'serialNo'), ''), ''),
    'active',
    CASE
        WHEN COALESCE(h.archive->>'installedAt', '') ~ '^\d{4}-\d{2}-\d{2}'
            THEN (substring(h.archive->>'installedAt' from 1 for 10))::date
        ELSE NULL
    END,
    CASE
        WHEN COALESCE(h.archive->>'enabledAt', '') ~ '^\d{4}-\d{2}-\d{2}'
            THEN (substring(h.archive->>'enabledAt' from 1 for 10))::date
        ELSE NULL
    END,
    trim(both '；' from concat_ws('；',
        CASE WHEN NULLIF(TRIM(h.archive->>'equipment'), '') IS NOT NULL
            THEN 'legacy equipment: ' || TRIM(h.archive->>'equipment') END,
        CASE WHEN NULLIF(TRIM(h.archive->>'otherAnalyzers'), '') IS NOT NULL
            THEN 'legacy otherAnalyzers: ' || TRIM(h.archive->>'otherAnalyzers') END
    ))
FROM hospitals h
WHERE NOT EXISTS (SELECT 1 FROM devices d WHERE d.hospital_id = h.id)
  AND (
        NULLIF(TRIM(h.archive->>'model'), '') IS NOT NULL
     OR NULLIF(TRIM(h.archive->>'serialNo'), '') IS NOT NULL
     OR NULLIF(TRIM(h.archive->>'installedAt'), '') IS NOT NULL
     OR NULLIF(TRIM(h.archive->>'enabledAt'), '') IS NOT NULL
     OR NULLIF(TRIM(h.archive->>'equipment'), '') IS NOT NULL
  );

-- +goose Down
UPDATE collectable_fields
SET is_active = TRUE,
    updated_at = NOW()
WHERE code IN (
        'hospital.archive.model',
        'hospital.archive.serialNo',
        'hospital.archive.installedAt',
        'hospital.archive.enabledAt',
        'hospital.archive.equipment',
        'hospital.archive.otherAnalyzers',
        'hospital.archive.competitorDevicesProjects',
        'hospital.archive.mindrayDevicesProjectsVolume',
        'hospital.archive.competitorProjectDistribution'
    );
