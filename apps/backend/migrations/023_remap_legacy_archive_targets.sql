-- +goose Up
-- Remap legacy hospital.archive.* targets moved in 014/017 but never
-- rewritten on survey_templates (017 only remapped customerLevel/usageLocation).
-- Drop retired mindrayProjects/newProjects fields; repair immuno empty targets.

DO $mig$
DECLARE
    r RECORD;
    s text;
    pair RECORD;
BEGIN
    FOR r IN SELECT id, schema::text AS body FROM survey_templates WHERE schema::text LIKE '%hospital.archive.%' LOOP
        s := r.body;
        FOR pair IN SELECT * FROM (VALUES
        ('hospital.archive.matchingRate', 'hospital.metrics.matching_rate'),
        ('hospital.archive.mindraySampleVolume', 'hospital.metrics.sample_volume_own'),
        ('hospital.archive.totalSampleVolume', 'hospital.metrics.sample_volume_total'),
        ('hospital.archive.qcVendor', 'hospital.metrics.qc_vendor'),
        ('hospital.archive.qcLevels', 'hospital.metrics.qc_levels'),
        ('hospital.archive.qcCycle', 'hospital.metrics.qc_cycle'),
        ('hospital.archive.annualRevenue', 'hospital.metrics.hospital_annual_revenue'),
        ('hospital.archive.iotStock23', 'hospital.metrics.iot_stock'),
        ('hospital.archive.iotForecast24', 'hospital.metrics.iot_forecast'),
        ('hospital.archive.iotIncrement24', 'hospital.metrics.iot_increment'),
        ('hospital.archive.iotGrowthRate24', 'hospital.metrics.iot_growth_rate'),
        ('hospital.archive.hospitalReagentOutput', 'hospital.metrics.reagent_revenue'),
        ('hospital.archive.reagentOutputTarget', 'hospital.metrics.reagent_revenue_target'),
        ('hospital.archive.customerLevel', 'hospital.attributes.customer_level'),
        ('hospital.archive.usageLocation', 'hospital.attributes.usage_location'),
        ('hospital.archive.svipLevel', 'hospital.attributes.svip_level'),
        ('hospital.archive.dualMajorCustomer', 'hospital.attributes.dual_major'),
        ('hospital.archive.groupName', 'hospital.attributes.sales_group'),
        ('hospital.archive.volumeDirection', 'hospital.attributes.volume_direction'),
        ('hospital.archive.dualMajorType', 'hospital.attributes.dual_major_type'),
        ('hospital.archive.dualMajorTarget', 'hospital.attributes.dual_major_target'),
        ('hospital.archive.customerSegment', 'hospital.attributes.customer_segment'),
        ('hospital.archive.segmentCategory', 'hospital.attributes.segment_category'),
        ('hospital.archive.region', 'hospital.region'),
        ('hospital.archive.branchOffice', 'hospital.branchOffice'),
        ('hospital.archive.customerCode', 'hospital.customerCode'),
        ('hospital.archive.customerName', 'hospital.name')
        ) AS t(old, new) LOOP
            s := replace(s, pair.old, pair.new);
        END LOOP;
        UPDATE survey_templates
        SET schema = s::jsonb, updated_at = NOW()
        WHERE id = r.id;
    END LOOP;
END $mig$;

UPDATE survey_templates
SET schema = jsonb_set(
        schema,
        '{fields}',
        COALESCE((
            SELECT jsonb_agg(f ORDER BY ord)
            FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS t(f, ord)
            WHERE COALESCE(f->>'target', '') NOT IN (
                    'hospital.archive.mindrayProjects',
                    'hospital.archive.newProjects'
                )
              AND COALESCE(f->>'key', '') NOT IN ('mindrayProjects', 'newProjects')
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE EXISTS (
    SELECT 1
    FROM jsonb_array_elements(schema->'fields') f
    WHERE COALESCE(f->>'target', '') IN (
            'hospital.archive.mindrayProjects',
            'hospital.archive.newProjects'
        )
       OR COALESCE(f->>'key', '') IN ('mindrayProjects', 'newProjects')
);

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order)
VALUES
    ('hospital.archive.labAnnualRevenue', 'hospital', 'hospital.archive.labAnnualRevenue', 'number', '检验科年收入', '档案扩展', '[]'::jsonb, '', 830),
    ('hospital.archive.mspOrderNo',       'hospital', 'hospital.archive.mspOrderNo',       'text',   'MSP工单号',   '档案扩展', '[]'::jsonb, '', 840),
    ('hospital.archive.reagentBrand',     'hospital', 'hospital.archive.reagentBrand',     'text',   '试剂品牌',   '档案扩展', '[]'::jsonb, '', 850)
ON CONFLICT (code) DO UPDATE SET
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    is_active = TRUE,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

UPDATE survey_templates
SET schema = jsonb_set(
        schema,
        '{fields}',
        COALESCE((
            SELECT jsonb_agg(x.field ORDER BY x.ord)
            FROM (
                SELECT ord,
                    CASE
                        WHEN NULLIF(TRIM(COALESCE(f->>'target', '')), '') IS NOT NULL THEN f
                        WHEN COALESCE(f->>'label', '') IN ('分公司') THEN
                            f || jsonb_build_object('target', 'hospital.branchOffice', 'type', COALESCE(NULLIF(f->>'type', ''), 'text'))
                        WHEN COALESCE(f->>'label', '') IN ('检验科主任') THEN
                            f || jsonb_build_object('target', 'hospital.archive.labDirector', 'type', COALESCE(NULLIF(f->>'type', ''), 'text'))
                        WHEN COALESCE(f->>'label', '') IN ('医院年收入（亿）', '医院年收入') THEN
                            f || jsonb_build_object('target', 'hospital.metrics.hospital_annual_revenue', 'type', COALESCE(NULLIF(f->>'type', ''), 'number'))
                        WHEN COALESCE(f->>'label', '') IN ('检验科年收入（千万）', '检验科年收入') THEN
                            f || jsonb_build_object('target', 'hospital.archive.labAnnualRevenue', 'type', COALESCE(NULLIF(f->>'type', ''), 'number'))
                        WHEN COALESCE(f->>'label', '') IN ('使用位置', '使用地点') THEN
                            f || jsonb_build_object('target', 'hospital.attributes.usage_location', 'type', COALESCE(NULLIF(f->>'type', ''), 'enum'))
                        WHEN COALESCE(f->>'label', '') IN ('MSP工单号') THEN
                            f || jsonb_build_object('target', 'hospital.archive.mspOrderNo', 'type', COALESCE(NULLIF(f->>'type', ''), 'text'))
                        WHEN COALESCE(f->>'label', '') IN ('试剂品牌') THEN
                            f || jsonb_build_object('target', 'hospital.archive.reagentBrand', 'type', COALESCE(NULLIF(f->>'type', ''), 'text'))
                        WHEN COALESCE(f->>'label', '') IN ('到期日期', '启用日期') THEN
                            f || jsonb_build_object('target', 'hospital.archive.enabledAt', 'type', COALESCE(NULLIF(f->>'type', ''), 'date'))
                        WHEN COALESCE(f->>'label', '') IN ('仪器负责人', '负责人') THEN
                            f || jsonb_build_object('target', 'hospital.archive.contactName', 'type', COALESCE(NULLIF(f->>'type', ''), 'text'))
                        WHEN COALESCE(f->>'label', '') IN ('开展项目') THEN NULL
                        ELSE f
                    END AS field
                FROM jsonb_array_elements(schema->'fields') WITH ORDINALITY AS t(f, ord)
            ) x
            WHERE x.field IS NOT NULL
        ), '[]'::jsonb)
    ),
    updated_at = NOW()
WHERE code = 'immuno_archive_v1';

-- +goose Down
DO $mig$
DECLARE
    r RECORD;
    s text;
    pair RECORD;
BEGIN
    FOR r IN SELECT id, schema::text AS body FROM survey_templates WHERE schema::text LIKE '%hospital.metrics.%' LOOP
        s := r.body;
        FOR pair IN SELECT * FROM (VALUES
            ('hospital.metrics.matching_rate', 'hospital.archive.matchingRate'),
            ('hospital.metrics.sample_volume_own', 'hospital.archive.mindraySampleVolume'),
            ('hospital.metrics.sample_volume_total', 'hospital.archive.totalSampleVolume'),
            ('hospital.metrics.qc_vendor', 'hospital.archive.qcVendor'),
            ('hospital.metrics.qc_levels', 'hospital.archive.qcLevels'),
            ('hospital.metrics.qc_cycle', 'hospital.archive.qcCycle'),
            ('hospital.metrics.hospital_annual_revenue', 'hospital.archive.annualRevenue'),
            ('hospital.metrics.iot_stock', 'hospital.archive.iotStock23'),
            ('hospital.metrics.iot_forecast', 'hospital.archive.iotForecast24'),
            ('hospital.metrics.iot_increment', 'hospital.archive.iotIncrement24'),
            ('hospital.metrics.iot_growth_rate', 'hospital.archive.iotGrowthRate24'),
            ('hospital.metrics.reagent_revenue', 'hospital.archive.hospitalReagentOutput'),
            ('hospital.metrics.reagent_revenue_target', 'hospital.archive.reagentOutputTarget')
        ) AS t(old, new) LOOP
            s := replace(s, pair.old, pair.new);
        END LOOP;
        UPDATE survey_templates SET schema = s::jsonb, updated_at = NOW() WHERE id = r.id;
    END LOOP;
END $mig$;

DELETE FROM collectable_fields
WHERE code IN (
    'hospital.archive.labAnnualRevenue',
    'hospital.archive.mspOrderNo',
    'hospital.archive.reagentBrand'
);
