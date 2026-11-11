-- +goose Up
-- Snapshot the collector's submitted answers the first time an admin edits them
-- during review. original_answers stays NULL until that first admin save/approve
-- with edits so the collector version is not overwritten.

ALTER TABLE survey_submissions
    ADD COLUMN IF NOT EXISTS original_answers JSONB;

COMMENT ON COLUMN survey_submissions.original_answers IS
    'Collector-submitted answers snapshotted on the first admin edit during review; NULL if never edited by an admin.';

-- +goose Down
ALTER TABLE survey_submissions
    DROP COLUMN IF EXISTS original_answers;
