-- +goose Up
-- Keep only product templates visible in 问卷模板 / 问卷发放:
--   immuno_archive_v1  = 化免客户档案采集
--   eqa_participation  = 室间质评参评采集
-- Soft-archive the rest so existing campaigns that reference them keep working
-- (survey_campaigns.template_id ON DELETE RESTRICT; FindTemplateById still loads archived).

UPDATE survey_templates
SET status = 'archived',
    updated_at = NOW()
WHERE status = 'active'
  AND code NOT IN ('immuno_archive_v1', 'eqa_participation');

-- Ensure the two keepers stay active if present.
UPDATE survey_templates
SET status = 'active',
    updated_at = NOW()
WHERE code IN ('immuno_archive_v1', 'eqa_participation');

-- +goose Down
UPDATE survey_templates
SET status = 'active',
    updated_at = NOW()
WHERE code IN (
    'chemilum_device_v1',
    'chemilum_archive_v1',
    'svip_archive_v1',
    'dual_major_archive_v1'
);
