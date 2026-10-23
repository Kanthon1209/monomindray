-- +goose Up
-- ============================================================
-- Hierarchical assay catalog (line → category → item).
-- DELETE old flat assay_projects + hospital_assays; seed full tree.
-- Do NOT touch EQA tables.
-- Mapping counts: 2 lines, 20 categories, 173 items (195 rows).
-- PCT weirdness in source: category PCT with items PCT, IL-6, sCD14-ST.
-- Duplicate Renin/ALD in 骨代谢 deduped within category.
-- ============================================================

-- Clear hospital offerings and flat dictionary
DELETE FROM hospital_assays;
DELETE FROM assay_projects;

-- Drop unique(name): same display name can exist under different parents (e.g. TG, CK-MB, D-Dimer)
ALTER TABLE assay_projects DROP CONSTRAINT IF EXISTS uq_assay_projects_name;

-- Tree columns
ALTER TABLE assay_projects
    ADD COLUMN IF NOT EXISTS parent_code VARCHAR(128),
    ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'item',
    ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- kind constraint
ALTER TABLE assay_projects DROP CONSTRAINT IF EXISTS assay_projects_kind_check;
ALTER TABLE assay_projects
    ADD CONSTRAINT assay_projects_kind_check CHECK (kind IN ('line', 'category', 'item'));

-- Stable code required & unique
UPDATE assay_projects SET code = 'legacy_' || id::text WHERE TRIM(code) = '';
ALTER TABLE assay_projects ALTER COLUMN code SET DEFAULT '';
-- ensure non-empty codes going forward via unique index
DROP INDEX IF EXISTS uq_assay_projects_code;
ALTER TABLE assay_projects DROP CONSTRAINT IF EXISTS uq_assay_projects_code;
CREATE UNIQUE INDEX IF NOT EXISTS uq_assay_projects_code ON assay_projects (code);

CREATE INDEX IF NOT EXISTS idx_assay_projects_parent ON assay_projects (parent_code);
CREATE INDEX IF NOT EXISTS idx_assay_projects_kind ON assay_projects (kind);

COMMENT ON COLUMN assay_projects.parent_code IS 'Parent node code; NULL for line roots';
COMMENT ON COLUMN assay_projects.kind IS 'line | category | item; only item may be selected on hospital_assays';
COMMENT ON COLUMN assay_projects.sort_order IS 'Sibling sort order';
COMMENT ON COLUMN assay_projects.line_category IS 'Legacy display hint (产线中文名); prefer walking parent to line';

-- Parent FK (self-ref by code). Defer until after seed? Add after seed so order is free.
-- Seed all rows first, then add FK.

INSERT INTO assay_projects (code, name, parent_code, kind, sort_order, line_category, status)
VALUES
    ('biochem', '生化项目', NULL, 'line', 10, '生化项目', 'active'),
    ('biochem.liver', '肝功类', 'biochem', 'category', 10, '生化项目', 'active'),
    ('biochem.liver.alt', 'ALT', 'biochem.liver', 'item', 10, '生化项目', 'active'),
    ('biochem.liver.ast', 'AST', 'biochem.liver', 'item', 20, '生化项目', 'active'),
    ('biochem.liver.alp', 'ALP', 'biochem.liver', 'item', 30, '生化项目', 'active'),
    ('biochem.liver.g_gt', 'γ-GT', 'biochem.liver', 'item', 40, '生化项目', 'active'),
    ('biochem.liver.t_bil_v', 'T-bil-V', 'biochem.liver', 'item', 50, '生化项目', 'active'),
    ('biochem.liver.d_bil_v', 'D-bil-V', 'biochem.liver', 'item', 60, '生化项目', 'active'),
    ('biochem.liver.tp', 'TP', 'biochem.liver', 'item', 70, '生化项目', 'active'),
    ('biochem.liver.alb', 'ALB', 'biochem.liver', 'item', 80, '生化项目', 'active'),
    ('biochem.liver.glb', 'GLB', 'biochem.liver', 'item', 90, '生化项目', 'active'),
    ('biochem.liver.tba', 'TBA', 'biochem.liver', 'item', 100, '生化项目', 'active'),
    ('biochem.liver.che', 'CHE', 'biochem.liver', 'item', 110, '生化项目', 'active'),
    ('biochem.liver.pa', 'PA', 'biochem.liver', 'item', 120, '生化项目', 'active'),
    ('biochem.liver.ada', 'ADA', 'biochem.liver', 'item', 130, '生化项目', 'active'),
    ('biochem.liver.5_nt', '5′-NT', 'biochem.liver', 'item', 140, '生化项目', 'active'),
    ('biochem.liver.afu', 'AFU', 'biochem.liver', 'item', 150, '生化项目', 'active'),
    ('biochem.kidney', '肾功类', 'biochem', 'category', 20, '生化项目', 'active'),
    ('biochem.kidney.crea_s', 'CREA-S', 'biochem.kidney', 'item', 10, '生化项目', 'active'),
    ('biochem.kidney.ua', 'UA', 'biochem.kidney', 'item', 20, '生化项目', 'active'),
    ('biochem.kidney.urea', 'UREA', 'biochem.kidney', 'item', 30, '生化项目', 'active'),
    ('biochem.kidney.co2', 'CO2', 'biochem.kidney', 'item', 40, '生化项目', 'active'),
    ('biochem.kidney.cysc', 'CysC', 'biochem.kidney', 'item', 50, '生化项目', 'active'),
    ('biochem.kidney.b2_mg', 'β2-mG', 'biochem.kidney', 'item', 60, '生化项目', 'active'),
    ('biochem.kidney.b2_mg_u', 'β2-mG-U', 'biochem.kidney', 'item', 70, '生化项目', 'active'),
    ('biochem.kidney.malb', 'MALB', 'biochem.kidney', 'item', 80, '生化项目', 'active'),
    ('biochem.kidney.rbp', 'RBP', 'biochem.kidney', 'item', 90, '生化项目', 'active'),
    ('biochem.kidney.tpuc', 'TPUC', 'biochem.kidney', 'item', 100, '生化项目', 'active'),
    ('biochem.lipid', '血脂类', 'biochem', 'category', 30, '生化项目', 'active'),
    ('biochem.lipid.tc', 'TC', 'biochem.lipid', 'item', 10, '生化项目', 'active'),
    ('biochem.lipid.tg', 'TG', 'biochem.lipid', 'item', 20, '生化项目', 'active'),
    ('biochem.lipid.hdl_c', 'HDL-C', 'biochem.lipid', 'item', 30, '生化项目', 'active'),
    ('biochem.lipid.ldl_c', 'LDL-C', 'biochem.lipid', 'item', 40, '生化项目', 'active'),
    ('biochem.lipid.apoa1', 'ApoA1', 'biochem.lipid', 'item', 50, '生化项目', 'active'),
    ('biochem.lipid.apob', 'ApoB', 'biochem.lipid', 'item', 60, '生化项目', 'active'),
    ('biochem.lipid.lp_a', 'LP(a)', 'biochem.lipid', 'item', 70, '生化项目', 'active'),
    ('biochem.lipid.sd_ldlc', 'sd-LDLC', 'biochem.lipid', 'item', 80, '生化项目', 'active'),
    ('biochem.lipid.hcy', 'HCY', 'biochem.lipid', 'item', 90, '生化项目', 'active'),
    ('biochem.lipid.ace', 'ACE', 'biochem.lipid', 'item', 100, '生化项目', 'active'),
    ('biochem.cardio', '心血管类', 'biochem', 'category', 40, '生化项目', 'active'),
    ('biochem.cardio.ldh', 'LDH', 'biochem.cardio', 'item', 10, '生化项目', 'active'),
    ('biochem.cardio.a_hbdh', 'α-HBDH', 'biochem.cardio', 'item', 20, '生化项目', 'active'),
    ('biochem.cardio.ck', 'CK', 'biochem.cardio', 'item', 30, '生化项目', 'active'),
    ('biochem.cardio.ck_mb', 'CK-MB', 'biochem.cardio', 'item', 40, '生化项目', 'active'),
    ('biochem.cardio.myo', 'MYO', 'biochem.cardio', 'item', 50, '生化项目', 'active'),
    ('biochem.cardio.d_dimer', 'D-Dimer', 'biochem.cardio', 'item', 60, '生化项目', 'active'),
    ('biochem.glucose', '糖代谢类', 'biochem', 'category', 50, '生化项目', 'active'),
    ('biochem.glucose.glu_o', 'Glu-O', 'biochem.glucose', 'item', 10, '生化项目', 'active'),
    ('biochem.glucose.glu_hk', 'Glu-HK', 'biochem.glucose', 'item', 20, '生化项目', 'active'),
    ('biochem.glucose.hba1c', 'HbA1c', 'biochem.glucose', 'item', 30, '生化项目', 'active'),
    ('biochem.glucose.fun', 'FUN', 'biochem.glucose', 'item', 40, '生化项目', 'active'),
    ('biochem.glucose.b_hb', 'β-HB', 'biochem.glucose', 'item', 50, '生化项目', 'active'),
    ('biochem.pancreas', '胰腺类', 'biochem', 'category', 60, '生化项目', 'active'),
    ('biochem.pancreas.a_amy', 'α-AMY', 'biochem.pancreas', 'item', 10, '生化项目', 'active'),
    ('biochem.pancreas.lip', 'LIP', 'biochem.pancreas', 'item', 20, '生化项目', 'active'),
    ('biochem.ion_anemia', '离子及贫血类', 'biochem', 'category', 70, '生化项目', 'active'),
    ('biochem.ion_anemia.k', 'K', 'biochem.ion_anemia', 'item', 10, '生化项目', 'active'),
    ('biochem.ion_anemia.na', 'NA', 'biochem.ion_anemia', 'item', 20, '生化项目', 'active'),
    ('biochem.ion_anemia.cl', 'CL', 'biochem.ion_anemia', 'item', 30, '生化项目', 'active'),
    ('biochem.ion_anemia.ca', 'Ca', 'biochem.ion_anemia', 'item', 40, '生化项目', 'active'),
    ('biochem.ion_anemia.p', 'P', 'biochem.ion_anemia', 'item', 50, '生化项目', 'active'),
    ('biochem.ion_anemia.mg', 'Mg', 'biochem.ion_anemia', 'item', 60, '生化项目', 'active'),
    ('biochem.ion_anemia.fe', 'Fe', 'biochem.ion_anemia', 'item', 70, '生化项目', 'active'),
    ('biochem.ion_anemia.fer', 'FER', 'biochem.ion_anemia', 'item', 80, '生化项目', 'active'),
    ('biochem.ion_anemia.trf', 'TRF', 'biochem.ion_anemia', 'item', 90, '生化项目', 'active'),
    ('biochem.ion_anemia.g6pd', 'G6PD', 'biochem.ion_anemia', 'item', 100, '生化项目', 'active'),
    ('biochem.ion_anemia.uibc', 'UIBC', 'biochem.ion_anemia', 'item', 110, '生化项目', 'active'),
    ('biochem.special_protein', '特种蛋白类', 'biochem', 'category', 80, '生化项目', 'active'),
    ('biochem.special_protein.iga', 'IgA', 'biochem.special_protein', 'item', 10, '生化项目', 'active'),
    ('biochem.special_protein.igg', 'IgG', 'biochem.special_protein', 'item', 20, '生化项目', 'active'),
    ('biochem.special_protein.igm', 'IgM', 'biochem.special_protein', 'item', 30, '生化项目', 'active'),
    ('biochem.special_protein.ige', 'IgE', 'biochem.special_protein', 'item', 40, '生化项目', 'active'),
    ('biochem.special_protein.c3', 'C3', 'biochem.special_protein', 'item', 50, '生化项目', 'active'),
    ('biochem.special_protein.c4', 'C4', 'biochem.special_protein', 'item', 60, '生化项目', 'active'),
    ('biochem.special_protein.aso', 'ASO', 'biochem.special_protein', 'item', 70, '生化项目', 'active'),
    ('biochem.special_protein.rf', 'RF', 'biochem.special_protein', 'item', 80, '生化项目', 'active'),
    ('biochem.special_protein.crp', 'CRP', 'biochem.special_protein', 'item', 90, '生化项目', 'active'),
    ('biochem.special_protein.hs_crp', 'HS-CRP', 'biochem.special_protein', 'item', 100, '生化项目', 'active'),
    ('immuno', '免疫项目', NULL, 'line', 20, '免疫项目', 'active'),
    ('immuno.tumor', '肿标', 'immuno', 'category', 10, '免疫项目', 'active'),
    ('immuno.tumor.afp', 'AFP', 'immuno.tumor', 'item', 10, '免疫项目', 'active'),
    ('immuno.tumor.cea', 'CEA', 'immuno.tumor', 'item', 20, '免疫项目', 'active'),
    ('immuno.tumor.ca125', 'CA125', 'immuno.tumor', 'item', 30, '免疫项目', 'active'),
    ('immuno.tumor.ca15_3', 'CA15-3', 'immuno.tumor', 'item', 40, '免疫项目', 'active'),
    ('immuno.tumor.ca19_9', 'CA19-9', 'immuno.tumor', 'item', 50, '免疫项目', 'active'),
    ('immuno.tumor.ca72_4', 'CA72-4', 'immuno.tumor', 'item', 60, '免疫项目', 'active'),
    ('immuno.tumor.total_psa', 'Total-PSA', 'immuno.tumor', 'item', 70, '免疫项目', 'active'),
    ('immuno.tumor.fpsa', 'fPSA', 'immuno.tumor', 'item', 80, '免疫项目', 'active'),
    ('immuno.tumor.ca50', 'CA50', 'immuno.tumor', 'item', 90, '免疫项目', 'active'),
    ('immuno.tumor.ca242', 'CA242', 'immuno.tumor', 'item', 100, '免疫项目', 'active'),
    ('immuno.tumor.progrp', 'ProGRP', 'immuno.tumor', 'item', 110, '免疫项目', 'active'),
    ('immuno.tumor.cyfra21_1', 'Cyfra21-1', 'immuno.tumor', 'item', 120, '免疫项目', 'active'),
    ('immuno.tumor.nse', 'NSE', 'immuno.tumor', 'item', 130, '免疫项目', 'active'),
    ('immuno.tumor.pg_i', 'PG I', 'immuno.tumor', 'item', 140, '免疫项目', 'active'),
    ('immuno.tumor.scca', 'SCCA', 'immuno.tumor', 'item', 150, '免疫项目', 'active'),
    ('immuno.tumor.he4', 'HE4', 'immuno.tumor', 'item', 160, '免疫项目', 'active'),
    ('immuno.tumor.g_17', 'G-17', 'immuno.tumor', 'item', 170, '免疫项目', 'active'),
    ('immuno.tumor.s100', 'S100', 'immuno.tumor', 'item', 180, '免疫项目', 'active'),
    ('immuno.tumor.pivka_ii', 'PIVKA-II', 'immuno.tumor', 'item', 190, '免疫项目', 'active'),
    ('immuno.tumor.h_pylori_igg', 'H.pylori IgG', 'immuno.tumor', 'item', 200, '免疫项目', 'active'),
    ('immuno.hormone', '激素', 'immuno', 'category', 20, '免疫项目', 'active'),
    ('immuno.hormone.b_hcg', 'β-HCG', 'immuno.hormone', 'item', 10, '免疫项目', 'active'),
    ('immuno.hormone.lh', 'LH', 'immuno.hormone', 'item', 20, '免疫项目', 'active'),
    ('immuno.hormone.fsh', 'FSH', 'immuno.hormone', 'item', 30, '免疫项目', 'active'),
    ('immuno.hormone.prog', 'PROG', 'immuno.hormone', 'item', 40, '免疫项目', 'active'),
    ('immuno.hormone.prl', 'PRL', 'immuno.hormone', 'item', 50, '免疫项目', 'active'),
    ('immuno.hormone.testo', 'TESTO', 'immuno.hormone', 'item', 60, '免疫项目', 'active'),
    ('immuno.hormone.e2', 'E2', 'immuno.hormone', 'item', 70, '免疫项目', 'active'),
    ('immuno.hormone.dhea_s', 'DHEA-S', 'immuno.hormone', 'item', 80, '免疫项目', 'active'),
    ('immuno.hormone.e3', 'E3', 'immuno.hormone', 'item', 90, '免疫项目', 'active'),
    ('immuno.hormone.acth', 'ACTH', 'immuno.hormone', 'item', 100, '免疫项目', 'active'),
    ('immuno.hormone.cortisol', 'Cortisol', 'immuno.hormone', 'item', 110, '免疫项目', 'active'),
    ('immuno.hormone.amh', 'AMH', 'immuno.hormone', 'item', 120, '免疫项目', 'active'),
    ('immuno.hormone.hgh', 'hGH', 'immuno.hormone', 'item', 130, '免疫项目', 'active'),
    ('immuno.hormone.igf_1', 'IGF-1', 'immuno.hormone', 'item', 140, '免疫项目', 'active'),
    ('immuno.hormone.igfbp_3', 'IGFBP-3', 'immuno.hormone', 'item', 150, '免疫项目', 'active'),
    ('immuno.hormone.shbg', 'SHBG', 'immuno.hormone', 'item', 160, '免疫项目', 'active'),
    ('immuno.hormone.free_testo', 'Free Testo', 'immuno.hormone', 'item', 170, '免疫项目', 'active'),
    ('immuno.thyroid', '甲功', 'immuno', 'category', 30, '免疫项目', 'active'),
    ('immuno.thyroid.tsh', 'TSH', 'immuno.thyroid', 'item', 10, '免疫项目', 'active'),
    ('immuno.thyroid.t3', 'T3', 'immuno.thyroid', 'item', 20, '免疫项目', 'active'),
    ('immuno.thyroid.t4', 'T4', 'immuno.thyroid', 'item', 30, '免疫项目', 'active'),
    ('immuno.thyroid.ft3', 'FT3', 'immuno.thyroid', 'item', 40, '免疫项目', 'active'),
    ('immuno.thyroid.ft4', 'FT4', 'immuno.thyroid', 'item', 50, '免疫项目', 'active'),
    ('immuno.thyroid.tg', 'TG', 'immuno.thyroid', 'item', 60, '免疫项目', 'active'),
    ('immuno.thyroid.rt3', 'rT3', 'immuno.thyroid', 'item', 70, '免疫项目', 'active'),
    ('immuno.thyroid.anti_tpo', 'Anti-TPO', 'immuno.thyroid', 'item', 80, '免疫项目', 'active'),
    ('immuno.thyroid.anti_tg', 'Anti-Tg', 'immuno.thyroid', 'item', 90, '免疫项目', 'active'),
    ('immuno.thyroid.trab', 'TRAb', 'immuno.thyroid', 'item', 100, '免疫项目', 'active'),
    ('immuno.cardiac', '心肌', 'immuno', 'category', 40, '免疫项目', 'active'),
    ('immuno.cardiac.ck_mb', 'CK-MB', 'immuno.cardiac', 'item', 10, '免疫项目', 'active'),
    ('immuno.cardiac.myoglobin_myo', 'Myoglobin（MYO）', 'immuno.cardiac', 'item', 20, '免疫项目', 'active'),
    ('immuno.cardiac.myoglobin_stat', 'Myoglobin  STAT', 'immuno.cardiac', 'item', 30, '免疫项目', 'active'),
    ('immuno.cardiac.hs_ctni', 'hs-cTnI', 'immuno.cardiac', 'item', 40, '免疫项目', 'active'),
    ('immuno.cardiac.troponin_i_tni', 'Troponin I（TnI）', 'immuno.cardiac', 'item', 50, '免疫项目', 'active'),
    ('immuno.cardiac.nt_probnp', 'NT-proBNP', 'immuno.cardiac', 'item', 60, '免疫项目', 'active'),
    ('immuno.cardiac.bnp', 'BNP', 'immuno.cardiac', 'item', 70, '免疫项目', 'active'),
    ('immuno.cardiac.st2', 'ST2', 'immuno.cardiac', 'item', 80, '免疫项目', 'active'),
    ('immuno.cardiac.hs_ctnt', 'hs-cTnT', 'immuno.cardiac', 'item', 90, '免疫项目', 'active'),
    ('immuno.cardiac.d_dimer', 'D-Dimer', 'immuno.cardiac', 'item', 100, '免疫项目', 'active'),
    ('immuno.infectious', '传染病', 'immuno', 'category', 50, '免疫项目', 'active'),
    ('immuno.infectious.hbsag', 'HBsAg', 'immuno.infectious', 'item', 10, '免疫项目', 'active'),
    ('immuno.infectious.anti_hbs', 'Anti-HBs', 'immuno.infectious', 'item', 20, '免疫项目', 'active'),
    ('immuno.infectious.hbeag', 'HBeAg', 'immuno.infectious', 'item', 30, '免疫项目', 'active'),
    ('immuno.infectious.hbeag_q', 'HBeAg Q', 'immuno.infectious', 'item', 40, '免疫项目', 'active'),
    ('immuno.infectious.anti_hbe', 'Anti-HBe', 'immuno.infectious', 'item', 50, '免疫项目', 'active'),
    ('immuno.infectious.anti_hbe_q', 'Anti-HBe Q', 'immuno.infectious', 'item', 60, '免疫项目', 'active'),
    ('immuno.infectious.anti_hbc', 'Anti-HBc', 'immuno.infectious', 'item', 70, '免疫项目', 'active'),
    ('immuno.infectious.anti_hbc_q', 'Anti-HBc Q', 'immuno.infectious', 'item', 80, '免疫项目', 'active'),
    ('immuno.infectious.anti_hcv', 'Anti-HCV', 'immuno.infectious', 'item', 90, '免疫项目', 'active'),
    ('immuno.infectious.anti_tp', 'Anti-TP', 'immuno.infectious', 'item', 100, '免疫项目', 'active'),
    ('immuno.infectious.hiv', 'HIV', 'immuno.infectious', 'item', 110, '免疫项目', 'active'),
    ('immuno.infectious.anti_hbc_igm', 'Anti-HBc IgM', 'immuno.infectious', 'item', 120, '免疫项目', 'active'),
    ('immuno.infectious.hav_igm', 'HAV IgM', 'immuno.infectious', 'item', 130, '免疫项目', 'active'),
    ('immuno.infectious.anti_hav', 'Anti-HAV', 'immuno.infectious', 'item', 140, '免疫项目', 'active'),
    ('immuno.infectious.hev_igm', 'HEV IgM', 'immuno.infectious', 'item', 150, '免疫项目', 'active'),
    ('immuno.infectious.hev_igg', 'HEV IgG', 'immuno.infectious', 'item', 160, '免疫项目', 'active'),
    ('immuno.torch', 'TORCH', 'immuno', 'category', 60, '免疫项目', 'active'),
    ('immuno.torch.toxo_igg', 'Toxo IgG', 'immuno.torch', 'item', 10, '免疫项目', 'active'),
    ('immuno.torch.toxo_igm', 'Toxo IgM', 'immuno.torch', 'item', 20, '免疫项目', 'active'),
    ('immuno.torch.rv_igg', 'RV IgG', 'immuno.torch', 'item', 30, '免疫项目', 'active'),
    ('immuno.torch.rv_igm', 'RV IgM', 'immuno.torch', 'item', 40, '免疫项目', 'active'),
    ('immuno.torch.cmv_igg', 'CMV IgG', 'immuno.torch', 'item', 50, '免疫项目', 'active'),
    ('immuno.torch.cmv_igm', 'CMV IgM', 'immuno.torch', 'item', 60, '免疫项目', 'active'),
    ('immuno.torch.hsv_1_igg', 'HSV-1 IgG', 'immuno.torch', 'item', 70, '免疫项目', 'active'),
    ('immuno.torch.hsv_2_igg', 'HSV-2 IgG', 'immuno.torch', 'item', 80, '免疫项目', 'active'),
    ('immuno.torch.hsv_1_plus_2_igg', 'HSV-1+2 IgG', 'immuno.torch', 'item', 90, '免疫项目', 'active'),
    ('immuno.torch.hsv_1_plus_2_igm', 'HSV-1+2 IgM', 'immuno.torch', 'item', 100, '免疫项目', 'active'),
    ('immuno.allergy', '过敏', 'immuno', 'category', 70, '免疫项目', 'active'),
    ('immuno.allergy.ige', 'IGE', 'immuno.allergy', 'item', 10, '免疫项目', 'active'),
    ('immuno.fibrosis', '肝纤', 'immuno', 'category', 80, '免疫项目', 'active'),
    ('immuno.fibrosis.piiinp', 'PIIINP', 'immuno.fibrosis', 'item', 10, '免疫项目', 'active'),
    ('immuno.fibrosis.civ', 'CIV', 'immuno.fibrosis', 'item', 20, '免疫项目', 'active'),
    ('immuno.fibrosis.ha', 'HA', 'immuno.fibrosis', 'item', 30, '免疫项目', 'active'),
    ('immuno.fibrosis.ln', 'LN', 'immuno.fibrosis', 'item', 40, '免疫项目', 'active'),
    ('immuno.anemia', '贫血', 'immuno', 'category', 90, '免疫项目', 'active'),
    ('immuno.anemia.folate', 'Folate', 'immuno.anemia', 'item', 10, '免疫项目', 'active'),
    ('immuno.anemia.vitb12', 'VitB12', 'immuno.anemia', 'item', 20, '免疫项目', 'active'),
    ('immuno.anemia.ferr', 'FERR', 'immuno.anemia', 'item', 30, '免疫项目', 'active'),
    ('immuno.diabetes', '糖尿病', 'immuno', 'category', 100, '免疫项目', 'active'),
    ('immuno.diabetes.c_peptide', 'C-Peptide', 'immuno.diabetes', 'item', 10, '免疫项目', 'active'),
    ('immuno.diabetes.insulin', 'Insulin', 'immuno.diabetes', 'item', 20, '免疫项目', 'active'),
    ('immuno.pct', 'PCT', 'immuno', 'category', 110, '免疫项目', 'active'),
    ('immuno.pct.pct', 'PCT', 'immuno.pct', 'item', 10, '免疫项目', 'active'),
    ('immuno.pct.il_6', 'IL-6', 'immuno.pct', 'item', 20, '免疫项目', 'active'),
    ('immuno.pct.scd14_st', 'sCD14-ST', 'immuno.pct', 'item', 30, '免疫项目', 'active'),
    ('immuno.bone', '骨代谢', 'immuno', 'category', 120, '免疫项目', 'active'),
    ('immuno.bone.vd', 'VD', 'immuno.bone', 'item', 10, '免疫项目', 'active'),
    ('immuno.bone.pth', 'PTH', 'immuno.bone', 'item', 20, '免疫项目', 'active'),
    ('immuno.bone.ct', 'CT', 'immuno.bone', 'item', 30, '免疫项目', 'active'),
    ('immuno.bone.tp1np', 'TP1NP', 'immuno.bone', 'item', 40, '免疫项目', 'active'),
    ('immuno.bone.oc', 'OC', 'immuno.bone', 'item', 50, '免疫项目', 'active'),
    ('immuno.bone.b_ctx', 'β-CTx', 'immuno.bone', 'item', 60, '免疫项目', 'active'),
    ('immuno.bone.renin', 'Renin', 'immuno.bone', 'item', 70, '免疫项目', 'active'),
    ('immuno.bone.ald', 'ALD', 'immuno.bone', 'item', 80, '免疫项目', 'active');

-- Self-referential FK on parent_code → code
ALTER TABLE assay_projects DROP CONSTRAINT IF EXISTS fk_assay_projects_parent;
ALTER TABLE assay_projects
    ADD CONSTRAINT fk_assay_projects_parent
    FOREIGN KEY (parent_code) REFERENCES assay_projects(code) ON DELETE CASCADE;

-- Collectable fields: assay composite block; retire flat archive string_array as primary catalog picks
ALTER TABLE collectable_fields
    DROP CONSTRAINT IF EXISTS collectable_fields_value_type_check;

ALTER TABLE collectable_fields
    ADD CONSTRAINT collectable_fields_value_type_check CHECK (
        value_type IN (
            'text', 'number', 'boolean', 'enum', 'date',
            'string_array', 'competitor_list', 'group', 'eqa_block', 'assay_block'
        )
    );

UPDATE collectable_fields
SET is_active = FALSE, updated_at = NOW()
WHERE code IN (
    'hospital.archive.mindrayProjects',
    'hospital.archive.newProjects'
);

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order, is_active)
VALUES
    ('assay.block', 'assay', 'assay.block', 'assay_block', '检测项目开展', '检测项目', '[]'::jsonb, '', 700, TRUE)
ON CONFLICT (code) DO UPDATE SET
    domain = 'assay',
    storage_target = 'assay.block',
    value_type = 'assay_block',
    label = '检测项目开展',
    section = '检测项目',
    is_active = TRUE,
    sort_order = 700,
    updated_at = NOW();

-- Best-effort clear free-text project lists from hospital archive (non-fatal shape)
UPDATE hospitals
SET archive = (archive - 'mindrayProjects' - 'newProjects' - 'missingProjects'),
    updated_at = NOW()
WHERE archive ?| ARRAY['mindrayProjects', 'newProjects', 'missingProjects'];

-- +goose Down
UPDATE hospitals
SET updated_at = NOW()
WHERE FALSE; -- no restore of wiped archive keys

DELETE FROM collectable_fields WHERE code = 'assay.block';

UPDATE collectable_fields
SET is_active = TRUE, updated_at = NOW()
WHERE code IN (
    'hospital.archive.mindrayProjects',
    'hospital.archive.newProjects'
);

ALTER TABLE collectable_fields
    DROP CONSTRAINT IF EXISTS collectable_fields_value_type_check;

ALTER TABLE collectable_fields
    ADD CONSTRAINT collectable_fields_value_type_check CHECK (
        value_type IN (
            'text', 'number', 'boolean', 'enum', 'date',
            'string_array', 'competitor_list', 'group', 'eqa_block'
        )
    );

ALTER TABLE assay_projects DROP CONSTRAINT IF EXISTS fk_assay_projects_parent;
DELETE FROM hospital_assays;
DELETE FROM assay_projects;
DROP INDEX IF EXISTS idx_assay_projects_kind;
DROP INDEX IF EXISTS idx_assay_projects_parent;
DROP INDEX IF EXISTS uq_assay_projects_code;
ALTER TABLE assay_projects DROP CONSTRAINT IF EXISTS assay_projects_kind_check;
ALTER TABLE assay_projects DROP COLUMN IF EXISTS sort_order;
ALTER TABLE assay_projects DROP COLUMN IF EXISTS kind;
ALTER TABLE assay_projects DROP COLUMN IF EXISTS parent_code;
ALTER TABLE assay_projects ADD CONSTRAINT uq_assay_projects_name UNIQUE (name);
