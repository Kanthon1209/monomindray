-- +goose Up
-- Device instance attrs: 试剂品牌 / 月样本量 / 科室负责人 / 渠道CSA
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS reagent_brand VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS monthly_sample_volume VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS dept_head VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS channel_csa VARCHAR(128) NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE devices
    DROP COLUMN IF EXISTS reagent_brand,
    DROP COLUMN IF EXISTS monthly_sample_volume,
    DROP COLUMN IF EXISTS dept_head,
    DROP COLUMN IF EXISTS channel_csa;
