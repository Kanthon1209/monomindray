-- +goose Up
-- Before-image of published hospital / device / EQA / assay state, captured
-- when an admin approves a submission so a later 撤销 can roll that data back.

ALTER TABLE survey_submissions
    ADD COLUMN IF NOT EXISTS approval_snapshot JSONB;

COMMENT ON COLUMN survey_submissions.approval_snapshot IS
    'Before-image captured on approve (previous hospital, created flag, and hospital/device/EQA/assay state). NULL for approvals made before this column existed.';

-- +goose Down
ALTER TABLE survey_submissions
    DROP COLUMN IF EXISTS approval_snapshot;
