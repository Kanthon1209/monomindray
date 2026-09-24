-- +goose Up
-- ============================================================
-- Make Excel archive columns queryable + structured project items
-- ============================================================

-- Fast containment / key lookup on hospitals.archive
CREATE INDEX IF NOT EXISTS idx_hospitals_archive_gin ON hospitals USING GIN (archive jsonb_path_ops);

COMMENT ON COLUMN hospitals.archive IS
    '化免/SVIP/双大客户档案 JSON。约定：
     化学发光扁平原文键见 ARCHIVE_FIELD_DEFS；
     mindrayProjects: text[] JSON 数组，如 ["AFP","CEA"]；
     competitorProjectDistribution: object[]，元素含 line/brand/instrument/projects/note；
     SVIP/双大扩展键：svipLevel, dualMajorCustomer, iotStock23, ... 等（见 specs/data_model.md）。';

-- Flattened project / competitor rows for GROUP BY stats
CREATE TABLE IF NOT EXISTS hospital_project_items (
    id              BIGSERIAL PRIMARY KEY,
    hospital_id     BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    kind            VARCHAR(32)  NOT NULL,
    line_category   VARCHAR(64)  NOT NULL DEFAULT '',
    brand           VARCHAR(128) NOT NULL DEFAULT '',
    instrument      VARCHAR(128) NOT NULL DEFAULT '',
    project_name    VARCHAR(256) NOT NULL DEFAULT '',
    meta            JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT hospital_project_items_kind_check CHECK (kind IN ('mindray', 'competitor'))
);

CREATE INDEX IF NOT EXISTS idx_hpi_hospital_id ON hospital_project_items (hospital_id);
CREATE INDEX IF NOT EXISTS idx_hpi_kind_project ON hospital_project_items (kind, project_name);
CREATE INDEX IF NOT EXISTS idx_hpi_kind_brand ON hospital_project_items (kind, brand);
CREATE INDEX IF NOT EXISTS idx_hpi_line ON hospital_project_items (kind, line_category);

COMMENT ON TABLE hospital_project_items IS
    '从 hospitals.archive.mindrayProjects / competitorProjectDistribution 展开，供按项目/品牌统计';

-- Normalize existing string mindrayProjects -> JSON array (best-effort split on / 、 , ，)
UPDATE hospitals
SET archive = jsonb_set(
    archive,
    '{mindrayProjects}',
    (
        SELECT COALESCE(jsonb_agg(to_jsonb(trim(both FROM x))), '[]'::jsonb)
        FROM unnest(
            regexp_split_to_array(
                coalesce(archive->>'mindrayProjects', ''),
                '[/、,，;；\|]+'
            )
        ) AS x
        WHERE trim(both FROM x) <> ''
    )
)
WHERE jsonb_typeof(archive->'mindrayProjects') = 'string'
  AND coalesce(archive->>'mindrayProjects', '') <> '';

-- Seed competitorProjectDistribution key as empty array when missing (SVIP sheet)
UPDATE hospitals
SET archive = archive || '{"competitorProjectDistribution":[]}'::jsonb
WHERE NOT (archive ? 'competitorProjectDistribution');

-- Backfill mindray project items from normalized arrays
INSERT INTO hospital_project_items (hospital_id, kind, project_name)
SELECT h.id, 'mindray', trim(both '"' FROM elem::text)
FROM hospitals h
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN jsonb_typeof(h.archive->'mindrayProjects') = 'array' THEN h.archive->'mindrayProjects'
    ELSE '[]'::jsonb
  END
) AS elem
WHERE trim(both '"' FROM elem::text) <> '';

-- Expand immuno template: mark project fields + add SVIP/双大 queryable keys
UPDATE survey_templates
SET schema = jsonb_set(
    schema,
    '{fields}',
    (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM (
            SELECT CASE
                WHEN elem->>'key' = 'mindrayProjects' THEN
                    elem || '{"type":"string_array"}'::jsonb
                ELSE elem
            END AS elem
            FROM jsonb_array_elements(schema->'fields') AS elem
        ) t
    ),
    true
),
updated_at = NOW()
WHERE code = 'immuno_archive_v1';

-- Append SVIP / 双大 / competitor fields if not already present
UPDATE survey_templates t
SET schema = jsonb_set(
    t.schema,
    '{fields}',
    COALESCE(t.schema->'fields', '[]'::jsonb) || '[
      {"key":"competitorProjectDistribution","label":"竞品仪器项目分布","section":"竞品与标本","required":false,"type":"competitor_list","target":"hospital.archive.competitorProjectDistribution"},
      {"key":"svipLevel","label":"SVIP级别","section":"SVIP","required":false,"type":"text","target":"hospital.archive.svipLevel"},
      {"key":"dualMajorCustomer","label":"双大客户","section":"SVIP","required":false,"type":"text","target":"hospital.archive.dualMajorCustomer"},
      {"key":"groupName","label":"分组","section":"SVIP","required":false,"type":"text","target":"hospital.archive.groupName"},
      {"key":"volumeDirection","label":"上量方向","section":"SVIP","required":false,"type":"text","target":"hospital.archive.volumeDirection"},
      {"key":"iotStock23","label":"23年化免凝IOT存量(W)","section":"SVIP","required":false,"type":"number","target":"hospital.archive.iotStock23"},
      {"key":"iotForecast24","label":"24年预估化免凝IOT产出(W)","section":"SVIP","required":false,"type":"number","target":"hospital.archive.iotForecast24"},
      {"key":"iotIncrement24","label":"24年预估化免凝增量(W)","section":"SVIP","required":false,"type":"number","target":"hospital.archive.iotIncrement24"},
      {"key":"iotGrowthRate24","label":"24年预估化免凝增长率(W)","section":"SVIP","required":false,"type":"number","target":"hospital.archive.iotGrowthRate24"},
      {"key":"productLineSales","label":"产线销售","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.productLineSales"},
      {"key":"productLineSalesId","label":"产线销售工号","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.productLineSalesId"},
      {"key":"reagentSales","label":"试剂销售","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.reagentSales"},
      {"key":"reagentSalesId","label":"试剂销售工号","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.reagentSalesId"},
      {"key":"psName","label":"PS","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.psName"},
      {"key":"psId","label":"PS工号","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.psId"},
      {"key":"clinicalApp","label":"临床应用","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.clinicalApp"},
      {"key":"clinicalAppId","label":"临床应用工号","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.clinicalAppId"},
      {"key":"serviceEngineer","label":"用服工程师","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.serviceEngineer"},
      {"key":"serviceEngineerId","label":"用服工程师工号","section":"SVIP责任人","required":false,"type":"text","target":"hospital.archive.serviceEngineerId"},
      {"key":"equipment","label":"设备","section":"SVIP","required":false,"type":"text","target":"hospital.archive.equipment"},
      {"key":"dualMajorType","label":"双大类型","section":"双大客户","required":false,"type":"text","target":"hospital.archive.dualMajorType"},
      {"key":"dualMajorTarget","label":"双大突破目标","section":"双大客户","required":false,"type":"text","target":"hospital.archive.dualMajorTarget"},
      {"key":"hospitalReagentOutput","label":"医院试剂年产出（万元）","section":"双大客户","required":false,"type":"number","target":"hospital.archive.hospitalReagentOutput"},
      {"key":"reagentOutputTarget","label":"试剂产出目标（万元）","section":"双大客户","required":false,"type":"number","target":"hospital.archive.reagentOutputTarget"},
      {"key":"salesOwner","label":"销售责任人","section":"双大客户","required":false,"type":"text","target":"hospital.archive.salesOwner"},
      {"key":"competitorDevicesProjects","label":"竞品设备+项目","section":"双大客户","required":false,"type":"text","target":"hospital.archive.competitorDevicesProjects"},
      {"key":"mindrayDevicesProjectsVolume","label":"迈瑞设备+项目+样本量","section":"双大客户","required":false,"type":"text","target":"hospital.archive.mindrayDevicesProjectsVolume"},
      {"key":"supplyChannel","label":"供货渠道","section":"双大客户","required":false,"type":"text","target":"hospital.archive.supplyChannel"},
      {"key":"labDirector","label":"检验科主任","section":"双大客户","required":false,"type":"text","target":"hospital.archive.labDirector"},
      {"key":"workContact","label":"工作对接人","section":"双大客户","required":false,"type":"text","target":"hospital.archive.workContact"},
      {"key":"customerSegment","label":"客户细分","section":"双大客户","required":false,"type":"text","target":"hospital.archive.customerSegment"},
      {"key":"segmentCategory","label":"细分类别","section":"双大客户","required":false,"type":"text","target":"hospital.archive.segmentCategory"}
    ]'::jsonb
),
updated_at = NOW()
WHERE code = 'immuno_archive_v1'
  AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(t.schema->'fields') f
      WHERE f->>'key' = 'competitorProjectDistribution'
  );

-- +goose Down
DROP TABLE IF EXISTS hospital_project_items;
DROP INDEX IF EXISTS idx_hospitals_archive_gin;
