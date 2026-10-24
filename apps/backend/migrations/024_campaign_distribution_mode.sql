-- +goose Up
-- Mode hospital: assign collector × hospitals (locked hospital).
-- Mode collector_open: assign collectors only; collector picks hospital via search; multi-fill via new assignments after submit.

ALTER TABLE survey_campaigns
    ADD COLUMN IF NOT EXISTS distribution_mode VARCHAR(32) NOT NULL DEFAULT 'hospital';

ALTER TABLE survey_campaigns
    DROP CONSTRAINT IF EXISTS survey_campaigns_distribution_mode_check;

ALTER TABLE survey_campaigns
    ADD CONSTRAINT survey_campaigns_distribution_mode_check
    CHECK (distribution_mode IN ('hospital', 'collector_open'));

COMMENT ON COLUMN survey_campaigns.distribution_mode IS
    'hospital = pin hospitals on assignments; collector_open = assignee picks hospital per fill, can repeat.';

-- +goose Down
ALTER TABLE survey_campaigns DROP CONSTRAINT IF EXISTS survey_campaigns_distribution_mode_check;
ALTER TABLE survey_campaigns DROP COLUMN IF EXISTS distribution_mode;
