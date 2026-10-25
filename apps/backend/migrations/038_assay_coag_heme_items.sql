-- +goose Up
-- Seed coag/heme categories + leaf items under existing assay lines (022).
-- These are assay_projects (检测项目), NOT EQA field_registry subjects.

INSERT INTO assay_projects (code, name, parent_code, kind, sort_order, line_category, status)
VALUES
    -- ensure line roots (idempotent with 022)
    ('coag', '凝血项目', NULL, 'line', 30, '凝血项目', 'active'),
    ('heme', '血球项目', NULL, 'line', 40, '血球项目', 'active'),

    -- 凝血 → 凝血四项
    ('coag.four', '凝血四项', 'coag', 'category', 10, '凝血项目', 'active'),
    ('coag.four.aptt', 'APTT', 'coag.four', 'item', 10, '凝血项目', 'active'),
    ('coag.four.pt', 'PT', 'coag.four', 'item', 20, '凝血项目', 'active'),
    ('coag.four.tt', 'TT', 'coag.four', 'item', 30, '凝血项目', 'active'),
    ('coag.four.fib', 'FIB', 'coag.four', 'item', 40, '凝血项目', 'active'),

    -- 凝血 → 其他
    ('coag.other', '其他', 'coag', 'category', 20, '凝血项目', 'active'),
    ('coag.other.d_d', 'D-D', 'coag.other', 'item', 10, '凝血项目', 'active'),
    ('coag.other.fdp', 'FDP', 'coag.other', 'item', 20, '凝血项目', 'active'),
    ('coag.other.at_iii', 'AT III', 'coag.other', 'item', 30, '凝血项目', 'active'),

    -- 血球 → 血常规
    ('heme.cbc', '血常规', 'heme', 'category', 10, '血球项目', 'active'),
    ('heme.cbc.rbc', 'RBC', 'heme.cbc', 'item', 10, '血球项目', 'active'),
    ('heme.cbc.hgb', 'HGB', 'heme.cbc', 'item', 20, '血球项目', 'active'),
    ('heme.cbc.hct', 'HCT', 'heme.cbc', 'item', 30, '血球项目', 'active'),
    ('heme.cbc.mcv', 'MCV', 'heme.cbc', 'item', 40, '血球项目', 'active'),
    ('heme.cbc.mch', 'MCH', 'heme.cbc', 'item', 50, '血球项目', 'active'),
    ('heme.cbc.mchc', 'MCHC', 'heme.cbc', 'item', 60, '血球项目', 'active'),
    ('heme.cbc.rdw_cv', 'RDW-CV', 'heme.cbc', 'item', 70, '血球项目', 'active'),
    ('heme.cbc.rdw_sd', 'RDW-SD', 'heme.cbc', 'item', 80, '血球项目', 'active'),
    ('heme.cbc.wbc', 'WBC', 'heme.cbc', 'item', 90, '血球项目', 'active'),
    ('heme.cbc.neu', 'Neu', 'heme.cbc', 'item', 100, '血球项目', 'active'),
    ('heme.cbc.lym', 'Lym', 'heme.cbc', 'item', 110, '血球项目', 'active'),
    ('heme.cbc.mon', 'Mon', 'heme.cbc', 'item', 120, '血球项目', 'active'),
    ('heme.cbc.eos', 'Eos', 'heme.cbc', 'item', 130, '血球项目', 'active'),
    ('heme.cbc.bas', 'Bas', 'heme.cbc', 'item', 140, '血球项目', 'active'),
    ('heme.cbc.neu_pct', 'Neu%', 'heme.cbc', 'item', 150, '血球项目', 'active'),
    ('heme.cbc.lym_pct', 'Lym%', 'heme.cbc', 'item', 160, '血球项目', 'active'),
    ('heme.cbc.mon_pct', 'Mon%', 'heme.cbc', 'item', 170, '血球项目', 'active'),
    ('heme.cbc.eos_pct', 'Eos%', 'heme.cbc', 'item', 180, '血球项目', 'active'),
    ('heme.cbc.bas_pct', 'Bas%', 'heme.cbc', 'item', 190, '血球项目', 'active'),
    ('heme.cbc.plt', 'PLT', 'heme.cbc', 'item', 200, '血球项目', 'active'),
    ('heme.cbc.mpv', 'MPV', 'heme.cbc', 'item', 210, '血球项目', 'active'),
    ('heme.cbc.pdw', 'PDW', 'heme.cbc', 'item', 220, '血球项目', 'active'),

    -- 血球 → 其他
    ('heme.other', '其他', 'heme', 'category', 20, '血球项目', 'active'),
    ('heme.other.ret_pct', 'RET%', 'heme.other', 'item', 10, '血球项目', 'active'),
    ('heme.other.ret_num', 'RET#', 'heme.other', 'item', 20, '血球项目', 'active')
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    parent_code = EXCLUDED.parent_code,
    kind = EXCLUDED.kind,
    sort_order = EXCLUDED.sort_order,
    line_category = EXCLUDED.line_category,
    status = EXCLUDED.status,
    updated_at = NOW();

-- +goose Down
DELETE FROM assay_projects WHERE code IN (
    'coag.other.d_d', 'coag.other.fdp', 'coag.other.at_iii',
    'coag.four.aptt', 'coag.four.pt', 'coag.four.tt', 'coag.four.fib',
    'heme.other.ret_pct', 'heme.other.ret_num',
    'heme.cbc.rbc', 'heme.cbc.hgb', 'heme.cbc.hct', 'heme.cbc.mcv',
    'heme.cbc.mch', 'heme.cbc.mchc', 'heme.cbc.rdw_cv', 'heme.cbc.rdw_sd',
    'heme.cbc.wbc', 'heme.cbc.neu', 'heme.cbc.lym', 'heme.cbc.mon',
    'heme.cbc.eos', 'heme.cbc.bas', 'heme.cbc.neu_pct', 'heme.cbc.lym_pct',
    'heme.cbc.mon_pct', 'heme.cbc.eos_pct', 'heme.cbc.bas_pct',
    'heme.cbc.plt', 'heme.cbc.mpv', 'heme.cbc.pdw'
);
DELETE FROM assay_projects WHERE code IN (
    'coag.four', 'coag.other', 'heme.cbc', 'heme.other'
);
-- leave coag/heme line roots (owned by 022)
