package model

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// OwnCompanyNames: assay projects whose company matches are treated as 自有 (Mindray).
// Comparison is case-insensitive for Latin; Chinese names matched as-is / prefix.
func IsOwnCompany(company string) bool {
	c := strings.TrimSpace(company)
	if c == "" {
		return false
	}
	lower := strings.ToLower(c)
	if lower == "mindray" || strings.Contains(lower, "mindray") {
		return true
	}
	if c == "迈瑞" || strings.HasPrefix(c, "迈瑞") {
		return true
	}
	return false
}

// OwnershipLabel returns "own" or "competitor" from company (never stored as source of truth on dictionary).
func OwnershipLabel(company string) string {
	if IsOwnCompany(company) {
		return "own"
	}
	return "competitor"
}

type AssayProject struct {
	Id           int64
	Code         string
	Name         string
	LineCategory string
	Company      string
	Aliases      []string
	IsOwnMenu    bool // legacy mirror of IsOwnCompany(Company)
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	UsageCount   int64 // hospitals referencing this project
}

type AssayProjectFilter struct {
	Keyword  string
	Company  string
	Line     string
	Status   string
	OwnOnly  *bool // filter by derived ownership
	Limit    int
	Offset   int
}

type AssayProjectInput struct {
	Code         string
	Name         string
	LineCategory string
	Company      string
	Aliases      []string
	Status       string
}

func (m *masterDataModel) ListAssayProjects(ctx context.Context, f AssayProjectFilter) ([]AssayProject, int64, error) {
	where := []string{"1=1"}
	args := []any{}
	i := 1
	if kw := strings.TrimSpace(f.Keyword); kw != "" {
		where = append(where, fmt.Sprintf(`(p.name ILIKE $%d OR p.code ILIKE $%d OR p.company ILIKE $%d OR EXISTS (
			SELECT 1 FROM unnest(p.aliases) a WHERE a ILIKE $%d))`, i, i, i, i))
		args = append(args, "%"+kw+"%")
		i++
	}
	if c := strings.TrimSpace(f.Company); c != "" {
		where = append(where, fmt.Sprintf("p.company ILIKE $%d", i))
		args = append(args, c)
		i++
	}
	if line := strings.TrimSpace(f.Line); line != "" {
		where = append(where, fmt.Sprintf("p.line_category = $%d", i))
		args = append(args, line)
		i++
	}
	if st := strings.TrimSpace(f.Status); st != "" && st != "all" {
		where = append(where, fmt.Sprintf("p.status = $%d", i))
		args = append(args, st)
		i++
	}
	if f.OwnOnly != nil {
		// Approximate SQL filter aligned with IsOwnCompany
		if *f.OwnOnly {
			where = append(where, `(LOWER(p.company) LIKE '%mindray%' OR p.company = '迈瑞' OR p.company LIKE '迈瑞%')`)
		} else {
			where = append(where, `(p.company = '' OR (LOWER(p.company) NOT LIKE '%mindray%' AND p.company <> '迈瑞' AND p.company NOT LIKE '迈瑞%'))`)
		}
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	countSQL := `SELECT COUNT(*) FROM assay_projects p WHERE ` + whereSQL
	if err := m.conn.QueryRow(ctx, countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	limit, offset := f.Limit, f.Offset
	if limit <= 0 {
		limit = 50
	}
	listArgs := append(append([]any{}, args...), limit, offset)
	listSQL := fmt.Sprintf(`
		SELECT p.id, p.code, p.name, p.line_category, p.company, p.aliases, p.is_own_menu, p.status,
		       p.created_at, p.updated_at,
		       COALESCE((SELECT COUNT(DISTINCT hospital_id) FROM hospital_assays ha WHERE ha.assay_project_id = p.id), 0)
		FROM assay_projects p
		WHERE %s
		ORDER BY p.company ASC, p.name ASC
		LIMIT $%d OFFSET $%d`, whereSQL, i, i+1)

	rows, err := m.conn.Query(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]AssayProject, 0)
	for rows.Next() {
		var p AssayProject
		if err := rows.Scan(&p.Id, &p.Code, &p.Name, &p.LineCategory, &p.Company, &p.Aliases,
			&p.IsOwnMenu, &p.Status, &p.CreatedAt, &p.UpdatedAt, &p.UsageCount); err != nil {
			return nil, 0, err
		}
		if p.Aliases == nil {
			p.Aliases = []string{}
		}
		out = append(out, p)
	}
	return out, total, rows.Err()
}

func (m *masterDataModel) GetAssayProject(ctx context.Context, id int64) (*AssayProject, error) {
	var p AssayProject
	err := m.conn.QueryRow(ctx, `
		SELECT p.id, p.code, p.name, p.line_category, p.company, p.aliases, p.is_own_menu, p.status,
		       p.created_at, p.updated_at,
		       COALESCE((SELECT COUNT(DISTINCT hospital_id) FROM hospital_assays ha WHERE ha.assay_project_id = p.id), 0)
		FROM assay_projects p WHERE p.id=$1`, id).Scan(
		&p.Id, &p.Code, &p.Name, &p.LineCategory, &p.Company, &p.Aliases,
		&p.IsOwnMenu, &p.Status, &p.CreatedAt, &p.UpdatedAt, &p.UsageCount)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if p.Aliases == nil {
		p.Aliases = []string{}
	}
	return &p, nil
}

func (m *masterDataModel) CreateAssayProject(ctx context.Context, in AssayProjectInput) (*AssayProject, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("name required")
	}
	company := strings.TrimSpace(in.Company)
	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "active"
	}
	aliases := normalizeAliases(in.Aliases)
	own := IsOwnCompany(company)
	var id int64
	err := m.conn.QueryRow(ctx, `
		INSERT INTO assay_projects (code, name, line_category, company, aliases, is_own_menu, status, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
		RETURNING id`,
		strings.TrimSpace(in.Code), name, strings.TrimSpace(in.LineCategory),
		company, aliases, own, status).Scan(&id)
	if err != nil {
		return nil, err
	}
	return m.GetAssayProject(ctx, id)
}

func (m *masterDataModel) UpdateAssayProject(ctx context.Context, id int64, in AssayProjectInput) (*AssayProject, error) {
	name := strings.TrimSpace(in.Name)
	if id <= 0 || name == "" {
		return nil, fmt.Errorf("invalid input")
	}
	company := strings.TrimSpace(in.Company)
	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "active"
	}
	aliases := normalizeAliases(in.Aliases)
	own := IsOwnCompany(company)
	tag, err := m.conn.Exec(ctx, `
		UPDATE assay_projects SET
			code=$2, name=$3, line_category=$4, company=$5, aliases=$6,
			is_own_menu=$7, status=$8, updated_at=NOW()
		WHERE id=$1`,
		id, strings.TrimSpace(in.Code), name, strings.TrimSpace(in.LineCategory),
		company, aliases, own, status)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, nil
	}
	return m.GetAssayProject(ctx, id)
}

func (m *masterDataModel) DeleteAssayProject(ctx context.Context, id int64) error {
	// Soft-delete preferred if in use; hard delete when unused
	var usage int64
	_ = m.conn.QueryRow(ctx, `
		SELECT COUNT(*) FROM hospital_assays WHERE assay_project_id=$1`, id).Scan(&usage)
	if usage > 0 {
		_, err := m.conn.Exec(ctx, `
			UPDATE assay_projects SET status='inactive', updated_at=NOW() WHERE id=$1`, id)
		return err
	}
	_, err := m.conn.Exec(ctx, `DELETE FROM assay_projects WHERE id=$1`, id)
	return err
}

func (m *masterDataModel) ListAssayCompanies(ctx context.Context) ([]string, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT DISTINCT company FROM assay_projects
		WHERE TRIM(company) <> ''
		ORDER BY company`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func normalizeAliases(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, a := range in {
		a = strings.TrimSpace(a)
		if a == "" {
			continue
		}
		key := strings.ToLower(a)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, a)
	}
	if out == nil {
		return []string{}
	}
	return out
}
