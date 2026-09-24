-- +goose Up
DROP TABLE IF EXISTS cases;

-- +goose Down
-- Recreate is intentionally omitted; restore from backup if needed.
SELECT 1;
