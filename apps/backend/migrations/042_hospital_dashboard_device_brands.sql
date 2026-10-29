-- +goose Up
-- Dashboard view: aggregate distinct device brands (公司) per hospital for list filters.

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
    COALESCE(d.device_brands, ARRAY[]::TEXT[]) AS device_brands,
    h.created_by,
    h.created_at,
    h.updated_at
FROM hospitals h
LEFT JOIN LATERAL (
    SELECT
        COUNT(*)::INT AS device_count,
        ARRAY_AGG(DISTINCT model ORDER BY model) FILTER (WHERE model IS NOT NULL AND model <> '') AS device_models,
        ARRAY_AGG(DISTINCT brand_norm ORDER BY brand_norm) FILTER (WHERE brand_norm IS NOT NULL AND brand_norm <> '') AS device_brands
    FROM (
        SELECT
            model,
            COALESCE(NULLIF(TRIM(brand), ''), '迈瑞') AS brand_norm
        FROM devices
        WHERE hospital_id = h.id AND status = 'active'
    ) sub
) d ON TRUE;

-- +goose Down
-- Historical migration: prefer forward fixes over automatic rollback.
SELECT 1;
