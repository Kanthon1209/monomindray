-- +goose Up
-- ============================================================
-- EQA (室间质评) participation + field registry
-- Depends on: hospitals, users
-- ============================================================

-- ---------- field_registry（字段树 / 枚举字典） ----------
CREATE TABLE IF NOT EXISTS field_registry (
    code         VARCHAR(128) PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    value_type   VARCHAR(32)  NOT NULL DEFAULT 'boolean',
    parent_code  VARCHAR(128) REFERENCES field_registry(code) ON DELETE SET NULL,
    enum_values  JSONB        NOT NULL DEFAULT '[]'::jsonb,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT field_registry_value_type_check CHECK (
        value_type IN ('boolean', 'text', 'number', 'enum', 'group')
    )
);

CREATE INDEX IF NOT EXISTS idx_field_registry_parent ON field_registry (parent_code);
CREATE INDEX IF NOT EXISTS idx_field_registry_sort ON field_registry (sort_order);

DROP TRIGGER IF EXISTS trigger_field_registry_updated_at ON field_registry;
CREATE TRIGGER trigger_field_registry_updated_at
    BEFORE UPDATE ON field_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- eqa_participation（某医院某年某范围的参评记录） ----------
CREATE TABLE IF NOT EXISTS eqa_participation (
    id             BIGSERIAL PRIMARY KEY,
    hospital_id    BIGINT       NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    year           INT          NOT NULL,
    scope          VARCHAR(32)  NOT NULL,
    tags           TEXT[]       NOT NULL DEFAULT '{}',
    owner_user_id  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT eqa_participation_scope_check CHECK (scope IN ('national', 'provincial')),
    CONSTRAINT eqa_participation_year_check CHECK (year >= 2000 AND year <= 2100),
    CONSTRAINT uq_eqa_participation_hospital_year_scope UNIQUE (hospital_id, year, scope)
);

CREATE INDEX IF NOT EXISTS idx_eqa_participation_hospital ON eqa_participation (hospital_id);
CREATE INDEX IF NOT EXISTS idx_eqa_participation_year ON eqa_participation (year);
CREATE INDEX IF NOT EXISTS idx_eqa_participation_scope ON eqa_participation (scope);
CREATE INDEX IF NOT EXISTS idx_eqa_participation_owner ON eqa_participation (owner_user_id);

DROP TRIGGER IF EXISTS trigger_eqa_participation_updated_at ON eqa_participation;
CREATE TRIGGER trigger_eqa_participation_updated_at
    BEFORE UPDATE ON eqa_participation
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- eqa_participation_items（参评勾选的字段） ----------
CREATE TABLE IF NOT EXISTS eqa_participation_items (
    id               BIGSERIAL PRIMARY KEY,
    participation_id BIGINT       NOT NULL REFERENCES eqa_participation(id) ON DELETE CASCADE,
    field_code       VARCHAR(128) NOT NULL REFERENCES field_registry(code) ON DELETE RESTRICT,
    value            BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_eqa_participation_items UNIQUE (participation_id, field_code)
);

CREATE INDEX IF NOT EXISTS idx_eqa_participation_items_field ON eqa_participation_items (field_code);

DROP TRIGGER IF EXISTS trigger_eqa_participation_items_updated_at ON eqa_participation_items;
CREATE TRIGGER trigger_eqa_participation_items_updated_at
    BEFORE UPDATE ON eqa_participation_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------- eqa_change_log（轻量变更日志） ----------
CREATE TABLE IF NOT EXISTS eqa_change_log (
    id               BIGSERIAL PRIMARY KEY,
    participation_id BIGINT       REFERENCES eqa_participation(id) ON DELETE SET NULL,
    hospital_id      BIGINT       REFERENCES hospitals(id) ON DELETE SET NULL,
    actor_user_id    BIGINT       REFERENCES users(id) ON DELETE SET NULL,
    action           VARCHAR(64)  NOT NULL,
    detail           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eqa_change_log_participation ON eqa_change_log (participation_id);
CREATE INDEX IF NOT EXISTS idx_eqa_change_log_hospital ON eqa_change_log (hospital_id);
CREATE INDEX IF NOT EXISTS idx_eqa_change_log_created ON eqa_change_log (created_at DESC);

-- ---------- seed：最小字段树（证明层级，非全量项目） ----------
INSERT INTO field_registry (code, name, value_type, parent_code, enum_values, sort_order)
VALUES
    ('scope.national',   '国家室间质评', 'group', NULL, '[]'::jsonb, 10),
    ('scope.provincial', '省级室间质评', 'group', NULL, '[]'::jsonb, 20),
    ('customer',         '客户属性',     'group', NULL, '[]'::jsonb, 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO field_registry (code, name, value_type, parent_code, enum_values, sort_order)
VALUES
    ('national.biochem',  '国家-生化',   'boolean', 'scope.national',   '[]'::jsonb, 11),
    ('national.immuno',   '国家-免疫',   'boolean', 'scope.national',   '[]'::jsonb, 12),
    ('national.bloodgas', '国家-血气',   'boolean', 'scope.national',   '[]'::jsonb, 13),
    ('provincial.biochem','省级-生化',   'boolean', 'scope.provincial', '[]'::jsonb, 21),
    ('provincial.immuno', '省级-免疫',   'boolean', 'scope.provincial', '[]'::jsonb, 22),
    ('customer.level', '客户等级', 'enum', 'customer',
        '["战略客户","重点客户","普通客户","潜在客户"]'::jsonb, 31),
    ('customer.usage_location', '使用地点', 'enum', 'customer',
        '["中心实验室","急诊","ICU","门诊","其他"]'::jsonb, 32)
ON CONFLICT (code) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS eqa_change_log;
DROP TABLE IF EXISTS eqa_participation_items;
DROP TABLE IF EXISTS eqa_participation;
DROP TABLE IF EXISTS field_registry;
