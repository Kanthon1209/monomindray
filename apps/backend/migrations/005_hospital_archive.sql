-- ============================================================
-- Hospital archive fields aligned with 化免客户档案 Excel headers
-- ============================================================

ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS archive JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN hospitals.archive IS
    '化免客户档案扩展字段（对齐 Excel 表头），键见 specs/data_model.md';

-- Demo archive for a few seeded hospitals (idempotent)
UPDATE hospitals SET archive = jsonb_build_object(
    'branchOffice', '合肥',
    'customerCode', '',
    'contactName', '朱传卫',
    'contactPhone', '13956586358',
    'enabledAt', '2022-03-15',
    'annualRevenue', '',
    'usageLocation', '综合',
    'projectCount', '52',
    'mindrayReagentCount', '21',
    'matchingRate', '',
    'otherAnalyzers', '安图、罗氏、科美',
    'mindraySampleVolume', '145',
    'totalSampleVolume', '380',
    'qcVendor', '伯乐',
    'qcLevels', '1',
    'qcCycle', '看情况',
    'reagentSupplier', '金杉',
    'mindrayProjects', '乙肝5项、甲功6项、肿标8项、糖尿病2项',
    'newProjects', '',
    'unusedProjects', '安图（优生8项等）、罗氏411/601',
    'missingProjects', '生长激素(GH)、TOX-IgM 等',
    'archiveRemark', '术前八项：住院病人，日均90个标本在罗氏411检测'
)
WHERE name = '合肥人民医院' AND province = '安徽省'
  AND (archive IS NULL OR archive = '{}'::jsonb);

UPDATE hospitals SET archive = jsonb_build_object(
    'branchOffice', '广州',
    'usageLocation', '检验科',
    'projectCount', '48',
    'mindrayReagentCount', '30',
    'matchingRate', '62.5%',
    'otherAnalyzers', '罗氏',
    'mindraySampleVolume', '220',
    'totalSampleVolume', '500',
    'qcVendor', '伯乐',
    'qcLevels', '2',
    'qcCycle', '每日',
    'reagentSupplier', '迈瑞',
    'mindrayProjects', '乙肝5项、甲功、肿标',
    'contactName', '张明',
    'contactPhone', '13800001111'
)
WHERE name = '广州人民医院' AND province = '广东省'
  AND (archive IS NULL OR archive = '{}'::jsonb);
