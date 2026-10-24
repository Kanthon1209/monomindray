-- +goose Up
-- Drop year-prefixed wording for dual_major (xlsx column was 「26年是否双大」;
-- UI / catalog label should be plain 「双大客户」, storage key unchanged).
UPDATE collectable_fields
SET label = '双大客户',
    updated_at = NOW()
WHERE code = 'hospital.attributes.dual_major'
   OR storage_target = 'hospital.attributes.dual_major';

-- +goose Down
UPDATE collectable_fields
SET label = '26年是否双大',
    updated_at = NOW()
WHERE code = 'hospital.attributes.dual_major'
   OR storage_target = 'hospital.attributes.dual_major';
