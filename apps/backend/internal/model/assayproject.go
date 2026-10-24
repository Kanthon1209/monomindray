package model

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// IsOwnCompany: assay projects whose company matches are treated as 自有 (Mindray).
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

// OwnershipLabel returns "own" or "competitor" from company.
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
	ParentCode   string
	Kind         string // line | category | item
	SortOrder    int
	LineCategory string
	Company      string
	Aliases      []string
	IsOwnMenu    bool
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	UsageCount   int64
}

type AssayTreeNode struct {
	Code      string          `json:"code"`
	Name      string          `json:"name"`
	Kind      string          `json:"kind"`
	SortOrder int             `json:"sortOrder"`
	Children  []AssayTreeNode `json:"children,omitempty"`
}

// HospitalAssayCategoryGroup is derived: hospital "has" a category if any leaf under it is selected.
type HospitalAssayCategoryGroup struct {
	Code      string
	Name      string
	LineCode  string
	LineName  string
	SortOrder int
	Items     []HospitalAssayLeaf
}

type HospitalAssayLeaf struct {
	Code      string
	Name      string
	SortOrder int
}

type AssayProjectFilter struct {
	Keyword string
	Company string
	Line    string
	Status  string
	Kind    string // line|category|item|"" (all)
	OwnOnly *bool
	Limit   int
	Offset  int
}

type AssayProjectInput struct {
	Code         string
	Name         string
	ParentCode   string
	Kind         string
	SortOrder    int
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
	if kind := strings.TrimSpace(f.Kind); kind != "" && kind != "all" {
		where = append(where, fmt.Sprintf("p.kind = $%d", i))
		args = append(args, kind)
		i++
	}
	if f.OwnOnly != nil {
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
		SELECT p.id, p.code, p.name, COALESCE(p.parent_code,''), COALESCE(p.kind,'item'), COALESCE(p.sort_order,0),
		       p.line_category, p.company, p.aliases, p.is_own_menu, p.status,
		       p.created_at, p.updated_at,
		       COALESCE((SELECT COUNT(DISTINCT hospital_id) FROM hospital_assays ha WHERE ha.assay_project_id = p.id), 0)
		FROM assay_projects p
		WHERE %s
		ORDER BY p.kind ASC, p.sort_order ASC, p.name ASC
		LIMIT $%d OFFSET $%d`, whereSQL, i, i+1)

	rows, err := m.conn.Query(ctx, listSQL, listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]AssayProject, 0)
	for rows.Next() {
		var p AssayProject
		if err := rows.Scan(&p.Id, &p.Code, &p.Name, &p.ParentCode, &p.Kind, &p.SortOrder,
			&p.LineCategory, &p.Company, &p.Aliases, &p.IsOwnMenu, &p.Status,
			&p.CreatedAt, &p.UpdatedAt, &p.UsageCount); err != nil {
			return nil, 0, err
		}
		if p.Aliases == nil {
			p.Aliases = []string{}
		}
		out = append(out, p)
	}
	return out, total, rows.Err()
}

func (m *masterDataModel) ListAssayTree(ctx context.Context) ([]AssayTreeNode, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT code, name, COALESCE(parent_code,''), kind, sort_order
		FROM assay_projects
		WHERE status = 'active'
		ORDER BY kind ASC, sort_order ASC, name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type flat struct {
		Code, Name, Parent, Kind string
		Sort                     int
	}
	all := make([]flat, 0)
	byParent := map[string][]flat{}
	for rows.Next() {
		var f flat
		if err := rows.Scan(&f.Code, &f.Name, &f.Parent, &f.Kind, &f.Sort); err != nil {
			return nil, err
		}
		all = append(all, f)
		byParent[f.Parent] = append(byParent[f.Parent], f)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var build func(parent string) []AssayTreeNode
	build = func(parent string) []AssayTreeNode {
		kids := byParent[parent]
		out := make([]AssayTreeNode, 0, len(kids))
		for _, k := range kids {
			n := AssayTreeNode{
				Code:      k.Code,
				Name:      k.Name,
				Kind:      k.Kind,
				SortOrder: k.Sort,
			}
			if k.Kind != "item" {
				n.Children = build(k.Code)
			}
			out = append(out, n)
		}
		return out
	}
	return build(""), nil
}

func (m *masterDataModel) GetAssayProject(ctx context.Context, id int64) (*AssayProject, error) {
	var p AssayProject
	err := m.conn.QueryRow(ctx, `
		SELECT p.id, p.code, p.name, COALESCE(p.parent_code,''), COALESCE(p.kind,'item'), COALESCE(p.sort_order,0),
		       p.line_category, p.company, p.aliases, p.is_own_menu, p.status,
		       p.created_at, p.updated_at,
		       COALESCE((SELECT COUNT(DISTINCT hospital_id) FROM hospital_assays ha WHERE ha.assay_project_id = p.id), 0)
		FROM assay_projects p WHERE p.id=$1`, id).Scan(
		&p.Id, &p.Code, &p.Name, &p.ParentCode, &p.Kind, &p.SortOrder,
		&p.LineCategory, &p.Company, &p.Aliases, &p.IsOwnMenu, &p.Status,
		&p.CreatedAt, &p.UpdatedAt, &p.UsageCount)
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

func (m *masterDataModel) GetAssayProjectByCode(ctx context.Context, code string) (*AssayProject, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, nil
	}
	var p AssayProject
	err := m.conn.QueryRow(ctx, `
		SELECT p.id, p.code, p.name, COALESCE(p.parent_code,''), COALESCE(p.kind,'item'), COALESCE(p.sort_order,0),
		       p.line_category, p.company, p.aliases, p.is_own_menu, p.status,
		       p.created_at, p.updated_at,
		       COALESCE((SELECT COUNT(DISTINCT hospital_id) FROM hospital_assays ha WHERE ha.assay_project_id = p.id), 0)
		FROM assay_projects p WHERE p.code=$1`, code).Scan(
		&p.Id, &p.Code, &p.Name, &p.ParentCode, &p.Kind, &p.SortOrder,
		&p.LineCategory, &p.Company, &p.Aliases, &p.IsOwnMenu, &p.Status,
		&p.CreatedAt, &p.UpdatedAt, &p.UsageCount)
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

func (m *masterDataModel) validateAssayTreeInput(ctx context.Context, in AssayProjectInput) (kind string, parent string, err error) {
	kind = strings.TrimSpace(in.Kind)
	if kind == "" {
		kind = "item"
	}
	parent = strings.TrimSpace(in.ParentCode)
	switch kind {
	case "line":
		if parent != "" {
			return "", "", fmt.Errorf("line must not have a parent")
		}
	case "category", "item":
		if parent == "" {
			return "", "", fmt.Errorf("%s requires parentCode", kind)
		}
		p, e := m.GetAssayProjectByCode(ctx, parent)
		if e != nil {
			return "", "", e
		}
		if p == nil {
			return "", "", fmt.Errorf("parent not found: %s", parent)
		}
		if kind == "category" && p.Kind != "line" {
			return "", "", fmt.Errorf("category parent must be a line")
		}
		if kind == "item" && p.Kind != "category" {
			return "", "", fmt.Errorf("item parent must be a category")
		}
	default:
		return "", "", fmt.Errorf("invalid kind %q (want line|category|item)", kind)
	}
	return kind, parent, nil
}

func (m *masterDataModel) CreateAssayProject(ctx context.Context, in AssayProjectInput) (*AssayProject, error) {
	name := strings.TrimSpace(in.Name)
	code := strings.TrimSpace(in.Code)
	if name == "" || code == "" {
		return nil, fmt.Errorf("code and name required")
	}
	kind, parent, err := m.validateAssayTreeInput(ctx, in)
	if err != nil {
		return nil, err
	}
	company := strings.TrimSpace(in.Company)
	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "active"
	}
	aliases := normalizeAliases(in.Aliases)
	own := IsOwnCompany(company)
	var parentAny any
	if parent != "" {
		parentAny = parent
	}
	var id int64
	err = m.conn.QueryRow(ctx, `
		INSERT INTO assay_projects (code, name, parent_code, kind, sort_order, line_category, company, aliases, is_own_menu, status, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
		RETURNING id`,
		code, name, parentAny, kind, in.SortOrder, strings.TrimSpace(in.LineCategory),
		company, aliases, own, status).Scan(&id)
	if err != nil {
		return nil, err
	}
	return m.GetAssayProject(ctx, id)
}

func (m *masterDataModel) UpdateAssayProject(ctx context.Context, id int64, in AssayProjectInput) (*AssayProject, error) {
	name := strings.TrimSpace(in.Name)
	code := strings.TrimSpace(in.Code)
	if id <= 0 || name == "" || code == "" {
		return nil, fmt.Errorf("invalid input")
	}
	existing, err := m.GetAssayProject(ctx, id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, nil
	}
	// Parent + kind are immutable after create (tree topology stays stable).
	in.Kind = existing.Kind
	in.ParentCode = existing.ParentCode
	kind, parent, err := m.validateAssayTreeInput(ctx, in)
	if err != nil {
		return nil, err
	}
	company := strings.TrimSpace(in.Company)
	status := strings.TrimSpace(in.Status)
	if status == "" {
		status = "active"
	}
	aliases := normalizeAliases(in.Aliases)
	own := IsOwnCompany(company)
	var parentAny any
	if parent != "" {
		parentAny = parent
	}
	tag, err := m.conn.Exec(ctx, `
		UPDATE assay_projects SET
			code=$2, name=$3, parent_code=$4, kind=$5, sort_order=$6, line_category=$7,
			company=$8, aliases=$9, is_own_menu=$10, status=$11, updated_at=NOW()
		WHERE id=$1`,
		id, code, name, parentAny, kind, in.SortOrder, strings.TrimSpace(in.LineCategory),
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
	p, err := m.GetAssayProject(ctx, id)
	if err != nil {
		return err
	}
	if p == nil {
		return fmt.Errorf("project not found")
	}
	var childCount int64
	if err := m.conn.QueryRow(ctx, `
		SELECT COUNT(*) FROM assay_projects WHERE parent_code=$1`, p.Code).Scan(&childCount); err != nil {
		return err
	}
	if childCount > 0 {
		return fmt.Errorf("仍有 %d 个子节点，请先删除子节点", childCount)
	}
	var usage int64
	_ = m.conn.QueryRow(ctx, `
		SELECT COUNT(*) FROM hospital_assays WHERE assay_project_id=$1`, id).Scan(&usage)
	if usage > 0 {
		_, err := m.conn.Exec(ctx, `
			UPDATE assay_projects SET status='inactive', updated_at=NOW() WHERE id=$1`, id)
		return err
	}
	_, err = m.conn.Exec(ctx, `DELETE FROM assay_projects WHERE id=$1`, id)
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

// ListHospitalAssayCodes returns leaf codes currently offered at a hospital (source=own by default all).
func (m *masterDataModel) ListHospitalAssayCodes(ctx context.Context, hospitalID int64) ([]string, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT COALESCE(ap.code, '')
		FROM hospital_assays ha
		LEFT JOIN assay_projects ap ON ap.id = ha.assay_project_id
		WHERE ha.hospital_id=$1 AND ap.kind='item' AND TRIM(COALESCE(ap.code,'')) <> ''
		ORDER BY ap.sort_order, ap.name`, hospitalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	seen := map[string]struct{}{}
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, err
		}
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ReplaceHospitalAssaysByCodes replaces all hospital_assays for a hospital with the given item codes.
// Only kind=item codes are accepted; unknown codes are rejected.
func (m *masterDataModel) ReplaceHospitalAssaysByCodes(ctx context.Context, hospitalID int64, codes []string, source string) error {
	if hospitalID <= 0 {
		return nil
	}
	if source == "" {
		source = "own"
	}
	seen := map[string]struct{}{}
	clean := make([]string, 0, len(codes))
	for _, c := range codes {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, ok := seen[c]; ok {
			continue
		}
		seen[c] = struct{}{}
		clean = append(clean, c)
	}

	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Only replace non-device rows so device_block sync (device_id set) is preserved.
	if _, err := tx.Exec(ctx, `DELETE FROM hospital_assays WHERE hospital_id=$1 AND source=$2 AND device_id IS NULL`, hospitalID, source); err != nil {
		return err
	}
	for _, code := range clean {
		var id int64
		var name, kind string
		err := tx.QueryRow(ctx, `
			SELECT id, name, kind FROM assay_projects WHERE code=$1 AND status='active'`, code).
			Scan(&id, &name, &kind)
		if err == pgx.ErrNoRows {
			return fmt.Errorf("unknown assay code: %s", code)
		}
		if err != nil {
			return err
		}
		if kind != "item" {
			return fmt.Errorf("assay code is not an item: %s", code)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO hospital_assays (hospital_id, assay_project_id, project_name, source, brand, instrument, flags)
			VALUES ($1,$2,$3,$4,'','','{}')`,
			hospitalID, id, name, source); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// ListAssayNamesByHospitalIDs returns distinct category names per hospital.
// A hospital "has" a category when any leaf (kind=item) under that category is stored in hospital_assays.
// Category presence is derived (not stored as its own row).
func (m *masterDataModel) ListAssayNamesByHospitalIDs(ctx context.Context, hospitalIDs []int64) (map[int64][]string, error) {
	out := map[int64][]string{}
	if len(hospitalIDs) == 0 {
		return out, nil
	}
	rows, err := m.conn.Query(ctx, `
		SELECT ha.hospital_id, COALESCE(cat.name, item.name) AS category_name,
		       COALESCE(cat.sort_order, item.sort_order) AS sort_order
		FROM hospital_assays ha
		JOIN assay_projects item ON item.id = ha.assay_project_id
		LEFT JOIN assay_projects cat ON cat.code = item.parent_code AND cat.kind = 'category' AND cat.status = 'active'
		WHERE ha.hospital_id = ANY($1) AND item.kind = 'item' AND item.status = 'active'
		ORDER BY ha.hospital_id, sort_order, category_name`, hospitalIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	seen := map[int64]map[string]struct{}{}
	for rows.Next() {
		var hid int64
		var name string
		var sortOrder int
		if err := rows.Scan(&hid, &name, &sortOrder); err != nil {
			return nil, err
		}
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		if seen[hid] == nil {
			seen[hid] = map[string]struct{}{}
		}
		if _, ok := seen[hid][name]; ok {
			continue
		}
		seen[hid][name] = struct{}{}
		out[hid] = append(out[hid], name)
	}
	return out, rows.Err()
}

// ListHospitalAssayGroups returns selected leaves grouped under their parent categories (derived).
func (m *masterDataModel) ListHospitalAssayGroups(ctx context.Context, hospitalID int64) ([]HospitalAssayCategoryGroup, error) {
	if hospitalID <= 0 {
		return []HospitalAssayCategoryGroup{}, nil
	}
	rows, err := m.conn.Query(ctx, `
		SELECT COALESCE(cat.code, ''), COALESCE(cat.name, ''), COALESCE(cat.sort_order, 0),
		       COALESCE(line.code, ''), COALESCE(line.name, ''),
		       item.code, item.name, COALESCE(item.sort_order, 0)
		FROM hospital_assays ha
		JOIN assay_projects item ON item.id = ha.assay_project_id
		LEFT JOIN assay_projects cat ON cat.code = item.parent_code AND cat.kind = 'category'
		LEFT JOIN assay_projects line ON line.code = cat.parent_code AND line.kind = 'line'
		WHERE ha.hospital_id = $1 AND item.kind = 'item' AND item.status = 'active'
		  AND TRIM(COALESCE(item.code, '')) <> ''
		ORDER BY COALESCE(line.sort_order, 0), COALESCE(cat.sort_order, 0), COALESCE(cat.name, ''),
		         COALESCE(item.sort_order, 0), item.name`, hospitalID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	order := []string{}
	byKey := map[string]*HospitalAssayCategoryGroup{}
	itemSeen := map[string]map[string]struct{}{}

	for rows.Next() {
		var catCode, catName, lineCode, lineName, itemCode, itemName string
		var catSort, itemSort int
		if err := rows.Scan(&catCode, &catName, &catSort, &lineCode, &lineName, &itemCode, &itemName, &itemSort); err != nil {
			return nil, err
		}
		key := catCode
		if key == "" {
			key = "_item:" + itemCode
			if catName == "" {
				catName = "未分类"
			}
		}
		g, ok := byKey[key]
		if !ok {
			g = &HospitalAssayCategoryGroup{
				Code: key, Name: catName, LineCode: lineCode, LineName: lineName, SortOrder: catSort,
				Items: []HospitalAssayLeaf{},
			}
			if strings.HasPrefix(key, "_item:") {
				g.Code = ""
			}
			byKey[key] = g
			order = append(order, key)
			itemSeen[key] = map[string]struct{}{}
		}
		if _, dup := itemSeen[key][itemCode]; dup {
			continue
		}
		itemSeen[key][itemCode] = struct{}{}
		g.Items = append(g.Items, HospitalAssayLeaf{Code: itemCode, Name: itemName, SortOrder: itemSort})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]HospitalAssayCategoryGroup, 0, len(order))
	for _, k := range order {
		out = append(out, *byKey[k])
	}
	return out, nil
}

// ResolveAssayItemCodesByNames maps exact leaf names to codes; unknown names are skipped.
func (m *masterDataModel) ResolveAssayItemCodesByNames(ctx context.Context, names []string) ([]string, error) {
	codes := make([]string, 0)
	seen := map[string]struct{}{}
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		var code string
		err := m.conn.QueryRow(ctx, `
			SELECT code FROM assay_projects
			WHERE kind = 'item' AND status = 'active' AND name = $1
			ORDER BY id ASC LIMIT 1`, n).Scan(&code)
		if err == pgx.ErrNoRows {
			continue
		}
		if err != nil {
			return nil, err
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}
		codes = append(codes, code)
	}
	return codes, nil
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
