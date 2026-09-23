-- +goose Up
-- ============================================================
-- Survey workflow: template → campaign → assignment → submission
-- Does NOT alter hospitals/devices; publish-to-hospital is a later step.
-- ============================================================

CREATE TABLE IF NOT EXISTS survey_templates (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64)  NOT NULL,
    title           VARCHAR(200) NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    schema          JSONB        NOT NULL DEFAULT '{"fields":[]}'::jsonb,
    version         INT          NOT NULL DEFAULT 1,
    status          VARCHAR(32)  NOT NULL DEFAULT 'active',
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT survey_templates_code_uq UNIQUE (code),
    CONSTRAINT survey_templates_status_check CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_survey_templates_status ON survey_templates (status);

DROP TRIGGER IF EXISTS trigger_survey_templates_updated_at ON survey_templates;
CREATE TRIGGER trigger_survey_templates_updated_at
    BEFORE UPDATE ON survey_templates
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS survey_campaigns (
    id              BIGSERIAL PRIMARY KEY,
    template_id     BIGINT       NOT NULL REFERENCES survey_templates(id) ON DELETE RESTRICT,
    title           VARCHAR(200) NOT NULL,
    description     TEXT         NOT NULL DEFAULT '',
    due_at          TIMESTAMPTZ,
    status          VARCHAR(32)  NOT NULL DEFAULT 'active',
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT survey_campaigns_status_check CHECK (status IN ('draft', 'active', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_survey_campaigns_template_id ON survey_campaigns (template_id);
CREATE INDEX IF NOT EXISTS idx_survey_campaigns_status ON survey_campaigns (status);

DROP TRIGGER IF EXISTS trigger_survey_campaigns_updated_at ON survey_campaigns;
CREATE TRIGGER trigger_survey_campaigns_updated_at
    BEFORE UPDATE ON survey_campaigns
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS survey_assignments (
    id              BIGSERIAL PRIMARY KEY,
    campaign_id     BIGINT       NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
    assignee_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(32)  NOT NULL DEFAULT 'todo',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT survey_assignments_status_check CHECK (status IN (
        'todo', 'in_progress', 'submitted', 'cancelled'
    )),
    CONSTRAINT survey_assignments_campaign_assignee_uq UNIQUE (campaign_id, assignee_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_assignments_assignee ON survey_assignments (assignee_id);
CREATE INDEX IF NOT EXISTS idx_survey_assignments_campaign ON survey_assignments (campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_assignments_status ON survey_assignments (status);

DROP TRIGGER IF EXISTS trigger_survey_assignments_updated_at ON survey_assignments;
CREATE TRIGGER trigger_survey_assignments_updated_at
    BEFORE UPDATE ON survey_assignments
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS survey_submissions (
    id              BIGSERIAL PRIMARY KEY,
    assignment_id   BIGINT       NOT NULL REFERENCES survey_assignments(id) ON DELETE CASCADE,
    hospital_id     BIGINT       REFERENCES hospitals(id) ON DELETE SET NULL,
    answers         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    status          VARCHAR(32)  NOT NULL DEFAULT 'draft',
    collected_by    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    submitted_at    TIMESTAMPTZ,
    reviewed_by     BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    review_note     TEXT         NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT survey_submissions_assignment_uq UNIQUE (assignment_id),
    CONSTRAINT survey_submissions_status_check CHECK (status IN (
        'draft', 'submitted', 'approved', 'rejected'
    ))
);

CREATE INDEX IF NOT EXISTS idx_survey_submissions_status ON survey_submissions (status);
CREATE INDEX IF NOT EXISTS idx_survey_submissions_collected_by ON survey_submissions (collected_by);

DROP TRIGGER IF EXISTS trigger_survey_submissions_updated_at ON survey_submissions;
CREATE TRIGGER trigger_survey_submissions_updated_at
    BEFORE UPDATE ON survey_submissions
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- Seed: 化免客户档案模板（字段对齐 frontend hospital-archive ARCHIVE_FIELD_DEFS）
-- +goose StatementBegin
INSERT INTO survey_templates (code, title, description, schema, version, status)
VALUES (
    'immuno_archive_v1',
    '化免客户档案采集',
    '对齐《2024年化免客户档案》Excel；审核通过后写入 hospitals / archive（后续步骤）。',
    $schema${
      "fields": [
        {"key":"name","label":"医院名称","section":"医院主数据","required":true,"type":"text","target":"hospital.name"},
        {"key":"province","label":"省份","section":"医院主数据","required":true,"type":"text","target":"hospital.province"},
        {"key":"city","label":"城市","section":"医院主数据","required":true,"type":"text","target":"hospital.city"},
        {"key":"district","label":"区县","section":"医院主数据","required":false,"type":"text","target":"hospital.district"},
        {"key":"level","label":"医院等级","section":"医院主数据","required":true,"type":"text","target":"hospital.level"},
        {"key":"type","label":"医院类型","section":"医院主数据","required":true,"type":"text","target":"hospital.type"},
        {"key":"address","label":"地址","section":"医院主数据","required":false,"type":"text","target":"hospital.address"},
        {"key":"region","label":"大区","section":"客户基础","required":false,"type":"text","target":"hospital.archive.region"},
        {"key":"branchOffice","label":"分公司","section":"客户基础","required":false,"type":"text","target":"hospital.archive.branchOffice"},
        {"key":"customerName","label":"客户名称","section":"客户基础","required":false,"type":"text","target":"hospital.archive.customerName"},
        {"key":"customerCode","label":"客户代码","section":"客户基础","required":false,"type":"text","target":"hospital.archive.customerCode"},
        {"key":"customerLevel","label":"客户级别","section":"客户基础","required":false,"type":"text","target":"hospital.archive.customerLevel"},
        {"key":"model","label":"机型","section":"设备信息","required":false,"type":"text","target":"hospital.archive.model"},
        {"key":"serialNo","label":"序列号","section":"设备信息","required":false,"type":"text","target":"hospital.archive.serialNo"},
        {"key":"installedAt","label":"安装日期","section":"设备信息","required":false,"type":"text","target":"hospital.archive.installedAt"},
        {"key":"enabledAt","label":"启用日期","section":"设备信息","required":false,"type":"text","target":"hospital.archive.enabledAt"},
        {"key":"contactName","label":"负责人","section":"联系人","required":false,"type":"text","target":"hospital.archive.contactName"},
        {"key":"contactPhone","label":"联系电话","section":"联系人","required":false,"type":"text","target":"hospital.archive.contactPhone"},
        {"key":"annualRevenue","label":"医院年收入（亿）","section":"经营数据","required":false,"type":"text","target":"hospital.archive.annualRevenue"},
        {"key":"usageLocation","label":"使用位置","section":"经营数据","required":false,"type":"text","target":"hospital.archive.usageLocation"},
        {"key":"projectCount","label":"开展项目数","section":"项目与试剂","required":false,"type":"text","target":"hospital.archive.projectCount"},
        {"key":"mindrayReagentCount","label":"迈瑞试剂项目数","section":"项目与试剂","required":false,"type":"text","target":"hospital.archive.mindrayReagentCount"},
        {"key":"matchingRate","label":"配套率","section":"项目与试剂","required":false,"type":"text","target":"hospital.archive.matchingRate"},
        {"key":"reagentSupplier","label":"试剂供应商","section":"项目与试剂","required":false,"type":"text","target":"hospital.archive.reagentSupplier"},
        {"key":"mindrayProjects","label":"迈瑞开展项目","section":"项目与试剂","required":false,"type":"text","target":"hospital.archive.mindrayProjects"},
        {"key":"newProjects","label":"主导新增项目","section":"项目与试剂","required":false,"type":"text","target":"hospital.archive.newProjects"},
        {"key":"otherAnalyzers","label":"其它发光仪","section":"竞品与标本","required":false,"type":"text","target":"hospital.archive.otherAnalyzers"},
        {"key":"mindraySampleVolume","label":"迈瑞标本量","section":"竞品与标本","required":false,"type":"text","target":"hospital.archive.mindraySampleVolume"},
        {"key":"totalSampleVolume","label":"总标本量","section":"竞品与标本","required":false,"type":"text","target":"hospital.archive.totalSampleVolume"},
        {"key":"unusedProjects","label":"未使用迈瑞项目及品牌及供应商","section":"竞品与标本","required":false,"type":"text","target":"hospital.archive.unusedProjects"},
        {"key":"missingProjects","label":"迈瑞没有项目名称及品牌","section":"竞品与标本","required":false,"type":"text","target":"hospital.archive.missingProjects"},
        {"key":"qcVendor","label":"质控品厂家","section":"质控","required":false,"type":"text","target":"hospital.archive.qcVendor"},
        {"key":"qcLevels","label":"质控水平数","section":"质控","required":false,"type":"text","target":"hospital.archive.qcLevels"},
        {"key":"qcCycle","label":"质控周期","section":"质控","required":false,"type":"text","target":"hospital.archive.qcCycle"},
        {"key":"archiveRemark","label":"备注","section":"其他","required":false,"type":"text","target":"hospital.archive.archiveRemark"}
      ]
    }$schema$::jsonb,
    1,
    'active'
)
ON CONFLICT (code) DO NOTHING;
-- +goose StatementEnd

-- +goose Down
-- Historical migration: prefer forward fixes over automatic rollback.
SELECT 1;
