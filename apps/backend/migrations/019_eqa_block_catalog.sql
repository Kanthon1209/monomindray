-- +goose Up
-- EQA composite block catalog support + hide flat year/scope crumbs.

ALTER TABLE collectable_fields
    DROP CONSTRAINT IF EXISTS collectable_fields_value_type_check;

ALTER TABLE collectable_fields
    ADD CONSTRAINT collectable_fields_value_type_check CHECK (
        value_type IN (
            'text', 'number', 'boolean', 'enum', 'date',
            'string_array', 'competitor_list', 'group', 'eqa_block'
        )
    );

UPDATE collectable_fields
SET is_active = FALSE, updated_at = NOW()
WHERE domain = 'eqa'
  AND code IN ('eqa.year', 'eqa.scope');

INSERT INTO collectable_fields
    (code, domain, storage_target, value_type, label, section, enum_values, options_source, sort_order, is_active)
VALUES
    ('eqa.block', 'eqa', 'eqa.block', 'eqa_block', '室间质评参评', '室间质评', '[]'::jsonb, '', 910, TRUE)
ON CONFLICT (code) DO UPDATE SET
    domain = 'eqa',
    storage_target = 'eqa.block',
    value_type = 'eqa_block',
    label = '室间质评参评',
    section = '室间质评',
    is_active = TRUE,
    sort_order = 910,
    updated_at = NOW();

-- +goose Down
DELETE FROM collectable_fields WHERE code = 'eqa.block';

UPDATE collectable_fields
SET is_active = TRUE, updated_at = NOW()
WHERE domain = 'eqa'
  AND code IN ('eqa.year', 'eqa.scope');

ALTER TABLE collectable_fields
    DROP CONSTRAINT IF EXISTS collectable_fields_value_type_check;

ALTER TABLE collectable_fields
    ADD CONSTRAINT collectable_fields_value_type_check CHECK (
        value_type IN (
            'text', 'number', 'boolean', 'enum', 'date',
            'string_array', 'competitor_list', 'group'
        )
    );
