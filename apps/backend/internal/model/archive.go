package model

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Known competitor / analyzer brand tokens for best-effort parsing.
var brandTokens = []string{
	"迈瑞", "雅培", "罗氏", "贝克曼", "西门子", "安图", "希森美康", "透景", "索林",
	"新产业", "亚辉龙", "博奥赛斯", "康润", "科美", "强生", "九强", "立禾", "金标",
}

var splitProjectsRe = regexp.MustCompile(`[/、,，;；|＋+]+`)
var numberedSegRe = regexp.MustCompile(`(?m)^\s*\d+[\.、．\)]\s*`)

// NormalizeArchiveValue coerces Excel-ish values into queryable JSON shapes.
// mindrayProjects -> []string; competitorProjectDistribution -> []map.
func NormalizeArchiveValue(key string, raw any) any {
	switch key {
	case "mindrayProjects", "newProjects":
		return ToStringSlice(raw)
	case "competitorProjectDistribution":
		return ToCompetitorList(raw)
	default:
		return raw
	}
}

// NormalizeArchive returns a copy with structured keys normalized.
func NormalizeArchive(in map[string]any) map[string]any {
	out := map[string]any{}
	if in == nil {
		return out
	}
	for k, v := range in {
		if v == nil {
			continue
		}
		out[k] = NormalizeArchiveValue(k, v)
	}
	return out
}

// ToStringSlice accepts string / []any / []string.
func ToStringSlice(raw any) []string {
	switch v := raw.(type) {
	case nil:
		return []string{}
	case []string:
		return cleanStrings(v)
	case string:
		return SplitProjectNames(v)
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			s := strings.TrimSpace(fmt.Sprint(item))
			if s != "" && s != "<nil>" {
				out = append(out, s)
			}
		}
		return cleanStrings(out)
	default:
		s := strings.TrimSpace(fmt.Sprint(v))
		if s == "" || s == "<nil>" {
			return []string{}
		}
		return SplitProjectNames(s)
	}
}

// SplitProjectNames splits "AFP/CEA、CA125" style lists.
func SplitProjectNames(s string) []string {
	s = strings.TrimSpace(s)
	if s == "" {
		return []string{}
	}
	parts := splitProjectsRe.Split(s, -1)
	return cleanStrings(parts)
}

func cleanStrings(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, p := range in {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

// ToCompetitorList accepts already-structured list or free text.
func ToCompetitorList(raw any) []map[string]any {
	switch v := raw.(type) {
	case nil:
		return []map[string]any{}
	case []map[string]any:
		return v
	case []any:
		out := make([]map[string]any, 0, len(v))
		for _, item := range v {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
				continue
			}
			s := strings.TrimSpace(fmt.Sprint(item))
			if s != "" {
				out = append(out, parseCompetitorSegment(s)...)
			}
		}
		return out
	case string:
		return ParseCompetitorDistribution(v)
	default:
		s := strings.TrimSpace(fmt.Sprint(v))
		if s == "" || s == "<nil>" {
			return []map[string]any{}
		}
		return ParseCompetitorDistribution(s)
	}
}

// ParseCompetitorDistribution turns free text into [{line,brand,instrument,projects,note}].
func ParseCompetitorDistribution(text string) []map[string]any {
	text = strings.TrimSpace(text)
	if text == "" {
		return []map[string]any{}
	}
	// Prefer numbered segments; else split on Chinese/English semicolons or newlines.
	segs := numberedSegRe.Split(text, -1)
	if len(segs) <= 1 {
		segs = regexp.MustCompile(`[\n；;]+`).Split(text, -1)
	}
	out := make([]map[string]any, 0, len(segs))
	for _, seg := range segs {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}
		out = append(out, parseCompetitorSegment(seg)...)
	}
	if len(out) == 0 {
		out = append(out, map[string]any{"note": text})
	}
	return out
}

func parseCompetitorSegment(seg string) []map[string]any {
	seg = strings.TrimSpace(seg)
	if seg == "" {
		return nil
	}
	line, rest := splitLinePrefix(seg)

	brands := findBrands(rest)
	if len(brands) == 0 {
		return []map[string]any{{
			"line":  line,
			"note":  rest,
			"brand": "",
		}}
	}

	out := make([]map[string]any, 0, len(brands))
	for _, b := range brands {
		projects := extractProjectsNearBrand(rest, b)
		out = append(out, map[string]any{
			"line":       line,
			"brand":      b,
			"instrument": "",
			"projects":   projects,
			"note":       rest,
		})
	}
	return out
}

func splitLinePrefix(seg string) (line, rest string) {
	for _, sep := range []string{"：", ":"} {
		if i := strings.Index(seg, sep); i >= 0 {
			maybe := strings.TrimSpace(seg[:i])
			if runeLen(maybe) > 0 && runeLen(maybe) <= 8 {
				return maybe, strings.TrimSpace(seg[i+len(sep):])
			}
		}
	}
	return "", seg
}

func runeLen(s string) int { return len([]rune(s)) }

func findBrands(s string) []string {
	found := make([]string, 0)
	for _, b := range brandTokens {
		if strings.Contains(s, b) {
			found = append(found, b)
		}
	}
	return found
}

func extractProjectsNearBrand(s, brand string) []string {
	idx := strings.Index(s, brand)
	if idx < 0 {
		return nil
	}
	chunk := s[idx:]
	// take until next brand or end
	end := len(chunk)
	for _, other := range brandTokens {
		if other == brand {
			continue
		}
		if j := strings.Index(chunk[len(brand):], other); j >= 0 {
			cand := len(brand) + j
			if cand < end {
				end = cand
			}
		}
	}
	chunk = chunk[:end]
	chunk = strings.TrimPrefix(chunk, brand)
	chunk = strings.TrimLeft(chunk, " ：:（( ")
	// strip trailing punctuation
	chunk = strings.TrimRight(chunk, " ；;、，,）) ")
	if chunk == "" {
		return nil
	}
	return SplitProjectNames(chunk)
}

// HospitalProjectItem is a flattened row for stats.
type HospitalProjectItem struct {
	HospitalId   int64
	Kind         string
	LineCategory string
	Brand        string
	Instrument   string
	ProjectName  string
	Meta         map[string]any
}

// ExtractProjectItems builds flattened rows from archive.
func ExtractProjectItems(hospitalID int64, archive map[string]any) []HospitalProjectItem {
	archive = NormalizeArchive(archive)
	out := make([]HospitalProjectItem, 0)

	for _, name := range ToStringSlice(archive["mindrayProjects"]) {
		out = append(out, HospitalProjectItem{
			HospitalId:  hospitalID,
			Kind:        "mindray",
			ProjectName: name,
			Meta:        map[string]any{},
		})
	}

	for _, item := range ToCompetitorList(archive["competitorProjectDistribution"]) {
		line, _ := item["line"].(string)
		brand, _ := item["brand"].(string)
		instrument, _ := item["instrument"].(string)
		note, _ := item["note"].(string)
		projects := ToStringSlice(item["projects"])
		if len(projects) == 0 {
			out = append(out, HospitalProjectItem{
				HospitalId:   hospitalID,
				Kind:         "competitor",
				LineCategory: line,
				Brand:        brand,
				Instrument:   instrument,
				ProjectName:  "",
				Meta:         map[string]any{"note": note},
			})
			continue
		}
		for _, p := range projects {
			out = append(out, HospitalProjectItem{
				HospitalId:   hospitalID,
				Kind:         "competitor",
				LineCategory: line,
				Brand:        brand,
				Instrument:   instrument,
				ProjectName:  p,
				Meta:         map[string]any{"note": note},
			})
		}
	}
	return out
}

// ReplaceProjectItems deletes old rows and inserts the extracted set.
func (m *hospitalModel) ReplaceProjectItems(ctx context.Context, hospitalID int64, archive map[string]any) error {
	if _, err := m.conn.Exec(ctx, `DELETE FROM hospital_project_items WHERE hospital_id=$1`, hospitalID); err != nil {
		return fmt.Errorf("delete project items: %w", err)
	}
	items := ExtractProjectItems(hospitalID, archive)
	for _, it := range items {
		meta, err := json.Marshal(it.Meta)
		if err != nil {
			meta = []byte("{}")
		}
		if _, err := m.conn.Exec(ctx, `
			INSERT INTO hospital_project_items
				(hospital_id, kind, line_category, brand, instrument, project_name, meta)
			VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
			hospitalID, it.Kind, it.LineCategory, it.Brand, it.Instrument, it.ProjectName, meta,
		); err != nil {
			return fmt.Errorf("insert project item: %w", err)
		}
	}
	return nil
}
