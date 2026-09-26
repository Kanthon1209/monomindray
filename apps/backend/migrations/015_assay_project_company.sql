-- +goose Up
-- Assay project dictionary: company ownership (derive 自有/竞品 from company name)

ALTER TABLE assay_projects
    ADD COLUMN IF NOT EXISTS company VARCHAR(128) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_assay_projects_company ON assay_projects (company) WHERE company <> '';
CREATE INDEX IF NOT EXISTS idx_assay_projects_status ON assay_projects (status);

-- Backfill: previously flagged own-menu rows belong to 迈瑞
UPDATE assay_projects
SET company = '迈瑞', updated_at = NOW()
WHERE is_own_menu = TRUE AND TRIM(company) = '';

COMMENT ON COLUMN assay_projects.company IS
    '所属公司（迈瑞/罗氏/安图…）。自有 vs 竞品由应用层根据公司名推导，不单独存布尔。';
COMMENT ON COLUMN assay_projects.is_own_menu IS
    '遗留字段；新逻辑以 company 为准，写入时同步维护以兼容旧查询。';

-- +goose Down
DROP INDEX IF EXISTS idx_assay_projects_status;
DROP INDEX IF EXISTS idx_assay_projects_company;
ALTER TABLE assay_projects DROP COLUMN IF EXISTS company;
