-- +goose Up
-- Mark collector tasks completed on survey approve without deleting assignment/submission rows.

ALTER TABLE survey_assignments
    DROP CONSTRAINT IF EXISTS survey_assignments_status_check;
ALTER TABLE survey_assignments
    ADD CONSTRAINT survey_assignments_status_check CHECK (
        status::text = ANY (ARRAY[
            'todo'::text,
            'in_progress'::text,
            'submitted'::text,
            'rejected'::text,
            'cancelled'::text,
            'approved'::text
        ])
    );

-- +goose Down
UPDATE survey_assignments SET status = 'submitted' WHERE status = 'approved';
ALTER TABLE survey_assignments
    DROP CONSTRAINT IF EXISTS survey_assignments_status_check;
ALTER TABLE survey_assignments
    ADD CONSTRAINT survey_assignments_status_check CHECK (
        status::text = ANY (ARRAY[
            'todo'::text,
            'in_progress'::text,
            'submitted'::text,
            'rejected'::text,
            'cancelled'::text
        ])
    );
