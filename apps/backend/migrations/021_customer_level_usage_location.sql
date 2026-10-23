-- +goose Up
-- Mindray 视角客户等级 V1/V2/V3/非V；使用位置枚举；与医院等级(hospital.level)分离。

UPDATE collectable_fields
SET
    label = '客户等级',
    value_type = 'enum',
    enum_values = '["V1","V2","V3","非V"]'::jsonb,
    updated_at = NOW()
WHERE code = 'hospital.attributes.customer_level'
   OR storage_target = 'hospital.attributes.customer_level';

UPDATE collectable_fields
SET
    label = '使用位置',
    value_type = 'enum',
    enum_values = '["门急诊","住院部","体检中心","核医学科","其他"]'::jsonb,
    updated_at = NOW()
WHERE code = 'hospital.attributes.usage_location'
   OR storage_target = 'hospital.attributes.usage_location';

-- 清空不合新枚举的客户等级脏数据（如误塞的三甲/战略客户等）
DELETE FROM hospital_attributes
WHERE attr_key = 'customer_level'
  AND TRIM(attr_value) NOT IN ('V1', 'V2', 'V3', '非V');

-- 使用位置：不在新枚举内的清空（自由文本无法可靠映射）
DELETE FROM hospital_attributes
WHERE attr_key = 'usage_location'
  AND TRIM(attr_value) NOT IN ('门急诊', '住院部', '体检中心', '核医学科', '其他');

-- +goose Down
UPDATE collectable_fields
SET
    label = '客户等级',
    enum_values = '["战略客户","重点客户","普通客户","潜在客户"]'::jsonb,
    updated_at = NOW()
WHERE code = 'hospital.attributes.customer_level'
   OR storage_target = 'hospital.attributes.customer_level';

UPDATE collectable_fields
SET
    label = '使用地点',
    enum_values = '["中心实验室","急诊","ICU","门诊","其他"]'::jsonb,
    updated_at = NOW()
WHERE code = 'hospital.attributes.usage_location'
   OR storage_target = 'hospital.attributes.usage_location';
