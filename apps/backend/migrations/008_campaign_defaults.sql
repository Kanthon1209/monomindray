-- +goose Up
-- Campaign prefill defaults and locked field keys for collector forms.

ALTER TABLE survey_campaigns
    ADD COLUMN IF NOT EXISTS defaults JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE survey_campaigns
    ADD COLUMN IF NOT EXISTS locked_keys JSONB NOT NULL DEFAULT '[]'::jsonb;

-- +goose Down
ALTER TABLE survey_campaigns DROP COLUMN IF EXISTS locked_keys;
ALTER TABLE survey_campaigns DROP COLUMN IF EXISTS defaults;
