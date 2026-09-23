-- +goose Up
-- Add approval status for existing databases created before status column existed.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'pending';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users
    ADD CONSTRAINT users_status_check CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- Existing admins and previously created accounts become approved.
UPDATE users SET status = 'approved' WHERE role = 'admin' OR status IS NULL OR status = '';
UPDATE users SET status = 'approved' WHERE email = 'admin@mindray.com';

-- +goose Down
-- Historical migration: prefer forward fixes over automatic rollback.
SELECT 1;
