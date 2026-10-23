-- +goose Up
-- ============================================================
-- EQA subject catalog: replace stub booleans with full national /
-- provincial subject lists from 国考客户 / 省考客户 sheet headers.
-- Also: remove mirrored eqa.field.* rows from collectable_fields
-- (subjects live only in field_registry for the EQA composite block).
-- ============================================================
--
-- code ↔ name mapping (stable ascii codes; 国考/省考同名科目 code 不同)
--
-- National (parent scope.national), sort_order 10..310:
--   national.infection_a          感 A
--   national.infection_c          感 C
--   national.endocrinology        内分泌
--   national.bone_markers         骨代谢标志物
--   national.pepsinogen           胃蛋白酶原
--   national.cytokine_il6         细胞因子&白细胞介素6
--   national.pct                  血清降钙素原
--   national.thyroid              甲状腺功能
--   national.cardiac              心肌
--   national.liver_fibrosis       肝纤维化血清学 指标
--   national.bnp_ntprobnp         脑钠肽/N 末端前脑 （心衰标志物）
--   national.torch                TORCH
--   national.tumor_marker_a       肿瘤标志物A
--   national.infection_rapid      感染性疾病抗原抗体快速检测
--   national.tumor_marker_b       肿瘤标志物B
--   national.d_dimer              D- 二聚体检测
--   national.aldosterone_renin    醛固酮和肾素
--   national.chem_a               常规化学A
--   national.chem_b               常规化学B
--   national.chem_c               常规化学C
--   national.lipid_a              脂类A
--   national.lipid_b              脂类B
--   national.special_protein      特殊蛋白
--   national.csf_biochem          脑脊液生化
--   national.urine_quant_biochem  尿液定量生化
--   national.urine_protein_marker_1  尿液蛋白标志物Ⅰ
--   national.cystatin_c           半胱氨酸蛋白酶抑制剂C
--   national.cbc                  全血细胞计数
--   national.coagulation          凝血试验
--   national.hba1c                糖化血红蛋白
--   national.urine_chem           尿液化学分析
--
-- Provincial (parent scope.provincial), sort_order 10..150:
--   provincial.infection_a          感 A
--   provincial.infection_b          感 B
--   provincial.endocrinology        内分泌
--   provincial.tumor_marker         肿瘤标志物
--   provincial.cardiac              心肌
--   provincial.amh                  AMH
--   provincial.d_dimer              D- 二聚体检测
--   provincial.hba1c                糖化血红蛋白
--   provincial.urine_quant_biochem  尿液定量生化
--   provincial.cbc                  全血细胞计数
--   provincial.coagulation          凝血试验
--   provincial.urine_chem           尿液化学分析
--   provincial.chem                 常规化学
--   provincial.special_protein      特种蛋白
--   provincial.lipid                脂类
-- ============================================================

-- Ensure scope group rows exist
INSERT INTO field_registry (code, name, value_type, parent_code, enum_values, sort_order)
VALUES
    ('scope.national',   '国家室间质评', 'group', NULL, '[]'::jsonb, 10),
    ('scope.provincial', '省级室间质评', 'group', NULL, '[]'::jsonb, 20)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    value_type = 'group',
    parent_code = NULL,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- Stub codes from 016 (placeholder subjects, not business catalog)
-- Safe retire: drop any participation items referencing stubs, then delete stubs.
DELETE FROM eqa_participation_items
WHERE field_code IN (
    'national.biochem',
    'national.immuno',
    'national.bloodgas',
    'provincial.biochem',
    'provincial.immuno'
);

DELETE FROM collectable_fields
WHERE code IN (
    'eqa.field.national.biochem',
    'eqa.field.national.immuno',
    'eqa.field.national.bloodgas',
    'eqa.field.provincial.biochem',
    'eqa.field.provincial.immuno'
);

DELETE FROM field_registry
WHERE code IN (
    'national.biochem',
    'national.immuno',
    'national.bloodgas',
    'provincial.biochem',
    'provincial.immuno'
);

-- Full national subject catalog
INSERT INTO field_registry (code, name, value_type, parent_code, enum_values, sort_order)
VALUES
    ('national.infection_a',           '感 A',                           'boolean', 'scope.national', '[]'::jsonb, 10),
    ('national.infection_c',           '感 C',                           'boolean', 'scope.national', '[]'::jsonb, 20),
    ('national.endocrinology',         '内分泌',                         'boolean', 'scope.national', '[]'::jsonb, 30),
    ('national.bone_markers',          '骨代谢标志物',                   'boolean', 'scope.national', '[]'::jsonb, 40),
    ('national.pepsinogen',            '胃蛋白酶原',                     'boolean', 'scope.national', '[]'::jsonb, 50),
    ('national.cytokine_il6',          '细胞因子&白细胞介素6',           'boolean', 'scope.national', '[]'::jsonb, 60),
    ('national.pct',                   '血清降钙素原',                   'boolean', 'scope.national', '[]'::jsonb, 70),
    ('national.thyroid',               '甲状腺功能',                     'boolean', 'scope.national', '[]'::jsonb, 80),
    ('national.cardiac',               '心肌',                           'boolean', 'scope.national', '[]'::jsonb, 90),
    ('national.liver_fibrosis',        '肝纤维化血清学 指标',            'boolean', 'scope.national', '[]'::jsonb, 100),
    ('national.bnp_ntprobnp',          '脑钠肽/N 末端前脑 （心衰标志物）', 'boolean', 'scope.national', '[]'::jsonb, 110),
    ('national.torch',                 'TORCH',                          'boolean', 'scope.national', '[]'::jsonb, 120),
    ('national.tumor_marker_a',        '肿瘤标志物A',                    'boolean', 'scope.national', '[]'::jsonb, 130),
    ('national.infection_rapid',       '感染性疾病抗原抗体快速检测',     'boolean', 'scope.national', '[]'::jsonb, 140),
    ('national.tumor_marker_b',        '肿瘤标志物B',                    'boolean', 'scope.national', '[]'::jsonb, 150),
    ('national.d_dimer',               'D- 二聚体检测',                  'boolean', 'scope.national', '[]'::jsonb, 160),
    ('national.aldosterone_renin',     '醛固酮和肾素',                   'boolean', 'scope.national', '[]'::jsonb, 170),
    ('national.chem_a',                '常规化学A',                      'boolean', 'scope.national', '[]'::jsonb, 180),
    ('national.chem_b',                '常规化学B',                      'boolean', 'scope.national', '[]'::jsonb, 190),
    ('national.chem_c',                '常规化学C',                      'boolean', 'scope.national', '[]'::jsonb, 200),
    ('national.lipid_a',               '脂类A',                          'boolean', 'scope.national', '[]'::jsonb, 210),
    ('national.lipid_b',               '脂类B',                          'boolean', 'scope.national', '[]'::jsonb, 220),
    ('national.special_protein',       '特殊蛋白',                       'boolean', 'scope.national', '[]'::jsonb, 230),
    ('national.csf_biochem',           '脑脊液生化',                     'boolean', 'scope.national', '[]'::jsonb, 240),
    ('national.urine_quant_biochem',   '尿液定量生化',                   'boolean', 'scope.national', '[]'::jsonb, 250),
    ('national.urine_protein_marker_1','尿液蛋白标志物Ⅰ',                'boolean', 'scope.national', '[]'::jsonb, 260),
    ('national.cystatin_c',            '半胱氨酸蛋白酶抑制剂C',          'boolean', 'scope.national', '[]'::jsonb, 270),
    ('national.cbc',                   '全血细胞计数',                   'boolean', 'scope.national', '[]'::jsonb, 280),
    ('national.coagulation',           '凝血试验',                       'boolean', 'scope.national', '[]'::jsonb, 290),
    ('national.hba1c',                 '糖化血红蛋白',                   'boolean', 'scope.national', '[]'::jsonb, 300),
    ('national.urine_chem',            '尿液化学分析',                   'boolean', 'scope.national', '[]'::jsonb, 310)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    value_type = 'boolean',
    parent_code = 'scope.national',
    enum_values = '[]'::jsonb,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- Full provincial subject catalog
INSERT INTO field_registry (code, name, value_type, parent_code, enum_values, sort_order)
VALUES
    ('provincial.infection_a',         '感 A',           'boolean', 'scope.provincial', '[]'::jsonb, 10),
    ('provincial.infection_b',         '感 B',           'boolean', 'scope.provincial', '[]'::jsonb, 20),
    ('provincial.endocrinology',       '内分泌',         'boolean', 'scope.provincial', '[]'::jsonb, 30),
    ('provincial.tumor_marker',        '肿瘤标志物',     'boolean', 'scope.provincial', '[]'::jsonb, 40),
    ('provincial.cardiac',             '心肌',           'boolean', 'scope.provincial', '[]'::jsonb, 50),
    ('provincial.amh',                 'AMH',            'boolean', 'scope.provincial', '[]'::jsonb, 60),
    ('provincial.d_dimer',             'D- 二聚体检测',  'boolean', 'scope.provincial', '[]'::jsonb, 70),
    ('provincial.hba1c',               '糖化血红蛋白',   'boolean', 'scope.provincial', '[]'::jsonb, 80),
    ('provincial.urine_quant_biochem', '尿液定量生化',   'boolean', 'scope.provincial', '[]'::jsonb, 90),
    ('provincial.cbc',                 '全血细胞计数',   'boolean', 'scope.provincial', '[]'::jsonb, 100),
    ('provincial.coagulation',         '凝血试验',       'boolean', 'scope.provincial', '[]'::jsonb, 110),
    ('provincial.urine_chem',          '尿液化学分析',   'boolean', 'scope.provincial', '[]'::jsonb, 120),
    ('provincial.chem',                '常规化学',       'boolean', 'scope.provincial', '[]'::jsonb, 130),
    ('provincial.special_protein',     '特种蛋白',       'boolean', 'scope.provincial', '[]'::jsonb, 140),
    ('provincial.lipid',               '脂类',           'boolean', 'scope.provincial', '[]'::jsonb, 150)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    value_type = 'boolean',
    parent_code = 'scope.provincial',
    enum_values = '[]'::jsonb,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- Stop exposing EQA subjects as drag-in catalog fields.
-- Keep eqa.year / eqa.scope for now (flat-template scaffolding).
-- Do NOT re-INSERT eqa.field.* from field_registry here or in future seeds.
DELETE FROM collectable_fields
WHERE domain = 'eqa'
  AND code LIKE 'eqa.field.%';

-- +goose Down
-- Restore 016 stubs; remove full catalog subjects; leave collectable_fields eqa.field.* unrestored
-- (re-run 017 mirror only if needed — Down is best-effort).

DELETE FROM eqa_participation_items
WHERE field_code LIKE 'national.%'
   OR field_code LIKE 'provincial.%';

DELETE FROM field_registry
WHERE parent_code IN ('scope.national', 'scope.provincial')
  AND value_type = 'boolean';

INSERT INTO field_registry (code, name, value_type, parent_code, enum_values, sort_order)
VALUES
    ('national.biochem',   '国家-生化', 'boolean', 'scope.national',   '[]'::jsonb, 11),
    ('national.immuno',    '国家-免疫', 'boolean', 'scope.national',   '[]'::jsonb, 12),
    ('national.bloodgas',  '国家-血气', 'boolean', 'scope.national',   '[]'::jsonb, 13),
    ('provincial.biochem', '省级-生化', 'boolean', 'scope.provincial', '[]'::jsonb, 21),
    ('provincial.immuno',  '省级-免疫', 'boolean', 'scope.provincial', '[]'::jsonb, 22)
ON CONFLICT (code) DO NOTHING;
