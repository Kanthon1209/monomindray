-- +goose Up
-- Restore hospital.district (区县) to the collectable catalog.
-- Soft-deactivated by 032_slim_customer_fields; column / API / customer form
-- never removed. Templates that still bind hospital.district need it active.
UPDATE collectable_fields
SET is_active = TRUE,
    label = '区县',
    section = '医院主表',
    updated_at = NOW()
WHERE code = 'hospital.district'
   OR storage_target = 'hospital.district';

-- +goose Down
UPDATE collectable_fields
SET is_active = FALSE,
    updated_at = NOW()
WHERE code = 'hospital.district'
   OR storage_target = 'hospital.district';
