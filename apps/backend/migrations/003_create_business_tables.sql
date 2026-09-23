-- +goose Up
-- ============================================================
-- Business domain tables for IVD dashboard data collection
-- Depends on: users (001/002)
-- ============================================================

-- ---------- hospitals（医院主数据，看板核心） ----------
CREATE TABLE IF NOT EXISTS hospitals (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    province        VARCHAR(64)  NOT NULL,  -- 与地图 GeoJSON 省份名一致，如「广东省」
    city            VARCHAR(64)  NOT NULL,
    district        VARCHAR(64)  NOT NULL DEFAULT '',
    level           VARCHAR(32)  NOT NULL,  -- 三级甲等 / 三级乙等 / 二级甲等 / 二级乙等 / 一级
    type            VARCHAR(32)  NOT NULL,  -- 综合医院 / 专科医院 / 中医医院 / 妇幼保健院
    status          VARCHAR(32)  NOT NULL DEFAULT 'pending',
    address         VARCHAR(255) NOT NULL DEFAULT '',
    remark          TEXT         NOT NULL DEFAULT '',
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT hospitals_status_check CHECK (status IN ('active', 'pending', 'inactive')),
    CONSTRAINT hospitals_level_check CHECK (level IN (
        '三级甲等', '三级乙等', '二级甲等', '二级乙等', '一级'
    )),
    CONSTRAINT hospitals_type_check CHECK (type IN (
        '综合医院', '专科医院', '中医医院', '妇幼保健院'
    ))
);

CREATE INDEX IF NOT EXISTS idx_hospitals_province ON hospitals (province);
CREATE INDEX IF NOT EXISTS idx_hospitals_city ON hospitals (city);
CREATE INDEX IF NOT EXISTS idx_hospitals_level ON hospitals (level);
CREATE INDEX IF NOT EXISTS idx_hospitals_type ON hospitals (type);
CREATE INDEX IF NOT EXISTS idx_hospitals_status ON hospitals (status);
CREATE INDEX IF NOT EXISTS idx_hospitals_created_by ON hospitals (created_by);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hospitals_name_city
    ON hospitals (name, province, city);

DROP TRIGGER IF EXISTS trigger_hospitals_updated_at ON hospitals;
CREATE TRIGGER trigger_hospitals_updated_at
    BEFORE UPDATE ON hospitals
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- ---------- devices（医院下的 IVD 设备） ----------
CREATE TABLE IF NOT EXISTS devices (
    id              BIGSERIAL PRIMARY KEY,
    hospital_id     BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    category        VARCHAR(32)  NOT NULL,  -- biochem / immuno / hematology / coag / urine
    model           VARCHAR(64)  NOT NULL,  -- BS-2000M / CL-8000 / ...
    serial_no       VARCHAR(128) NOT NULL DEFAULT '',
    status          VARCHAR(32)  NOT NULL DEFAULT 'active',
    installed_at    DATE,
    remark          TEXT         NOT NULL DEFAULT '',
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT devices_category_check CHECK (category IN (
        'biochem', 'immuno', 'hematology', 'coag', 'urine'
    )),
    CONSTRAINT devices_status_check CHECK (status IN ('active', 'inactive', 'maintenance'))
);

CREATE INDEX IF NOT EXISTS idx_devices_hospital_id ON devices (hospital_id);
CREATE INDEX IF NOT EXISTS idx_devices_category ON devices (category);
CREATE INDEX IF NOT EXISTS idx_devices_model ON devices (model);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);

DROP TRIGGER IF EXISTS trigger_devices_updated_at ON devices;
CREATE TRIGGER trigger_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- ---------- customers（客户，挂靠医院，供客户管理页） ----------
CREATE TABLE IF NOT EXISTS customers (
    id              BIGSERIAL PRIMARY KEY,
    hospital_id     BIGINT       REFERENCES hospitals(id) ON DELETE SET NULL,
    name            VARCHAR(64)  NOT NULL,
    title           VARCHAR(64)  NOT NULL DEFAULT '',  -- 科室/职务
    phone           VARCHAR(32)  NOT NULL DEFAULT '',
    email           VARCHAR(255) NOT NULL DEFAULT '',
    remark          TEXT         NOT NULL DEFAULT '',
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_hospital_id ON customers (hospital_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);

DROP TRIGGER IF EXISTS trigger_customers_updated_at ON customers;
CREATE TRIGGER trigger_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- ---------- cases（案例维护：产品应用价值案例） ----------
CREATE TABLE IF NOT EXISTS cases (
    id              BIGSERIAL PRIMARY KEY,
    hospital_id     BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
    device_id       BIGINT       REFERENCES devices(id) ON DELETE SET NULL,
    title           VARCHAR(200) NOT NULL,
    summary         TEXT         NOT NULL DEFAULT '',
    content         TEXT         NOT NULL DEFAULT '',
    status          VARCHAR(32)  NOT NULL DEFAULT 'draft',
    collected_by    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    collected_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    updated_by      BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT cases_status_check CHECK (status IN (
        'draft', 'submitted', 'approved', 'rejected'
    ))
);

CREATE INDEX IF NOT EXISTS idx_cases_hospital_id ON cases (hospital_id);
CREATE INDEX IF NOT EXISTS idx_cases_device_id ON cases (device_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_collected_by ON cases (collected_by);
CREATE INDEX IF NOT EXISTS idx_cases_collected_at ON cases (collected_at);

DROP TRIGGER IF EXISTS trigger_cases_updated_at ON cases;
CREATE TRIGGER trigger_cases_updated_at
    BEFORE UPDATE ON cases
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- ---------- 看板常用视图：医院 + 设备数量 / 型号聚合 ----------
CREATE OR REPLACE VIEW v_hospital_dashboard AS
SELECT
    h.id,
    h.name,
    h.province,
    h.city,
    h.district,
    h.level,
    h.type,
    h.status,
    h.address,
    COALESCE(d.device_count, 0)::INT AS device_count,
    COALESCE(d.device_models, ARRAY[]::TEXT[]) AS device_models,
    h.created_by,
    h.created_at,
    h.updated_at
FROM hospitals h
LEFT JOIN LATERAL (
    SELECT
        COUNT(*)::INT AS device_count,
        ARRAY_AGG(DISTINCT model ORDER BY model) FILTER (WHERE model IS NOT NULL AND model <> '') AS device_models
    FROM devices
    WHERE hospital_id = h.id AND status = 'active'
) d ON TRUE;

-- +goose Down
-- Historical migration: prefer forward fixes over automatic rollback.
SELECT 1;
