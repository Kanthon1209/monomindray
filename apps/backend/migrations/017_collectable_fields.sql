-- +goose Up
-- ============================================================
-- collectable_fields: unified catalog of fields that surveys may bind to.
-- Also: migrate customer_level / usage_location into hospital_attributes,
-- remove customer.* from field_registry, remap template targets.
-- ============================================================

CREATE TABLE IF NOT EXISTS collectable_fields (
    code            VARCHAR(128) PRIMARY KEY,
    domain          VARCHAR(32)  NOT NULL,
    storage_target  VARCHAR(256) NOT NULL,
    value_type      VARCHAR(32)  NOT NULL DEFAULT 'text',
    label           VARCHAR(255) NOT NULL,
    section         VARCHAR(128) NOT NULL DEFAULT '',
    enum_values     JSONB        NOT NULL DEFAULT '[]'::jsonb,
    options_source  VARCHAR(64)  NOT NULL DEFAULT '',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order      INT          NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT collectable_fields_domain_check CHECK (
        domain IN ('hospital', 'eqa', 'assay')
    ),
    CONSTRAINT collectable_fields_value_type_check CHECK (
        value_type IN (
            'text', 'number', 'boolean', 'enum', 'date',
            'string_array', 'competitor_list', 'group'
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_collectable_fields_storage_target
    ON collectable_fields (storage_target);

CREATE INDEX IF NOT EXISTS idx_collectable_fields_domain
    ON collectable_fields (domain) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_collectable_fields_sort
    ON collectable_fields (domain, sort_order, code);

DROP TRIGGER IF EXISTS trigger_collectable_fields_updated_at ON collectable_fields;
CREATE TRIGGER trigger_collectable_fields_updated_at
    BEFORE UPDATE ON collectable_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE collectable_fields IS
    'Authoritative catalog of survey-bindable fields; template targets must resolve here.';

-- ---------- seed: hospital table columns ----------
INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order)
VALUES
    ('hospital.name',          'hospital', 'hospital.name',          'text',  '医院名称', '医院主表', '[]'::jsonb, 'hospitals', 10),
    ('hospital.province',      'hospital', 'hospital.province',      'text',  '省份',     '医院主表', '[]'::jsonb, '', 20),
    ('hospital.city',          'hospital', 'hospital.city',          'text',  '城市',     '医院主表', '[]'::jsonb, '', 30),
    ('hospital.district',      'hospital', 'hospital.district',      'text',  '区县',     '医院主表', '[]'::jsonb, '', 40),
    ('hospital.level',         'hospital', 'hospital.level',         'enum',  '医院等级', '医院主表',
        '["三级甲等","三级乙等","二级甲等","二级乙等","一级","未定级"]'::jsonb, '', 50),
    ('hospital.type',          'hospital', 'hospital.type',          'enum',  '医院类型', '医院主表',
        '["综合医院","专科医院","中医医院","妇幼保健院","其他"]'::jsonb, '', 60),
    ('hospital.status',        'hospital', 'hospital.status',        'enum',  '状态',     '医院主表',
        '["active","pending","inactive"]'::jsonb, '', 70),
    ('hospital.address',       'hospital', 'hospital.address',       'text',  '地址',     '医院主表', '[]'::jsonb, '', 80),
    ('hospital.remark',        'hospital', 'hospital.remark',        'text',  '备注',     '医院主表', '[]'::jsonb, '', 90),
    ('hospital.customerCode',  'hospital', 'hospital.customerCode',  'text',  '客户代码', '医院主表', '[]'::jsonb, '', 100),
    ('hospital.region',        'hospital', 'hospital.region',        'text',  '大区',     '医院主表', '[]'::jsonb, '', 110),
    ('hospital.branchOffice',  'hospital', 'hospital.branchOffice',  'text',  '分公司',   '医院主表', '[]'::jsonb, '', 120)
ON CONFLICT (code) DO UPDATE SET
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    enum_values = EXCLUDED.enum_values,
    options_source = EXCLUDED.options_source,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- ---------- seed: hospital_attributes (incl. customer_level / usage_location) ----------
INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order)
VALUES
    ('hospital.attributes.customer_level', 'hospital', 'hospital.attributes.customer_level', 'enum', '客户等级', '医院属性',
        '["战略客户","重点客户","普通客户","潜在客户"]'::jsonb, '', 200),
    ('hospital.attributes.usage_location', 'hospital', 'hospital.attributes.usage_location', 'enum', '使用地点', '医院属性',
        '["中心实验室","急诊","ICU","门诊","其他"]'::jsonb, '', 210),
    ('hospital.attributes.svip_level', 'hospital', 'hospital.attributes.svip_level', 'text', 'SVIP级别', '医院属性', '[]'::jsonb, '', 220),
    ('hospital.attributes.dual_major', 'hospital', 'hospital.attributes.dual_major', 'text', '双大客户', '医院属性', '[]'::jsonb, '', 230),
    ('hospital.attributes.sales_group', 'hospital', 'hospital.attributes.sales_group', 'text', '分组', '医院属性', '[]'::jsonb, '', 240),
    ('hospital.attributes.volume_direction', 'hospital', 'hospital.attributes.volume_direction', 'text', '上量方向', '医院属性', '[]'::jsonb, '', 250),
    ('hospital.attributes.dual_major_type', 'hospital', 'hospital.attributes.dual_major_type', 'enum', '双大类型', '医院属性',
        '["双大","非双大"]'::jsonb, '', 260),
    ('hospital.attributes.dual_major_target', 'hospital', 'hospital.attributes.dual_major_target', 'text', '双大突破目标', '医院属性', '[]'::jsonb, '', 270),
    ('hospital.attributes.customer_segment', 'hospital', 'hospital.attributes.customer_segment', 'text', '客户细分', '医院属性', '[]'::jsonb, '', 280),
    ('hospital.attributes.segment_category', 'hospital', 'hospital.attributes.segment_category', 'text', '细分类别', '医院属性', '[]'::jsonb, '', 290)
ON CONFLICT (code) DO UPDATE SET
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    enum_values = EXCLUDED.enum_values,
    options_source = EXCLUDED.options_source,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- ---------- seed: hospital_metrics ----------
INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order)
VALUES
    ('hospital.metrics.sample_volume_own',       'hospital', 'hospital.metrics.sample_volume_own',       'text',   '迈瑞标本量', '医院指标', '[]'::jsonb, '', 300),
    ('hospital.metrics.sample_volume_total',     'hospital', 'hospital.metrics.sample_volume_total',     'text',   '总标本量',   '医院指标', '[]'::jsonb, '', 310),
    ('hospital.metrics.matching_rate',           'hospital', 'hospital.metrics.matching_rate',           'text',   '配套率',     '医院指标', '[]'::jsonb, '', 320),
    ('hospital.metrics.qc_vendor',               'hospital', 'hospital.metrics.qc_vendor',               'text',   '质控品厂家', '医院指标', '[]'::jsonb, '', 330),
    ('hospital.metrics.qc_levels',               'hospital', 'hospital.metrics.qc_levels',               'text',   '质控水平数', '医院指标', '[]'::jsonb, '', 340),
    ('hospital.metrics.qc_cycle',                'hospital', 'hospital.metrics.qc_cycle',                'text',   '质控周期',   '医院指标', '[]'::jsonb, '', 350),
    ('hospital.metrics.hospital_annual_revenue', 'hospital', 'hospital.metrics.hospital_annual_revenue', 'number', '医院年收入', '医院指标', '[]'::jsonb, '', 360),
    ('hospital.metrics.iot_stock',               'hospital', 'hospital.metrics.iot_stock',               'number', 'IOT存量',   '医院指标', '[]'::jsonb, '', 370),
    ('hospital.metrics.iot_forecast',            'hospital', 'hospital.metrics.iot_forecast',            'number', 'IOT预估产出','医院指标', '[]'::jsonb, '', 380),
    ('hospital.metrics.iot_increment',           'hospital', 'hospital.metrics.iot_increment',           'number', 'IOT增量',   '医院指标', '[]'::jsonb, '', 390),
    ('hospital.metrics.iot_growth_rate',         'hospital', 'hospital.metrics.iot_growth_rate',         'number', 'IOT增长率', '医院指标', '[]'::jsonb, '', 400),
    ('hospital.metrics.reagent_revenue',         'hospital', 'hospital.metrics.reagent_revenue',         'number', '试剂年产出', '医院指标', '[]'::jsonb, '', 410),
    ('hospital.metrics.reagent_revenue_target',  'hospital', 'hospital.metrics.reagent_revenue_target',  'number', '试剂产出目标','医院指标', '[]'::jsonb, '', 420)
ON CONFLICT (code) DO UPDATE SET
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    enum_values = EXCLUDED.enum_values,
    options_source = EXCLUDED.options_source,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- ---------- seed: remaining hospital.archive.* (not migrated to attributes/columns) ----------
INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order)
VALUES
    ('hospital.archive.model',            'hospital', 'hospital.archive.model',            'text',            '机型',       '档案扩展', '[]'::jsonb, '', 500),
    ('hospital.archive.serialNo',         'hospital', 'hospital.archive.serialNo',         'text',            '序列号',     '档案扩展', '[]'::jsonb, '', 510),
    ('hospital.archive.contactName',      'hospital', 'hospital.archive.contactName',      'text',            '负责人',     '档案扩展', '[]'::jsonb, '', 520),
    ('hospital.archive.contactPhone',     'hospital', 'hospital.archive.contactPhone',     'text',            '联系电话',   '档案扩展', '[]'::jsonb, '', 530),
    ('hospital.archive.installedAt',      'hospital', 'hospital.archive.installedAt',      'date',            '安装日期',   '档案扩展', '[]'::jsonb, '', 540),
    ('hospital.archive.enabledAt',        'hospital', 'hospital.archive.enabledAt',        'date',            '启用日期',   '档案扩展', '[]'::jsonb, '', 550),
    ('hospital.archive.projectCount',     'hospital', 'hospital.archive.projectCount',     'number',          '开展项目数', '档案扩展', '[]'::jsonb, '', 560),
    ('hospital.archive.mindrayReagentCount','hospital','hospital.archive.mindrayReagentCount','number',       '迈瑞试剂项目数','档案扩展','[]'::jsonb,'', 570),
    ('hospital.archive.otherAnalyzers',   'hospital', 'hospital.archive.otherAnalyzers',   'text',            '其它发光仪', '档案扩展', '[]'::jsonb, '', 580),
    ('hospital.archive.reagentSupplier',  'hospital', 'hospital.archive.reagentSupplier',  'text',            '试剂供应商', '档案扩展', '[]'::jsonb, '', 590),
    ('hospital.archive.mindrayProjects',  'hospital', 'hospital.archive.mindrayProjects',  'string_array',    '迈瑞开展项目','档案扩展','[]'::jsonb,'assay_projects', 600),
    ('hospital.archive.newProjects',      'hospital', 'hospital.archive.newProjects',      'string_array',    '主导新增项目','档案扩展','[]'::jsonb,'assay_projects', 610),
    ('hospital.archive.unusedProjects',   'hospital', 'hospital.archive.unusedProjects',   'text',            '未使用迈瑞项目','档案扩展','[]'::jsonb,'', 620),
    ('hospital.archive.missingProjects',  'hospital', 'hospital.archive.missingProjects',  'text',            '迈瑞没有项目','档案扩展','[]'::jsonb,'', 630),
    ('hospital.archive.competitorProjectDistribution','hospital','hospital.archive.competitorProjectDistribution','competitor_list','竞品仪器项目分布','档案扩展','[]'::jsonb,'', 640),
    ('hospital.archive.archiveRemark',    'hospital', 'hospital.archive.archiveRemark',    'text',            '档案备注',   '档案扩展', '[]'::jsonb, '', 650),
    ('hospital.archive.equipment',        'hospital', 'hospital.archive.equipment',        'text',            '设备',       '档案扩展', '[]'::jsonb, '', 660),
    ('hospital.archive.productLineSales', 'hospital', 'hospital.archive.productLineSales', 'text',            '产线销售',   '档案扩展', '[]'::jsonb, '', 670),
    ('hospital.archive.productLineSalesId','hospital','hospital.archive.productLineSalesId','text',           '产线销售工号','档案扩展','[]'::jsonb,'', 680),
    ('hospital.archive.reagentSales',     'hospital', 'hospital.archive.reagentSales',     'text',            '试剂销售',   '档案扩展', '[]'::jsonb, '', 690),
    ('hospital.archive.reagentSalesId',   'hospital', 'hospital.archive.reagentSalesId',   'text',            '试剂销售工号','档案扩展','[]'::jsonb,'', 700),
    ('hospital.archive.psName',           'hospital', 'hospital.archive.psName',           'text',            'PS',         '档案扩展', '[]'::jsonb, '', 710),
    ('hospital.archive.psId',             'hospital', 'hospital.archive.psId',             'text',            'PS工号',     '档案扩展', '[]'::jsonb, '', 720),
    ('hospital.archive.clinicalApp',      'hospital', 'hospital.archive.clinicalApp',      'text',            '临床应用',   '档案扩展', '[]'::jsonb, '', 730),
    ('hospital.archive.clinicalAppId',    'hospital', 'hospital.archive.clinicalAppId',    'text',            '临床应用工号','档案扩展','[]'::jsonb,'', 740),
    ('hospital.archive.serviceEngineer',  'hospital', 'hospital.archive.serviceEngineer',  'text',            '用服工程师', '档案扩展', '[]'::jsonb, '', 750),
    ('hospital.archive.serviceEngineerId','hospital', 'hospital.archive.serviceEngineerId','text',            '用服工程师工号','档案扩展','[]'::jsonb,'', 760),
    ('hospital.archive.salesOwner',       'hospital', 'hospital.archive.salesOwner',       'text',            '销售责任人', '档案扩展', '[]'::jsonb, '', 770),
    ('hospital.archive.competitorDevicesProjects','hospital','hospital.archive.competitorDevicesProjects','text','竞品设备+项目','档案扩展','[]'::jsonb,'', 780),
    ('hospital.archive.mindrayDevicesProjectsVolume','hospital','hospital.archive.mindrayDevicesProjectsVolume','text','迈瑞设备+项目+样本量','档案扩展','[]'::jsonb,'', 790),
    ('hospital.archive.supplyChannel',    'hospital', 'hospital.archive.supplyChannel',    'text',            '供货渠道',   '档案扩展', '[]'::jsonb, '', 800),
    ('hospital.archive.labDirector',      'hospital', 'hospital.archive.labDirector',      'text',            '检验科主任', '档案扩展', '[]'::jsonb, '', 810),
    ('hospital.archive.workContact',      'hospital', 'hospital.archive.workContact',      'text',            '工作对接人', '档案扩展', '[]'::jsonb, '', 820)
ON CONFLICT (code) DO UPDATE SET
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    enum_values = EXCLUDED.enum_values,
    options_source = EXCLUDED.options_source,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- ---------- seed: EQA skeleton + boolean fields from field_registry ----------
INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order)
VALUES
    ('eqa.year',  'eqa', 'eqa.year',  'number', '参评年份', '室间质评', '[]'::jsonb, '', 900),
    ('eqa.scope', 'eqa', 'eqa.scope', 'enum',   '参评范围', '室间质评',
        '["national","provincial"]'::jsonb, '', 910)
ON CONFLICT (code) DO UPDATE SET
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    enum_values = EXCLUDED.enum_values,
    options_source = EXCLUDED.options_source,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order)
SELECT
    'eqa.field.' || f.code,
    'eqa',
    'eqa.field.' || f.code,
    'boolean',
    f.name,
    COALESCE(p.name, '室间质评科目'),
    '[]'::jsonb,
    '',
    1000 + f.sort_order
FROM field_registry f
LEFT JOIN field_registry p ON p.code = f.parent_code
WHERE f.value_type = 'boolean'
ON CONFLICT (code) DO UPDATE SET
    storage_target = EXCLUDED.storage_target,
    value_type = EXCLUDED.value_type,
    label = EXCLUDED.label,
    section = EXCLUDED.section,
    sort_order = EXCLUDED.sort_order,
    is_active = TRUE,
    updated_at = NOW();

-- ---------- data migrate: archive customerLevel / usageLocation → hospital_attributes ----------
INSERT INTO hospital_attributes (hospital_id, attr_key, attr_value, updated_at)
SELECT
    h.id,
    'customer_level',
    COALESCE(
        NULLIF(TRIM(h.archive->>'customerLevel'), ''),
        NULLIF(TRIM(h.archive->>'customer_level'), ''),
        NULLIF(TRIM(h.archive->>'客户级别'), ''),
        NULLIF(TRIM(h.archive->>'客户等级'), '')
    ),
    NOW()
FROM hospitals h
WHERE COALESCE(
        NULLIF(TRIM(h.archive->>'customerLevel'), ''),
        NULLIF(TRIM(h.archive->>'customer_level'), ''),
        NULLIF(TRIM(h.archive->>'客户级别'), ''),
        NULLIF(TRIM(h.archive->>'客户等级'), '')
      ) IS NOT NULL
ON CONFLICT (hospital_id, attr_key) DO UPDATE
SET attr_value = EXCLUDED.attr_value, updated_at = NOW()
WHERE hospital_attributes.attr_value IS DISTINCT FROM EXCLUDED.attr_value;

INSERT INTO hospital_attributes (hospital_id, attr_key, attr_value, updated_at)
SELECT
    h.id,
    'usage_location',
    COALESCE(
        NULLIF(TRIM(h.archive->>'usageLocation'), ''),
        NULLIF(TRIM(h.archive->>'usage_location'), ''),
        NULLIF(TRIM(h.archive->>'使用地点'), ''),
        NULLIF(TRIM(h.archive->>'使用位置'), '')
    ),
    NOW()
FROM hospitals h
WHERE COALESCE(
        NULLIF(TRIM(h.archive->>'usageLocation'), ''),
        NULLIF(TRIM(h.archive->>'usage_location'), ''),
        NULLIF(TRIM(h.archive->>'使用地点'), ''),
        NULLIF(TRIM(h.archive->>'使用位置'), '')
      ) IS NOT NULL
ON CONFLICT (hospital_id, attr_key) DO UPDATE
SET attr_value = EXCLUDED.attr_value, updated_at = NOW()
WHERE hospital_attributes.attr_value IS DISTINCT FROM EXCLUDED.attr_value;

-- Strip migrated keys from archive (best design: attributes are authoritative)
UPDATE hospitals
SET archive = (archive
    - 'customerLevel'
    - 'customer_level'
    - '客户级别'
    - '客户等级'
    - 'usageLocation'
    - 'usage_location'
    - '使用地点'
    - '使用位置'
),
    updated_at = NOW()
WHERE archive ?| ARRAY[
    'customerLevel','customer_level','客户级别','客户等级',
    'usageLocation','usage_location','使用地点','使用位置'
];

-- ---------- remove customer.* from field_registry (EQA is boolean subjects only) ----------
DELETE FROM eqa_participation_items
WHERE field_code IN ('customer.level', 'customer.usage_location')
   OR field_code LIKE 'customer.%';

DELETE FROM field_registry WHERE code IN ('customer.level', 'customer.usage_location');
DELETE FROM field_registry WHERE code = 'customer';

-- ---------- remap existing survey template targets ----------
-- hospital.archive.customerLevel → hospital.attributes.customer_level
-- hospital.archive.usageLocation → hospital.attributes.usage_location
-- eqa.field.customer.level → hospital.attributes.customer_level
-- eqa.field.customer.usage_location → hospital.attributes.usage_location
UPDATE survey_templates
SET schema = replace(
        replace(
            replace(
                replace(schema::text,
                    'hospital.archive.customerLevel',
                    'hospital.attributes.customer_level'),
                'hospital.archive.usageLocation',
                'hospital.attributes.usage_location'),
            'eqa.field.customer.level',
            'hospital.attributes.customer_level'),
        'eqa.field.customer.usage_location',
        'hospital.attributes.usage_location'
    )::jsonb,
    updated_at = NOW()
WHERE schema::text LIKE '%customerLevel%'
   OR schema::text LIKE '%usageLocation%'
   OR schema::text LIKE '%customer.level%'
   OR schema::text LIKE '%customer.usage_location%';

-- +goose Down
DROP TRIGGER IF EXISTS trigger_collectable_fields_updated_at ON collectable_fields;
DROP TABLE IF EXISTS collectable_fields;
