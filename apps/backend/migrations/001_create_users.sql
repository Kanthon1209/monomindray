-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(64)  NOT NULL,
    email        VARCHAR(255) NOT NULL UNIQUE,
    password     VARCHAR(255) NOT NULL,
    role         VARCHAR(32)  NOT NULL DEFAULT 'collector',
    avatar       VARCHAR(512),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trigger_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 初始管理员（密码 admin123 的 bcrypt hash）
INSERT INTO users (name, email, password, role)
VALUES (
    '管理员',
    'admin@mindray.com',
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgqFkMx3sF.5kQX5p1q2r3s4t5u6',
    'admin'
)
ON CONFLICT (email) DO NOTHING;
