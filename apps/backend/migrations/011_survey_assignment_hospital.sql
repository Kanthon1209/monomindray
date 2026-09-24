-- +goose Up
-- Bind each survey task to a hospital (collector × hospital × campaign).

ALTER TABLE survey_assignments
    ADD COLUMN IF NOT EXISTS hospital_id BIGINT REFERENCES hospitals(id) ON DELETE RESTRICT;

-- Replace person-only uniqueness with person×hospital per campaign.
ALTER TABLE survey_assignments
    DROP CONSTRAINT IF EXISTS survey_assignments_campaign_assignee_uq;

DROP INDEX IF EXISTS survey_assignments_campaign_assignee_uq;

CREATE UNIQUE INDEX IF NOT EXISTS survey_assignments_campaign_assignee_hospital_uq
    ON survey_assignments (campaign_id, assignee_id, hospital_id)
    WHERE hospital_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_survey_assignments_hospital
    ON survey_assignments (hospital_id);

COMMENT ON COLUMN survey_assignments.hospital_id IS
    'Root entity for this task; collector fills nested data under this hospital.';

-- Seed hierarchical chemiluminescence-style template (idempotent upsert by code).
INSERT INTO survey_templates (code, title, description, schema, version, status)
VALUES (
    'chemilum_device_v1',
    '化学发光装机盘点',
    '医院为根，设备可重复；审核后写入 hospitals / devices / archive 项目。',
    $schema${
      "sections": ["医院主数据", "联系人", "迈瑞设备"],
      "fields": [
        {"key":"name","label":"医院名称","section":"医院主数据","required":true,"type":"text","target":"hospital.name","locked":true},
        {"key":"province","label":"省份","section":"医院主数据","required":true,"type":"text","target":"hospital.province","locked":true},
        {"key":"city","label":"城市","section":"医院主数据","required":true,"type":"text","target":"hospital.city","locked":true},
        {"key":"level","label":"医院等级","section":"医院主数据","required":true,"type":"text","target":"hospital.level"},
        {"key":"type","label":"医院类型","section":"医院主数据","required":true,"type":"text","target":"hospital.type"},
        {"key":"region","label":"大区","section":"医院主数据","type":"text","target":"hospital.archive.region","locked":true},
        {"key":"branchOffice","label":"分公司","section":"医院主数据","type":"text","target":"hospital.archive.branchOffice","locked":true},
        {"key":"customerCode","label":"客户代码","section":"医院主数据","type":"text","target":"hospital.archive.customerCode","locked":true},
        {"key":"contactName","label":"负责人","section":"联系人","type":"text","target":"hospital.archive.contactName"},
        {"key":"contactPhone","label":"联系电话","section":"联系人","type":"text","target":"hospital.archive.contactPhone"},
        {
          "key":"devices",
          "label":"迈瑞设备",
          "section":"迈瑞设备",
          "type":"repeat",
          "itemLabel":"设备",
          "required":true,
          "fields": [
            {"key":"model","label":"机型","required":true,"type":"text"},
            {"key":"serialNo","label":"序列号","required":true,"type":"text"},
            {"key":"installedAt","label":"安装日期","type":"text"},
            {"key":"usageLocation","label":"使用位置","type":"text"},
            {"key":"mindraySampleVolume","label":"迈瑞标本量","type":"text"},
            {"key":"otherAnalyzers","label":"其它发光仪","type":"text"},
            {"key":"mindrayProjects","label":"迈瑞开展项目","type":"string_array"},
            {"key":"remark","label":"备注","type":"text"}
          ]
        }
      ]
    }$schema$::jsonb,
    1,
    'active'
)
ON CONFLICT (code) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    schema = EXCLUDED.schema,
    updated_at = NOW();

-- +goose Down
DROP INDEX IF EXISTS idx_survey_assignments_hospital;
DROP INDEX IF EXISTS survey_assignments_campaign_assignee_hospital_uq;
ALTER TABLE survey_assignments DROP COLUMN IF EXISTS hospital_id;
DELETE FROM survey_templates WHERE code = 'chemilum_device_v1';
