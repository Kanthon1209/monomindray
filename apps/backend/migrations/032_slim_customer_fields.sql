-- +goose Up
-- ============================================================
-- Slim customer field catalog to xlsx sheet1 + sheet4 scope.
-- KEEP active (survey-bindable / detail card):
--   hospital.name, customerCode, region, branchOffice
--   hospital.attributes.customer_level, dual_major
--   device_block / eqa_block / assay tree (separate domains)
-- Soft-deactivate: SVIP/IOT/QC/试剂/标本量/联系人/阶段需求/双大扩展等.
-- Data rows retained; only collectable_fields.is_active flipped.
-- ============================================================

-- Relabel kept fields to match EQA 信息表 wording
UPDATE collectable_fields
SET label = CASE code
        WHEN 'hospital.name' THEN '客户名称'
        WHEN 'hospital.customerCode' THEN '客户编码'
        WHEN 'hospital.region' THEN '区域'
        WHEN 'hospital.branchOffice' THEN '分公司'
        WHEN 'hospital.attributes.dual_major' THEN '26年是否双大'
        WHEN 'hospital.attributes.customer_level' THEN '客户等级'
        ELSE label
    END,
    updated_at = NOW()
WHERE code IN (
    'hospital.name',
    'hospital.customerCode',
    'hospital.region',
    'hospital.branchOffice',
    'hospital.attributes.dual_major',
    'hospital.attributes.customer_level'
);

-- Soft-deactivate legacy attributes (keep customer_level + dual_major)
UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code IN (
        'hospital.attributes.svip_level',
        'hospital.attributes.usage_location',
        'hospital.attributes.sales_group',
        'hospital.attributes.volume_direction',
        'hospital.attributes.dual_major_type',
        'hospital.attributes.dual_major_target',
        'hospital.attributes.customer_segment',
        'hospital.attributes.segment_category',
        'hospital.attributes.customer_stage',
        'hospital.attributes.pending_issues'
    )
   OR storage_target IN (
        'hospital.attributes.svip_level',
        'hospital.attributes.usage_location',
        'hospital.attributes.sales_group',
        'hospital.attributes.volume_direction',
        'hospital.attributes.dual_major_type',
        'hospital.attributes.dual_major_target',
        'hospital.attributes.customer_segment',
        'hospital.attributes.segment_category',
        'hospital.attributes.customer_stage',
        'hospital.attributes.pending_issues'
   );

-- Soft-deactivate all hospital.metrics (QC / IOT / 标本量 / 试剂产出 / 年收入)
UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE domain = 'hospital'
  AND (
        code LIKE 'hospital.metrics.%'
     OR storage_target LIKE 'hospital.metrics.%'
  );

-- Soft-deactivate remaining hospital.archive.* (联系人 / 试剂 / SVIP责任人 / 双大扩展 …)
-- Device-ish keys already deactivated in 029; this catches the rest.
UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE domain = 'hospital'
  AND (
        code LIKE 'hospital.archive.%'
     OR storage_target LIKE 'hospital.archive.%'
  );

-- Soft-deactivate hospital master columns outside the keep list
-- (province/city kept for map/geo; level/type/status/address/remark out of sheet1+4)
UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code IN (
        'hospital.level',
        'hospital.type',
        'hospital.status',
        'hospital.address',
        'hospital.remark',
        'hospital.district'
    )
   OR storage_target IN (
        'hospital.level',
        'hospital.type',
        'hospital.status',
        'hospital.address',
        'hospital.remark',
        'hospital.district'
   );

-- Ensure kept fields stay active
UPDATE collectable_fields
SET is_active = TRUE,
    updated_at = NOW()
WHERE code IN (
        'hospital.name',
        'hospital.province',
        'hospital.city',
        'hospital.customerCode',
        'hospital.region',
        'hospital.branchOffice',
        'hospital.attributes.customer_level',
        'hospital.attributes.dual_major'
    );

-- +goose Down
UPDATE collectable_fields
SET is_active = TRUE,
    updated_at = NOW()
WHERE code LIKE 'hospital.metrics.%'
   OR code LIKE 'hospital.archive.%'
   OR code IN (
        'hospital.level',
        'hospital.type',
        'hospital.status',
        'hospital.address',
        'hospital.remark',
        'hospital.district',
        'hospital.attributes.svip_level',
        'hospital.attributes.usage_location',
        'hospital.attributes.sales_group',
        'hospital.attributes.volume_direction',
        'hospital.attributes.dual_major_type',
        'hospital.attributes.dual_major_target',
        'hospital.attributes.customer_segment',
        'hospital.attributes.segment_category',
        'hospital.attributes.customer_stage',
        'hospital.attributes.pending_issues'
   );

UPDATE collectable_fields
SET label = CASE code
        WHEN 'hospital.name' THEN '医院名称'
        WHEN 'hospital.customerCode' THEN '客户代码'
        WHEN 'hospital.region' THEN '大区'
        WHEN 'hospital.branchOffice' THEN '分公司'
        WHEN 'hospital.attributes.dual_major' THEN '双大客户'
        ELSE label
    END,
    updated_at = NOW()
WHERE code IN (
    'hospital.name',
    'hospital.customerCode',
    'hospital.region',
    'hospital.branchOffice',
    'hospital.attributes.dual_major'
);
