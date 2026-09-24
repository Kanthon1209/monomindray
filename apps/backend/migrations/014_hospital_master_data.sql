-- +goose Up
-- Generic hospital master data: columns, attributes, assays, supplies, staff, metrics.

-- ---------- hospitals: stable org columns ----------
ALTER TABLE hospitals
    ADD COLUMN IF NOT EXISTS customer_code VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS region VARCHAR(64) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS branch_office VARCHAR(64) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_hospitals_customer_code ON hospitals (customer_code) WHERE customer_code <> '';
CREATE INDEX IF NOT EXISTS idx_hospitals_region ON hospitals (region) WHERE region <> '';
CREATE INDEX IF NOT EXISTS idx_hospitals_branch_office ON hospitals (branch_office) WHERE branch_office <> '';

-- Backfill from archive when present
UPDATE hospitals SET
    customer_code = COALESCE(NULLIF(TRIM(archive->>'customerCode'), ''), customer_code),
    region = COALESCE(NULLIF(TRIM(archive->>'region'), ''), region),
    branch_office = COALESCE(NULLIF(TRIM(archive->>'branchOffice'), ''), branch_office)
WHERE archive IS NOT NULL AND archive <> '{}'::jsonb;

-- ---------- hospital_attributes (extensible tags) ----------
CREATE TABLE IF NOT EXISTS hospital_attributes (
    id           BIGSERIAL PRIMARY KEY,
    hospital_id  BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    attr_key     VARCHAR(128) NOT NULL,
    attr_value   TEXT         NOT NULL DEFAULT '',
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hospital_attributes UNIQUE (hospital_id, attr_key)
);

CREATE INDEX IF NOT EXISTS idx_hospital_attributes_key ON hospital_attributes (attr_key);

COMMENT ON TABLE hospital_attributes IS
    'Extensible hospital tags (svip_level, dual_major, sales_group, …); not product-line-specific tables.';

-- Seed common attributes from archive
INSERT INTO hospital_attributes (hospital_id, attr_key, attr_value)
SELECT h.id, v.k, v.v
FROM hospitals h
CROSS JOIN LATERAL (
    VALUES
        ('svip_level', NULLIF(TRIM(h.archive->>'svipLevel'), '')),
        ('dual_major', NULLIF(TRIM(h.archive->>'dualMajorCustomer'), '')),
        ('sales_group', NULLIF(TRIM(h.archive->>'groupName'), '')),
        ('volume_direction', NULLIF(TRIM(h.archive->>'volumeDirection'), '')),
        ('dual_major_type', NULLIF(TRIM(h.archive->>'dualMajorType'), '')),
        ('dual_major_target', NULLIF(TRIM(h.archive->>'dualMajorTarget'), '')),
        ('customer_segment', NULLIF(TRIM(h.archive->>'customerSegment'), '')),
        ('segment_category', NULLIF(TRIM(h.archive->>'segmentCategory'), ''))
) AS v(k, v)
WHERE v.v IS NOT NULL
ON CONFLICT (hospital_id, attr_key) DO UPDATE SET attr_value = EXCLUDED.attr_value, updated_at = NOW();

-- ---------- assay_projects + hospital_assays ----------
CREATE TABLE IF NOT EXISTS assay_projects (
    id              BIGSERIAL PRIMARY KEY,
    code            VARCHAR(64)  NOT NULL DEFAULT '',
    name            VARCHAR(256) NOT NULL,
    line_category   VARCHAR(64)  NOT NULL DEFAULT '',
    aliases         TEXT[]       NOT NULL DEFAULT '{}',
    is_own_menu     BOOLEAN      NOT NULL DEFAULT TRUE,
    status          VARCHAR(32)  NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_assay_projects_name UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_assay_projects_line ON assay_projects (line_category);
CREATE INDEX IF NOT EXISTS idx_assay_projects_code ON assay_projects (code) WHERE code <> '';

CREATE TABLE IF NOT EXISTS hospital_assays (
    id                BIGSERIAL PRIMARY KEY,
    hospital_id       BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    assay_project_id  BIGINT       REFERENCES assay_projects(id) ON DELETE SET NULL,
    project_name      VARCHAR(256) NOT NULL DEFAULT '',
    source            VARCHAR(32)  NOT NULL DEFAULT 'own',
    brand             VARCHAR(128) NOT NULL DEFAULT '',
    instrument        VARCHAR(128) NOT NULL DEFAULT '',
    device_id         BIGINT       REFERENCES devices(id) ON DELETE SET NULL,
    flags             TEXT[]       NOT NULL DEFAULT '{}',
    meta              JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT hospital_assays_source_check CHECK (source IN ('own', 'competitor', 'unused', 'missing'))
);

CREATE INDEX IF NOT EXISTS idx_hospital_assays_hospital ON hospital_assays (hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_assays_source ON hospital_assays (source);
CREATE INDEX IF NOT EXISTS idx_hospital_assays_project ON hospital_assays (project_name);
CREATE INDEX IF NOT EXISTS idx_hospital_assays_brand ON hospital_assays (brand);

COMMENT ON TABLE hospital_assays IS
    'Hospital × assay offering; replaces free-text project lists for stats.';

-- Migrate hospital_project_items → assay_projects + hospital_assays
INSERT INTO assay_projects (name, line_category, is_own_menu)
SELECT DISTINCT TRIM(project_name), COALESCE(NULLIF(TRIM(line_category), ''), ''),
       (kind = 'mindray')
FROM hospital_project_items
WHERE TRIM(project_name) <> ''
ON CONFLICT (name) DO NOTHING;

INSERT INTO hospital_assays (hospital_id, assay_project_id, project_name, source, brand, instrument, meta)
SELECT
    p.hospital_id,
    ap.id,
    TRIM(p.project_name),
    CASE WHEN p.kind = 'mindray' THEN 'own' ELSE 'competitor' END,
    COALESCE(p.brand, ''),
    COALESCE(p.instrument, ''),
    COALESCE(p.meta, '{}'::jsonb)
FROM hospital_project_items p
LEFT JOIN assay_projects ap ON ap.name = TRIM(p.project_name)
WHERE TRIM(p.project_name) <> '';

-- ---------- suppliers + hospital_supplies ----------
CREATE TABLE IF NOT EXISTS suppliers (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(256) NOT NULL,
    status     VARCHAR(32)  NOT NULL DEFAULT 'active',
    remark     TEXT         NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_suppliers_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS hospital_supplies (
    id           BIGSERIAL PRIMARY KEY,
    hospital_id  BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    supplier_id  BIGINT       REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name VARCHAR(256) NOT NULL DEFAULT '',
    role         VARCHAR(64)  NOT NULL DEFAULT 'other',
    brand        VARCHAR(128) NOT NULL DEFAULT '',
    line_category VARCHAR(64) NOT NULL DEFAULT '',
    remark       TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT hospital_supplies_role_check CHECK (role IN ('reagent_vendor', 'channel', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_hospital_supplies_hospital ON hospital_supplies (hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_supplies_role ON hospital_supplies (role);

-- Backfill reagent suppliers from archive
INSERT INTO suppliers (name)
SELECT DISTINCT TRIM(archive->>'reagentSupplier')
FROM hospitals
WHERE NULLIF(TRIM(archive->>'reagentSupplier'), '') IS NOT NULL
ON CONFLICT (name) DO NOTHING;

INSERT INTO hospital_supplies (hospital_id, supplier_id, supplier_name, role)
SELECT h.id, s.id, s.name, 'reagent_vendor'
FROM hospitals h
JOIN suppliers s ON s.name = TRIM(h.archive->>'reagentSupplier')
WHERE NULLIF(TRIM(h.archive->>'reagentSupplier'), '') IS NOT NULL;

-- ---------- org_staff + hospital_role_assignments ----------
CREATE TABLE IF NOT EXISTS org_staff (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    employee_no  VARCHAR(64)  NOT NULL DEFAULT '',
    status       VARCHAR(32)  NOT NULL DEFAULT 'active',
    remark       TEXT         NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_staff_employee_no
    ON org_staff (employee_no) WHERE employee_no <> '';
CREATE INDEX IF NOT EXISTS idx_org_staff_name ON org_staff (name);

CREATE TABLE IF NOT EXISTS hospital_role_assignments (
    id           BIGSERIAL PRIMARY KEY,
    hospital_id  BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    staff_id     BIGINT       REFERENCES org_staff(id) ON DELETE SET NULL,
    staff_name   VARCHAR(128) NOT NULL DEFAULT '',
    role         VARCHAR(64)  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT hospital_role_assignments_role_check CHECK (role IN (
        'product_line_sales', 'reagent_sales', 'ps', 'clinical_app',
        'service_engineer', 'sales_owner', 'other'
    ))
);

CREATE INDEX IF NOT EXISTS idx_hospital_role_hospital ON hospital_role_assignments (hospital_id);
CREATE INDEX IF NOT EXISTS idx_hospital_role_role ON hospital_role_assignments (role);

-- ---------- hospital_metrics (year × metric_code) ----------
CREATE TABLE IF NOT EXISTS hospital_metrics (
    id           BIGSERIAL PRIMARY KEY,
    hospital_id  BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    year         INT          NOT NULL,
    metric_code  VARCHAR(128) NOT NULL,
    value_text   TEXT         NOT NULL DEFAULT '',
    value_num    DOUBLE PRECISION,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hospital_metrics UNIQUE (hospital_id, year, metric_code)
);

CREATE INDEX IF NOT EXISTS idx_hospital_metrics_code ON hospital_metrics (metric_code);
CREATE INDEX IF NOT EXISTS idx_hospital_metrics_year ON hospital_metrics (year);

COMMENT ON TABLE hospital_metrics IS
    'Generic yearly metrics keyed by metric_code (sample_volume_own, iot_stock, …).';

-- Backfill a few metrics from archive (year 2024 default)
INSERT INTO hospital_metrics (hospital_id, year, metric_code, value_text)
SELECT h.id, 2024, v.code, v.val
FROM hospitals h
CROSS JOIN LATERAL (
    VALUES
        ('sample_volume_own', NULLIF(TRIM(h.archive->>'mindraySampleVolume'), '')),
        ('sample_volume_total', NULLIF(TRIM(h.archive->>'totalSampleVolume'), '')),
        ('matching_rate', NULLIF(TRIM(h.archive->>'matchingRate'), '')),
        ('qc_vendor', NULLIF(TRIM(h.archive->>'qcVendor'), '')),
        ('qc_levels', NULLIF(TRIM(h.archive->>'qcLevels'), '')),
        ('qc_cycle', NULLIF(TRIM(h.archive->>'qcCycle'), '')),
        ('hospital_annual_revenue', NULLIF(TRIM(h.archive->>'annualRevenue'), '')),
        ('iot_stock', NULLIF(TRIM(h.archive->>'iotStock23'), '')),
        ('iot_forecast', NULLIF(TRIM(h.archive->>'iotForecast24'), '')),
        ('iot_increment', NULLIF(TRIM(h.archive->>'iotIncrement24'), '')),
        ('iot_growth_rate', NULLIF(TRIM(h.archive->>'iotGrowthRate24'), '')),
        ('reagent_revenue', NULLIF(TRIM(h.archive->>'hospitalReagentOutput'), '')),
        ('reagent_revenue_target', NULLIF(TRIM(h.archive->>'reagentOutputTarget'), ''))
) AS v(code, val)
WHERE v.val IS NOT NULL
ON CONFLICT (hospital_id, year, metric_code) DO UPDATE
SET value_text = EXCLUDED.value_text, updated_at = NOW();

-- customers: optional role for hospital contacts
ALTER TABLE customers ADD COLUMN IF NOT EXISTS role VARCHAR(64) NOT NULL DEFAULT 'contact';

-- devices: usage_location / enabled_at if missing
ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS usage_location VARCHAR(128) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS enabled_at DATE;

-- +goose Down
ALTER TABLE devices DROP COLUMN IF EXISTS enabled_at;
ALTER TABLE devices DROP COLUMN IF EXISTS usage_location;
ALTER TABLE customers DROP COLUMN IF EXISTS role;

DROP TABLE IF EXISTS hospital_metrics;
DROP TABLE IF EXISTS hospital_role_assignments;
DROP TABLE IF EXISTS org_staff;
DROP TABLE IF EXISTS hospital_supplies;
DROP TABLE IF EXISTS suppliers;
DROP TABLE IF EXISTS hospital_assays;
DROP TABLE IF EXISTS assay_projects;
DROP TABLE IF EXISTS hospital_attributes;

ALTER TABLE hospitals DROP COLUMN IF EXISTS branch_office;
ALTER TABLE hospitals DROP COLUMN IF EXISTS region;
ALTER TABLE hospitals DROP COLUMN IF EXISTS customer_code;
