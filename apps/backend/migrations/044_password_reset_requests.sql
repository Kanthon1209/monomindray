-- +goose Up
-- Admin-mediated password reset: user requests by email → admin approves →
-- one-time token link (copied manually, no email/SMS sending).

CREATE TABLE IF NOT EXISTS password_reset_requests (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email            VARCHAR(255) NOT NULL,
    status           VARCHAR(32)  NOT NULL DEFAULT 'pending',
    token_hash       VARCHAR(64),
    token_expires_at TIMESTAMPTZ,
    token_used_at    TIMESTAMPTZ,
    requested_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reviewed_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at      TIMESTAMPTZ,
    reject_reason    VARCHAR(512) NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT password_reset_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected', 'used', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_status_requested
    ON password_reset_requests (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_id
    ON password_reset_requests (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_requests_token_hash
    ON password_reset_requests (token_hash)
    WHERE token_hash IS NOT NULL;

-- At most one pending request per user (re-apply updates existing pending row).
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_requests_one_pending
    ON password_reset_requests (user_id)
    WHERE status = 'pending';

DROP TRIGGER IF EXISTS trigger_password_reset_requests_updated_at ON password_reset_requests;
CREATE TRIGGER trigger_password_reset_requests_updated_at
    BEFORE UPDATE ON password_reset_requests
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- +goose Down
DROP TABLE IF EXISTS password_reset_requests;
