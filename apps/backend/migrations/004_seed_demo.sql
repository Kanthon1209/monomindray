-- ============================================================
-- Demo seed data for dashboard (idempotent-ish via ON CONFLICT)
-- Run after 003_create_business_tables.sql
-- ============================================================

-- Hospitals
INSERT INTO hospitals (name, province, city, district, level, type, status, address)
VALUES
  ('东城区人民医院', '北京市', '东城区', '', '三级甲等', '综合医院', 'active', ''),
  ('西城区中心医院', '北京市', '西城区', '', '三级甲等', '综合医院', 'active', ''),
  ('朝阳区第一人民医院', '北京市', '朝阳区', '', '三级乙等', '综合医院', 'active', ''),
  ('黄浦区人民医院', '上海市', '黄浦区', '', '三级甲等', '综合医院', 'active', ''),
  ('徐汇区中心医院', '上海市', '徐汇区', '', '三级甲等', '综合医院', 'active', ''),
  ('浦东新区第一人民医院', '上海市', '浦东新区', '', '三级甲等', '综合医院', 'active', ''),
  ('广州人民医院', '广东省', '广州', '', '三级甲等', '综合医院', 'active', ''),
  ('深圳中心医院', '广东省', '深圳', '', '三级甲等', '综合医院', 'active', ''),
  ('东莞第一人民医院', '广东省', '东莞', '', '二级甲等', '综合医院', 'pending', ''),
  ('佛山中医院', '广东省', '佛山', '', '二级甲等', '中医医院', 'active', ''),
  ('南京人民医院', '江苏省', '南京', '', '三级甲等', '综合医院', 'active', ''),
  ('苏州中心医院', '江苏省', '苏州', '', '三级甲等', '综合医院', 'active', ''),
  ('杭州人民医院', '浙江省', '杭州', '', '三级甲等', '综合医院', 'active', ''),
  ('宁波中心医院', '浙江省', '宁波', '', '三级甲等', '综合医院', 'active', ''),
  ('济南人民医院', '山东省', '济南', '', '三级甲等', '综合医院', 'active', ''),
  ('青岛中心医院', '山东省', '青岛', '', '三级甲等', '综合医院', 'active', ''),
  ('成都人民医院', '四川省', '成都', '', '三级甲等', '综合医院', 'active', ''),
  ('绵阳中心医院', '四川省', '绵阳', '', '三级乙等', '综合医院', 'active', ''),
  ('郑州人民医院', '河南省', '郑州', '', '三级甲等', '综合医院', 'active', ''),
  ('武汉人民医院', '湖北省', '武汉', '', '三级甲等', '综合医院', 'active', ''),
  ('长沙人民医院', '湖南省', '长沙', '', '三级甲等', '综合医院', 'active', ''),
  ('福州人民医院', '福建省', '福州', '', '三级甲等', '综合医院', 'active', ''),
  ('厦门中心医院', '福建省', '厦门', '', '三级甲等', '综合医院', 'active', ''),
  ('合肥人民医院', '安徽省', '合肥', '', '三级甲等', '综合医院', 'active', ''),
  ('南昌人民医院', '江西省', '南昌', '', '三级甲等', '综合医院', 'active', ''),
  ('沈阳人民医院', '辽宁省', '沈阳', '', '三级甲等', '综合医院', 'active', ''),
  ('大连中心医院', '辽宁省', '大连', '', '三级甲等', '综合医院', 'active', ''),
  ('西安人民医院', '陕西省', '西安', '', '三级甲等', '综合医院', 'active', ''),
  ('渝中区人民医院', '重庆市', '渝中区', '', '三级甲等', '综合医院', 'active', ''),
  ('石家庄人民医院', '河北省', '石家庄', '', '三级甲等', '综合医院', 'active', ''),
  ('太原人民医院', '山西省', '太原', '', '三级甲等', '综合医院', 'active', ''),
  ('昆明人民医院', '云南省', '昆明', '', '三级甲等', '综合医院', 'active', ''),
  ('南宁人民医院', '广西壮族自治区', '南宁', '', '三级甲等', '综合医院', 'active', '')
ON CONFLICT (name, province, city) DO NOTHING;

-- Devices (only if hospital has none yet)
INSERT INTO devices (hospital_id, category, model, serial_no, status)
SELECT h.id, v.category, v.model, v.serial_no, 'active'
FROM hospitals h
JOIN (VALUES
  ('东城区人民医院', '北京市', 'biochem', 'BS-2000M', 'SN-BJ-001'),
  ('东城区人民医院', '北京市', 'immuno', 'CL-8000', 'SN-BJ-002'),
  ('东城区人民医院', '北京市', 'hematology', 'BC-7500', 'SN-BJ-003'),
  ('西城区中心医院', '北京市', 'biochem', 'BS-2200', 'SN-BJ-011'),
  ('西城区中心医院', '北京市', 'immuno', 'CL-6000', 'SN-BJ-012'),
  ('黄浦区人民医院', '上海市', 'biochem', 'BS-2000M', 'SN-SH-001'),
  ('黄浦区人民医院', '上海市', 'immuno', 'CL-8000', 'SN-SH-002'),
  ('徐汇区中心医院', '上海市', 'biochem', 'BS-2000M', 'SN-SH-011'),
  ('徐汇区中心医院', '上海市', 'hematology', 'BC-7500', 'SN-SH-012'),
  ('广州人民医院', '广东省', 'biochem', 'BS-2000M', 'SN-GD-001'),
  ('广州人民医院', '广东省', 'immuno', 'CL-8000', 'SN-GD-002'),
  ('深圳中心医院', '广东省', 'biochem', 'BS-2000M', 'SN-GD-011'),
  ('深圳中心医院', '广东省', 'immuno', 'CL-8000', 'SN-GD-012'),
  ('深圳中心医院', '广东省', 'hematology', 'BC-6800', 'SN-GD-013'),
  ('南京人民医院', '江苏省', 'biochem', 'BS-2000M', 'SN-JS-001'),
  ('杭州人民医院', '浙江省', 'immuno', 'CL-8000', 'SN-ZJ-001'),
  ('济南人民医院', '山东省', 'biochem', 'BS-2000M', 'SN-SD-001'),
  ('青岛中心医院', '山东省', 'hematology', 'BC-7500', 'SN-SD-011'),
  ('成都人民医院', '四川省', 'biochem', 'BS-2000M', 'SN-SC-001'),
  ('武汉人民医院', '湖北省', 'immuno', 'CL-8000', 'SN-HB-001'),
  ('武汉人民医院', '湖北省', 'biochem', 'BS-2200', 'SN-HB-002'),
  ('西安人民医院', '陕西省', 'biochem', 'BS-2000M', 'SN-SX-001'),
  ('沈阳人民医院', '辽宁省', 'hematology', 'BC-7500', 'SN-LN-001')
) AS v(name, province, category, model, serial_no)
  ON h.name = v.name AND h.province = v.province
WHERE NOT EXISTS (
  SELECT 1 FROM devices d WHERE d.hospital_id = h.id AND d.serial_no = v.serial_no
);

-- Customers
INSERT INTO customers (hospital_id, name, title, phone, email)
SELECT h.id, v.name, v.title, v.phone, v.email
FROM hospitals h
JOIN (VALUES
  ('广州人民医院', '广东省', '张明', '检验科主任', '13800001111', 'zhangming@example.com'),
  ('深圳中心医院', '广东省', '李华', '设备科长', '13800002222', 'lihua@example.com'),
  ('徐汇区中心医院', '上海市', '王芳', '采购主管', '13800003333', 'wangfang@example.com'),
  ('武汉人民医院', '湖北省', '赵强', '检验科副主任', '13800004444', 'zhaoqiang@example.com'),
  ('成都人民医院', '四川省', '陈静', '实验室负责人', '13800005555', 'chenjing@example.com')
) AS v(hname, province, name, title, phone, email)
  ON h.name = v.hname AND h.province = v.province
WHERE NOT EXISTS (
  SELECT 1 FROM customers c WHERE c.name = v.name AND c.phone = v.phone
);

-- Cases
INSERT INTO cases (hospital_id, title, summary, content, status)
SELECT h.id, v.title, v.summary, v.content, v.status
FROM hospitals h
JOIN (VALUES
  ('广州人民医院', '广东省', 'BS-2000M 提升急诊生化周转', '急诊通道周转时间下降 35%', '通过优化试剂装载与急诊优先策略，显著缩短 TAT。', 'approved'),
  ('深圳中心医院', '广东省', 'CL-8000 免疫流水线案例', '日均标本量提升至 3200', '与 LIS 联动后，高峰时段积压明显缓解。', 'submitted'),
  ('武汉人民医院', '湖北省', 'BC-系列血液分析质控实践', '室内质控 CV 下降', '统一定标流程后，跨班次结果一致性提升。', 'approved'),
  ('徐汇区中心医院', '上海市', '多机型联机运维经验', '减少非计划停机', '建立巡检与备件清单后，月均宕机次数减半。', 'draft')
) AS v(hname, province, title, summary, content, status)
  ON h.name = v.hname AND h.province = v.province
WHERE NOT EXISTS (
  SELECT 1 FROM cases c WHERE c.title = v.title AND c.hospital_id = h.id
);
