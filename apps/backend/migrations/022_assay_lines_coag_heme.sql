-- +goose Up
-- Add empty top-level assay lines: 凝血项目 / 血球项目 (no categories/items yet).
-- Display kind "line" is labeled 检测线 in the admin UI.

INSERT INTO assay_projects (code, name, parent_code, kind, sort_order, line_category, status)
VALUES
    ('coag', '凝血项目', NULL, 'line', 30, '凝血项目', 'active'),
    ('heme', '血球项目', NULL, 'line', 40, '血球项目', 'active')
ON CONFLICT (code) DO UPDATE
SET
    name = EXCLUDED.name,
    parent_code = EXCLUDED.parent_code,
    kind = EXCLUDED.kind,
    sort_order = EXCLUDED.sort_order,
    line_category = EXCLUDED.line_category,
    status = EXCLUDED.status,
    updated_at = NOW();

COMMENT ON COLUMN assay_projects.line_category IS 'Legacy display hint (检测线中文名); prefer walking parent to line';

-- +goose Down
DELETE FROM assay_projects WHERE code IN ('coag', 'heme') AND kind = 'line';
COMMENT ON COLUMN assay_projects.line_category IS 'Legacy display hint (产线中文名); prefer walking parent to line';
