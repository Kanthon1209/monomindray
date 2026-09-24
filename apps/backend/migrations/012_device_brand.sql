-- +goose Up
-- Brand distinguishes Mindray vs competitor installs in the same devices table.

ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS brand VARCHAR(128) NOT NULL DEFAULT '迈瑞';

CREATE INDEX IF NOT EXISTS idx_devices_brand ON devices (brand);

COMMENT ON COLUMN devices.brand IS '装机品牌：迈瑞或竞品品牌（罗氏/雅培/西门子等）';

-- +goose Down
DROP INDEX IF EXISTS idx_devices_brand;
ALTER TABLE devices DROP COLUMN IF EXISTS brand;
