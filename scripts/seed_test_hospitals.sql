-- Idempotent demo seed: hospitals/devices prefixed 测试- for dashboard 套餐 filter + map demos.
-- Safe to re-run: deletes prior 测试-% hospitals (CASCADE devices / device_assay_items / hospital_assays).
-- Coverage is written via devices → device_assay_items → hospital_assays (device_id set).

BEGIN;

DELETE FROM hospitals WHERE name LIKE '测试-%';

INSERT INTO hospitals (
  name, province, city, district, level, type, status, address, remark, region, branch_office
) VALUES
  ('测试-合肥示范医院',   '安徽省', '合肥市',   '', '三级甲等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', ''),
  ('测试-合肥东区医院',   '安徽省', '合肥市',   '', '三级乙等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', ''),
  ('测试-芜湖示范医院',   '安徽省', '芜湖市',   '', '三级甲等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', ''),
  ('测试-蚌埠示范医院',   '安徽省', '蚌埠市',   '', '三级甲等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', ''),
  ('测试-安庆示范医院',   '安徽省', '安庆市',   '', '三级甲等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', ''),
  ('测试-阜阳示范医院',   '安徽省', '阜阳市',   '', '三级甲等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', ''),
  ('测试-黄山示范医院',   '安徽省', '黄山市',   '', '三级乙等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', ''),
  ('测试-马鞍山示范医院', '安徽省', '马鞍山市', '', '三级甲等', '综合医院', 'active', '', 'demo seed 测试医院', '华东', '');

-- Devices: model = 测试-xxx so they are easy to spot; variety of assay lines / packages.
INSERT INTO devices (
  hospital_id, brand, category, assay_line_code, model, serial_no, status, remark, service_evaluation
)
SELECT h.id, v.brand, v.category, v.assay_line_code, v.model, v.serial_no, 'active', 'demo seed 测试设备', v.service_evaluation
FROM hospitals h
JOIN (VALUES
  -- 合肥示范: 生化肝功 + 肾功
  ('测试-合肥示范医院',   '迈瑞', 'biochem',    'biochem', '测试-BS-2000M-合肥01',  'TEST-HF-BIO-01', '客户关系良好, 口碑优于竞品'),
  ('测试-合肥示范医院',   '迈瑞', 'biochem',    'biochem', '测试-BS-2200-合肥02',   'TEST-HF-BIO-02', '负责区域一年以上'),
  -- 合肥东区: 仅肝功（同城加深地图）
  ('测试-合肥东区医院',   '迈瑞', 'biochem',    'biochem', '测试-BS-800-合肥东01',  'TEST-HFD-BIO-01', '新人 有资质'),
  -- 芜湖: 血脂 + 免疫肿标
  ('测试-芜湖示范医院',   '迈瑞', 'biochem',    'biochem', '测试-BS-2000M-芜湖01',  'TEST-WH-BIO-01',  '无专人负责'),
  ('测试-芜湖示范医院',   '迈瑞', 'immuno',     'immuno',  '测试-CL-8000-芜湖01',   'TEST-WH-IMM-01',  '负责区域一年以上'),
  -- 蚌埠: 甲功 + 心肌
  ('测试-蚌埠示范医院',   '迈瑞', 'immuno',     'immuno',  '测试-CL-6000-蚌埠01',   'TEST-BB-IMM-01',  '客户关系良好, 口碑优于竞品'),
  ('测试-蚌埠示范医院',   '罗氏', 'immuno',     'immuno',  '测试-e601-蚌埠02',      'TEST-BB-IMM-02',  '新人 有资质'),
  -- 安庆: 凝血四项 + 血常规
  ('测试-安庆示范医院',   '迈瑞', 'coag',       'coag',    '测试-C2000-安庆01',     'TEST-AQ-COAG-01', '负责区域一年以上'),
  ('测试-安庆示范医院',   '迈瑞', 'hematology', 'heme',    '测试-BC-7500-安庆01',   'TEST-AQ-HEME-01', '客户关系良好, 口碑优于竞品'),
  -- 阜阳: 糖代谢 + 传染病
  ('测试-阜阳示范医院',   '迈瑞', 'biochem',    'biochem', '测试-BS-2000M-阜阳01',  'TEST-FY-BIO-01',  '无专人负责'),
  ('测试-阜阳示范医院',   '迈瑞', 'immuno',     'immuno',  '测试-CL-8000-阜阳01',   'TEST-FY-IMM-01',  '负责区域一年以上'),
  -- 黄山: 仅肝功
  ('测试-黄山示范医院',   '迈瑞', 'biochem',    'biochem', '测试-BS-480-黄山01',    'TEST-HS-BIO-01',  '新人 有资质'),
  -- 马鞍山: 激素 + 血常规
  ('测试-马鞍山示范医院', '迈瑞', 'immuno',     'immuno',  '测试-CL-6000-马鞍山01', 'TEST-MAS-IMM-01', '客户关系良好, 口碑优于竞品'),
  ('测试-马鞍山示范医院', '迈瑞', 'hematology', 'heme',    '测试-BC-6800-马鞍山01', 'TEST-MAS-HEME-01','负责区域一年以上')
) AS v(hname, brand, category, assay_line_code, model, serial_no, service_evaluation)
  ON h.name = v.hname AND h.province = '安徽省';

-- Leaf coverage per device (套餐 = parent category of these items)
WITH coverage(serial_no, item_code) AS (
  VALUES
    -- 合肥示范 BS-2000M: 肝功类
    ('TEST-HF-BIO-01', 'biochem.liver.alt'),
    ('TEST-HF-BIO-01', 'biochem.liver.ast'),
    ('TEST-HF-BIO-01', 'biochem.liver.alp'),
    ('TEST-HF-BIO-01', 'biochem.liver.tp'),
    ('TEST-HF-BIO-01', 'biochem.liver.alb'),
    -- 合肥示范 BS-2200: 肾功类
    ('TEST-HF-BIO-02', 'biochem.kidney.crea_s'),
    ('TEST-HF-BIO-02', 'biochem.kidney.ua'),
    ('TEST-HF-BIO-02', 'biochem.kidney.urea'),
    ('TEST-HF-BIO-02', 'biochem.kidney.cysc'),
    -- 合肥东区: 肝功类
    ('TEST-HFD-BIO-01', 'biochem.liver.alt'),
    ('TEST-HFD-BIO-01', 'biochem.liver.ast'),
    ('TEST-HFD-BIO-01', 'biochem.liver.g_gt'),
    -- 芜湖生化: 血脂类
    ('TEST-WH-BIO-01', 'biochem.lipid.tc'),
    ('TEST-WH-BIO-01', 'biochem.lipid.tg'),
    ('TEST-WH-BIO-01', 'biochem.lipid.hdl_c'),
    ('TEST-WH-BIO-01', 'biochem.lipid.ldl_c'),
    -- 芜湖免疫: 肿标
    ('TEST-WH-IMM-01', 'immuno.tumor.afp'),
    ('TEST-WH-IMM-01', 'immuno.tumor.cea'),
    ('TEST-WH-IMM-01', 'immuno.tumor.ca125'),
    -- 蚌埠迈瑞: 甲功
    ('TEST-BB-IMM-01', 'immuno.thyroid.tsh'),
    ('TEST-BB-IMM-01', 'immuno.thyroid.ft3'),
    ('TEST-BB-IMM-01', 'immuno.thyroid.ft4'),
    -- 蚌埠竞品: 心肌
    ('TEST-BB-IMM-02', 'immuno.cardiac.hs_ctni'),
    ('TEST-BB-IMM-02', 'immuno.cardiac.ck_mb'),
    ('TEST-BB-IMM-02', 'immuno.cardiac.myoglobin_myo'),
    -- 安庆凝血: 凝血四项
    ('TEST-AQ-COAG-01', 'coag.four.aptt'),
    ('TEST-AQ-COAG-01', 'coag.four.pt'),
    ('TEST-AQ-COAG-01', 'coag.four.tt'),
    ('TEST-AQ-COAG-01', 'coag.four.fib'),
    -- 安庆血球: 血常规
    ('TEST-AQ-HEME-01', 'heme.cbc.wbc'),
    ('TEST-AQ-HEME-01', 'heme.cbc.rbc'),
    ('TEST-AQ-HEME-01', 'heme.cbc.hgb'),
    ('TEST-AQ-HEME-01', 'heme.cbc.plt'),
    -- 阜阳生化: 糖代谢
    ('TEST-FY-BIO-01', 'biochem.glucose.glu_o'),
    ('TEST-FY-BIO-01', 'biochem.glucose.hba1c'),
    -- 阜阳免疫: 传染病
    ('TEST-FY-IMM-01', 'immuno.infectious.hbsag'),
    ('TEST-FY-IMM-01', 'immuno.infectious.anti_hbs'),
    ('TEST-FY-IMM-01', 'immuno.infectious.anti_hcv'),
    -- 黄山: 肝功类
    ('TEST-HS-BIO-01', 'biochem.liver.alt'),
    ('TEST-HS-BIO-01', 'biochem.liver.ast'),
    ('TEST-HS-BIO-01', 'biochem.liver.tba'),
    -- 马鞍山免疫: 激素
    ('TEST-MAS-IMM-01', 'immuno.hormone.e2'),
    ('TEST-MAS-IMM-01', 'immuno.hormone.lh'),
    ('TEST-MAS-IMM-01', 'immuno.hormone.fsh'),
    -- 马鞍山血球: 血常规
    ('TEST-MAS-HEME-01', 'heme.cbc.wbc'),
    ('TEST-MAS-HEME-01', 'heme.cbc.hgb'),
    ('TEST-MAS-HEME-01', 'heme.cbc.plt')
)
INSERT INTO device_assay_items (device_id, assay_project_id)
SELECT d.id, ap.id
FROM coverage c
JOIN devices d ON d.serial_no = c.serial_no
JOIN hospitals h ON h.id = d.hospital_id AND h.name LIKE '测试-%'
JOIN assay_projects ap ON ap.code = c.item_code AND ap.kind = 'item' AND ap.status = 'active'
ON CONFLICT DO NOTHING;

-- Mirror SyncHospitalAssaysFromDevices for these hospitals
INSERT INTO hospital_assays (
  hospital_id, assay_project_id, project_name, source, brand, instrument, device_id, flags
)
SELECT
  d.hospital_id,
  ap.id,
  ap.name,
  CASE WHEN COALESCE(NULLIF(TRIM(d.brand), ''), '迈瑞') = '迈瑞' THEN 'own' ELSE 'competitor' END,
  COALESCE(NULLIF(TRIM(d.brand), ''), '迈瑞'),
  '',
  d.id,
  '{}'::text[]
FROM devices d
JOIN hospitals h ON h.id = d.hospital_id AND h.name LIKE '测试-%'
JOIN device_assay_items dai ON dai.device_id = d.id
JOIN assay_projects ap ON ap.id = dai.assay_project_id AND ap.kind = 'item';

COMMIT;

-- Summary
SELECT 'hospitals' AS kind, COUNT(*)::int AS n FROM hospitals WHERE name LIKE '测试-%'
UNION ALL
SELECT 'devices', COUNT(*)::int FROM devices d JOIN hospitals h ON h.id = d.hospital_id WHERE h.name LIKE '测试-%'
UNION ALL
SELECT 'device_assay_items', COUNT(*)::int
  FROM device_assay_items dai
  JOIN devices d ON d.id = dai.device_id
  JOIN hospitals h ON h.id = d.hospital_id
  WHERE h.name LIKE '测试-%'
UNION ALL
SELECT 'hospital_assays', COUNT(*)::int
  FROM hospital_assays ha
  JOIN hospitals h ON h.id = ha.hospital_id
  WHERE h.name LIKE '测试-%';

SELECT h.name, h.city, h.region, d.model, d.brand, d.assay_line_code,
       (SELECT COUNT(*) FROM device_assay_items dai WHERE dai.device_id = d.id) AS items
FROM hospitals h
JOIN devices d ON d.hospital_id = h.id
WHERE h.name LIKE '测试-%'
ORDER BY h.city, h.name, d.model;
