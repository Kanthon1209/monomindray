package model

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SurveyTemplate struct {
	Id          int64
	Code        string
	Title       string
	Description string
	Schema      json.RawMessage
	Version     int
	Status      string
	CreatedBy   *int64
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type SurveyCampaign struct {
	Id           int64
	TemplateId   int64
	Title        string
	Description  string
	DueAt        *time.Time
	Status       string
	CreatedBy    *int64
	CreatedAt    time.Time
	UpdatedAt    time.Time
	TemplateCode string
	TemplateTitle string
	AssignmentCount int
}

type SurveyAssignment struct {
	Id             int64
	CampaignId     int64
	AssigneeId     int64
	Status         string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CampaignTitle  string
	CampaignStatus string
	DueAt          *time.Time
	AssigneeName   string
	AssigneeEmail  string
	TemplateId     int64
	TemplateCode   string
	TemplateTitle  string
	Schema         json.RawMessage
	SubmissionId   *int64
	SubmissionStatus string
}

type SurveySubmission struct {
	Id             int64
	AssignmentId   int64
	HospitalId     *int64
	Answers        map[string]string
	Status         string
	CollectedBy    *int64
	SubmittedAt    *time.Time
	ReviewedBy     *int64
	ReviewedAt     *time.Time
	ReviewNote     string
	CreatedAt      time.Time
	UpdatedAt      time.Time
	CampaignTitle  string
	AssigneeName   string
	AssigneeEmail  string
	CollectorName  string
}

type SurveyCampaignFilter struct {
	Status string
	Limit  int
	Offset int
}

type SurveyAssignmentFilter struct {
	AssigneeId int64
	Status     string
	Limit      int
	Offset     int
}

type SurveySubmissionFilter struct {
	Status string
	Limit  int
	Offset int
}

type SurveyModel interface {
	ListTemplates(ctx context.Context, activeOnly bool) ([]SurveyTemplate, error)
	FindTemplateById(ctx context.Context, id int64) (*SurveyTemplate, error)

	CreateCampaignWithAssignments(ctx context.Context, c *SurveyCampaign, assigneeIDs []int64) (int64, error)
	ListCampaigns(ctx context.Context, f SurveyCampaignFilter) ([]SurveyCampaign, int64, error)
	FindCampaignById(ctx context.Context, id int64) (*SurveyCampaign, error)
	ListAssignmentsByCampaign(ctx context.Context, campaignID int64) ([]SurveyAssignment, error)
	CloseCampaign(ctx context.Context, id int64) error

	ListAssignments(ctx context.Context, f SurveyAssignmentFilter) ([]SurveyAssignment, int64, error)
	FindAssignmentById(ctx context.Context, id int64) (*SurveyAssignment, error)
	UpdateAssignmentStatus(ctx context.Context, id int64, status string) error

	FindSubmissionByAssignment(ctx context.Context, assignmentID int64) (*SurveySubmission, error)
	UpsertDraft(ctx context.Context, assignmentID, collectorID int64, answers map[string]string, hospitalID *int64) (*SurveySubmission, error)
	Submit(ctx context.Context, assignmentID, collectorID int64, answers map[string]string, hospitalID *int64) (*SurveySubmission, error)
	ListSubmissions(ctx context.Context, f SurveySubmissionFilter) ([]SurveySubmission, int64, error)
	FindSubmissionById(ctx context.Context, id int64) (*SurveySubmission, error)
	ReviewSubmission(ctx context.Context, id, reviewerID int64, status, note string) error
	SetSubmissionHospital(ctx context.Context, submissionID, hospitalID int64) error
}

type surveyModel struct{ conn *pgxpool.Pool }

func NewSurveyModel(conn *pgxpool.Pool) SurveyModel {
	return &surveyModel{conn: conn}
}

func (m *surveyModel) ListTemplates(ctx context.Context, activeOnly bool) ([]SurveyTemplate, error) {
	q := `
		SELECT id, code, title, description, schema, version, status, created_by, created_at, updated_at
		FROM survey_templates`
	args := []any{}
	if activeOnly {
		q += ` WHERE status = 'active'`
	}
	q += ` ORDER BY id`
	rows, err := m.conn.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]SurveyTemplate, 0)
	for rows.Next() {
		t, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func (m *surveyModel) FindTemplateById(ctx context.Context, id int64) (*SurveyTemplate, error) {
	row := m.conn.QueryRow(ctx, `
		SELECT id, code, title, description, schema, version, status, created_by, created_at, updated_at
		FROM survey_templates WHERE id=$1`, id)
	return scanTemplate(row)
}

func scanTemplate(row pgx.Row) (*SurveyTemplate, error) {
	var t SurveyTemplate
	var schema []byte
	err := row.Scan(&t.Id, &t.Code, &t.Title, &t.Description, &schema, &t.Version, &t.Status, &t.CreatedBy, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	t.Schema = json.RawMessage(schema)
	return &t, nil
}

func (m *surveyModel) CreateCampaignWithAssignments(ctx context.Context, c *SurveyCampaign, assigneeIDs []int64) (int64, error) {
	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO survey_campaigns (template_id, title, description, due_at, status, created_by)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		c.TemplateId, c.Title, c.Description, c.DueAt, c.Status, c.CreatedBy,
	).Scan(&id)
	if err != nil {
		return 0, err
	}
	for _, uid := range assigneeIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO survey_assignments (campaign_id, assignee_id, status)
			VALUES ($1,$2,'todo')
			ON CONFLICT (campaign_id, assignee_id) DO NOTHING`, id, uid); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return id, nil
}

func (m *surveyModel) ListCampaigns(ctx context.Context, f SurveyCampaignFilter) ([]SurveyCampaign, int64, error) {
	limit, offset := pageBounds(f.Limit, f.Offset)
	where := []string{"1=1"}
	args := []any{}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("c.status=$%d", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(*) FROM survey_campaigns c WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := m.conn.Query(ctx, fmt.Sprintf(`
		SELECT c.id, c.template_id, c.title, c.description, c.due_at, c.status, c.created_by, c.created_at, c.updated_at,
		       COALESCE(t.code,''), COALESCE(t.title,''),
		       (SELECT COUNT(*)::INT FROM survey_assignments a WHERE a.campaign_id = c.id)
		FROM survey_campaigns c
		LEFT JOIN survey_templates t ON t.id = c.template_id
		WHERE %s
		ORDER BY c.id DESC
		LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]SurveyCampaign, 0)
	for rows.Next() {
		var c SurveyCampaign
		if err := rows.Scan(
			&c.Id, &c.TemplateId, &c.Title, &c.Description, &c.DueAt, &c.Status, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt,
			&c.TemplateCode, &c.TemplateTitle, &c.AssignmentCount,
		); err != nil {
			return nil, 0, err
		}
		items = append(items, c)
	}
	return items, total, rows.Err()
}

func (m *surveyModel) FindCampaignById(ctx context.Context, id int64) (*SurveyCampaign, error) {
	var c SurveyCampaign
	err := m.conn.QueryRow(ctx, `
		SELECT c.id, c.template_id, c.title, c.description, c.due_at, c.status, c.created_by, c.created_at, c.updated_at,
		       COALESCE(t.code,''), COALESCE(t.title,''),
		       (SELECT COUNT(*)::INT FROM survey_assignments a WHERE a.campaign_id = c.id)
		FROM survey_campaigns c
		LEFT JOIN survey_templates t ON t.id = c.template_id
		WHERE c.id=$1`, id).Scan(
		&c.Id, &c.TemplateId, &c.Title, &c.Description, &c.DueAt, &c.Status, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt,
		&c.TemplateCode, &c.TemplateTitle, &c.AssignmentCount,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func (m *surveyModel) ListAssignmentsByCampaign(ctx context.Context, campaignID int64) ([]SurveyAssignment, error) {
	rows, err := m.conn.Query(ctx, `
		SELECT a.id, a.campaign_id, a.assignee_id, a.status, a.created_at, a.updated_at,
		       COALESCE(u.name,''), COALESCE(u.email,''),
		       COALESCE(s.id, 0), COALESCE(s.status, '')
		FROM survey_assignments a
		LEFT JOIN users u ON u.id = a.assignee_id
		LEFT JOIN survey_submissions s ON s.assignment_id = a.id
		WHERE a.campaign_id=$1
		ORDER BY a.id`, campaignID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]SurveyAssignment, 0)
	for rows.Next() {
		var a SurveyAssignment
		var subID int64
		var subStatus string
		if err := rows.Scan(
			&a.Id, &a.CampaignId, &a.AssigneeId, &a.Status, &a.CreatedAt, &a.UpdatedAt,
			&a.AssigneeName, &a.AssigneeEmail, &subID, &subStatus,
		); err != nil {
			return nil, err
		}
		if subID > 0 {
			a.SubmissionId = &subID
			a.SubmissionStatus = subStatus
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (m *surveyModel) CloseCampaign(ctx context.Context, id int64) error {
	ct, err := m.conn.Exec(ctx, `UPDATE survey_campaigns SET status='closed' WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (m *surveyModel) ListAssignments(ctx context.Context, f SurveyAssignmentFilter) ([]SurveyAssignment, int64, error) {
	limit, offset := pageBounds(f.Limit, f.Offset)
	where := []string{"1=1"}
	args := []any{}
	if f.AssigneeId > 0 {
		args = append(args, f.AssigneeId)
		where = append(where, fmt.Sprintf("a.assignee_id=$%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("a.status=$%d", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(*) FROM survey_assignments a WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := m.conn.Query(ctx, fmt.Sprintf(`
		SELECT a.id, a.campaign_id, a.assignee_id, a.status, a.created_at, a.updated_at,
		       COALESCE(c.title,''), COALESCE(c.status,''), c.due_at,
		       COALESCE(u.name,''), COALESCE(u.email,''),
		       COALESCE(t.id,0), COALESCE(t.code,''), COALESCE(t.title,''), COALESCE(t.schema, '{}'::jsonb),
		       s.id, COALESCE(s.status,'')
		FROM survey_assignments a
		JOIN survey_campaigns c ON c.id = a.campaign_id
		JOIN survey_templates t ON t.id = c.template_id
		LEFT JOIN users u ON u.id = a.assignee_id
		LEFT JOIN survey_submissions s ON s.assignment_id = a.id
		WHERE %s
		ORDER BY a.id DESC
		LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]SurveyAssignment, 0)
	for rows.Next() {
		var a SurveyAssignment
		var schema []byte
		var subID *int64
		if err := rows.Scan(
			&a.Id, &a.CampaignId, &a.AssigneeId, &a.Status, &a.CreatedAt, &a.UpdatedAt,
			&a.CampaignTitle, &a.CampaignStatus, &a.DueAt,
			&a.AssigneeName, &a.AssigneeEmail,
			&a.TemplateId, &a.TemplateCode, &a.TemplateTitle, &schema,
			&subID, &a.SubmissionStatus,
		); err != nil {
			return nil, 0, err
		}
		a.Schema = json.RawMessage(schema)
		a.SubmissionId = subID
		items = append(items, a)
	}
	return items, total, rows.Err()
}

func (m *surveyModel) FindAssignmentById(ctx context.Context, id int64) (*SurveyAssignment, error) {
	var a SurveyAssignment
	var schema []byte
	var subID *int64
	err := m.conn.QueryRow(ctx, `
		SELECT a.id, a.campaign_id, a.assignee_id, a.status, a.created_at, a.updated_at,
		       COALESCE(c.title,''), COALESCE(c.status,''), c.due_at,
		       COALESCE(u.name,''), COALESCE(u.email,''),
		       COALESCE(t.id,0), COALESCE(t.code,''), COALESCE(t.title,''), COALESCE(t.schema, '{}'::jsonb),
		       s.id, COALESCE(s.status,'')
		FROM survey_assignments a
		JOIN survey_campaigns c ON c.id = a.campaign_id
		JOIN survey_templates t ON t.id = c.template_id
		LEFT JOIN users u ON u.id = a.assignee_id
		LEFT JOIN survey_submissions s ON s.assignment_id = a.id
		WHERE a.id=$1`, id).Scan(
		&a.Id, &a.CampaignId, &a.AssigneeId, &a.Status, &a.CreatedAt, &a.UpdatedAt,
		&a.CampaignTitle, &a.CampaignStatus, &a.DueAt,
		&a.AssigneeName, &a.AssigneeEmail,
		&a.TemplateId, &a.TemplateCode, &a.TemplateTitle, &schema,
		&subID, &a.SubmissionStatus,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	a.Schema = json.RawMessage(schema)
	a.SubmissionId = subID
	return &a, nil
}

func (m *surveyModel) UpdateAssignmentStatus(ctx context.Context, id int64, status string) error {
	_, err := m.conn.Exec(ctx, `UPDATE survey_assignments SET status=$1 WHERE id=$2`, status, id)
	return err
}

func decodeAnswers(raw []byte) (map[string]string, error) {
	out := map[string]string{}
	if len(raw) == 0 {
		return out, nil
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		// tolerate non-string values by decoding to map[string]any
		generic := map[string]any{}
		if err2 := json.Unmarshal(raw, &generic); err2 != nil {
			return nil, err
		}
		for k, v := range generic {
			out[k] = fmt.Sprint(v)
		}
	}
	return out, nil
}

func (m *surveyModel) FindSubmissionByAssignment(ctx context.Context, assignmentID int64) (*SurveySubmission, error) {
	return m.scanSubmission(m.conn.QueryRow(ctx, `
		SELECT s.id, s.assignment_id, s.hospital_id, s.answers, s.status, s.collected_by, s.submitted_at,
		       s.reviewed_by, s.reviewed_at, s.review_note, s.created_at, s.updated_at,
		       COALESCE(c.title,''), COALESCE(u.name,''), COALESCE(u.email,''), COALESCE(cu.name,'')
		FROM survey_submissions s
		JOIN survey_assignments a ON a.id = s.assignment_id
		JOIN survey_campaigns c ON c.id = a.campaign_id
		LEFT JOIN users u ON u.id = a.assignee_id
		LEFT JOIN users cu ON cu.id = s.collected_by
		WHERE s.assignment_id=$1`, assignmentID))
}

func (m *surveyModel) FindSubmissionById(ctx context.Context, id int64) (*SurveySubmission, error) {
	return m.scanSubmission(m.conn.QueryRow(ctx, `
		SELECT s.id, s.assignment_id, s.hospital_id, s.answers, s.status, s.collected_by, s.submitted_at,
		       s.reviewed_by, s.reviewed_at, s.review_note, s.created_at, s.updated_at,
		       COALESCE(c.title,''), COALESCE(u.name,''), COALESCE(u.email,''), COALESCE(cu.name,'')
		FROM survey_submissions s
		JOIN survey_assignments a ON a.id = s.assignment_id
		JOIN survey_campaigns c ON c.id = a.campaign_id
		LEFT JOIN users u ON u.id = a.assignee_id
		LEFT JOIN users cu ON cu.id = s.collected_by
		WHERE s.id=$1`, id))
}

func (m *surveyModel) scanSubmission(row pgx.Row) (*SurveySubmission, error) {
	var s SurveySubmission
	var answersRaw []byte
	err := row.Scan(
		&s.Id, &s.AssignmentId, &s.HospitalId, &answersRaw, &s.Status, &s.CollectedBy, &s.SubmittedAt,
		&s.ReviewedBy, &s.ReviewedAt, &s.ReviewNote, &s.CreatedAt, &s.UpdatedAt,
		&s.CampaignTitle, &s.AssigneeName, &s.AssigneeEmail, &s.CollectorName,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	answers, err := decodeAnswers(answersRaw)
	if err != nil {
		return nil, err
	}
	s.Answers = answers
	return &s, nil
}

func (m *surveyModel) UpsertDraft(ctx context.Context, assignmentID, collectorID int64, answers map[string]string, hospitalID *int64) (*SurveySubmission, error) {
	raw, err := json.Marshal(answers)
	if err != nil {
		return nil, err
	}
	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO survey_submissions (assignment_id, hospital_id, answers, status, collected_by)
		VALUES ($1,$2,$3::jsonb,'draft',$4)
		ON CONFLICT (assignment_id) DO UPDATE SET
			hospital_id = EXCLUDED.hospital_id,
			answers = EXCLUDED.answers,
			status = CASE
				WHEN survey_submissions.status IN ('submitted','approved') THEN survey_submissions.status
				ELSE 'draft'
			END,
			collected_by = EXCLUDED.collected_by,
			updated_at = NOW()
		WHERE survey_submissions.status IN ('draft','rejected')
		RETURNING id`, assignmentID, hospitalID, raw, collectorID).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("submission locked")
		}
		return nil, err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE survey_assignments SET status='in_progress'
		WHERE id=$1 AND status IN ('todo','in_progress')`, assignmentID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return m.FindSubmissionById(ctx, id)
}

func (m *surveyModel) Submit(ctx context.Context, assignmentID, collectorID int64, answers map[string]string, hospitalID *int64) (*SurveySubmission, error) {
	raw, err := json.Marshal(answers)
	if err != nil {
		return nil, err
	}
	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO survey_submissions (assignment_id, hospital_id, answers, status, collected_by, submitted_at)
		VALUES ($1,$2,$3::jsonb,'submitted',$4,NOW())
		ON CONFLICT (assignment_id) DO UPDATE SET
			hospital_id = EXCLUDED.hospital_id,
			answers = EXCLUDED.answers,
			status = 'submitted',
			collected_by = EXCLUDED.collected_by,
			submitted_at = NOW(),
			reviewed_by = NULL,
			reviewed_at = NULL,
			review_note = '',
			updated_at = NOW()
		WHERE survey_submissions.status IN ('draft','rejected','submitted')
		RETURNING id`, assignmentID, hospitalID, raw, collectorID).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("submission locked")
		}
		return nil, err
	}
	if _, err := tx.Exec(ctx, `UPDATE survey_assignments SET status='submitted' WHERE id=$1`, assignmentID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return m.FindSubmissionById(ctx, id)
}

func (m *surveyModel) ListSubmissions(ctx context.Context, f SurveySubmissionFilter) ([]SurveySubmission, int64, error) {
	limit, offset := pageBounds(f.Limit, f.Offset)
	where := []string{"1=1"}
	args := []any{}
	if f.Status != "" {
		args = append(args, f.Status)
		where = append(where, fmt.Sprintf("s.status=$%d", len(args)))
	}
	whereSQL := strings.Join(where, " AND ")

	var total int64
	if err := m.conn.QueryRow(ctx, `SELECT COUNT(*) FROM survey_submissions s WHERE `+whereSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := m.conn.Query(ctx, fmt.Sprintf(`
		SELECT s.id, s.assignment_id, s.hospital_id, s.answers, s.status, s.collected_by, s.submitted_at,
		       s.reviewed_by, s.reviewed_at, s.review_note, s.created_at, s.updated_at,
		       COALESCE(c.title,''), COALESCE(u.name,''), COALESCE(u.email,''), COALESCE(cu.name,'')
		FROM survey_submissions s
		JOIN survey_assignments a ON a.id = s.assignment_id
		JOIN survey_campaigns c ON c.id = a.campaign_id
		LEFT JOIN users u ON u.id = a.assignee_id
		LEFT JOIN users cu ON cu.id = s.collected_by
		WHERE %s
		ORDER BY s.submitted_at DESC NULLS LAST, s.id DESC
		LIMIT $%d OFFSET $%d`, whereSQL, len(args)-1, len(args)), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	items := make([]SurveySubmission, 0)
	for rows.Next() {
		var s SurveySubmission
		var answersRaw []byte
		if err := rows.Scan(
			&s.Id, &s.AssignmentId, &s.HospitalId, &answersRaw, &s.Status, &s.CollectedBy, &s.SubmittedAt,
			&s.ReviewedBy, &s.ReviewedAt, &s.ReviewNote, &s.CreatedAt, &s.UpdatedAt,
			&s.CampaignTitle, &s.AssigneeName, &s.AssigneeEmail, &s.CollectorName,
		); err != nil {
			return nil, 0, err
		}
		answers, err := decodeAnswers(answersRaw)
		if err != nil {
			return nil, 0, err
		}
		s.Answers = answers
		items = append(items, s)
	}
	return items, total, rows.Err()
}

func (m *surveyModel) ReviewSubmission(ctx context.Context, id, reviewerID int64, status, note string) error {
	tx, err := m.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var assignmentID int64
	err = tx.QueryRow(ctx, `
		UPDATE survey_submissions
		SET status=$1, reviewed_by=$2, reviewed_at=NOW(), review_note=$3, updated_at=NOW()
		WHERE id=$4 AND status='submitted'
		RETURNING assignment_id`, status, reviewerID, note, id).Scan(&assignmentID)
	if err != nil {
		return err
	}

	if status == "rejected" {
		// Allow collector to edit again; keep review_note for feedback.
		if _, err := tx.Exec(ctx, `
			UPDATE survey_submissions SET status='draft' WHERE id=$1`, id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE survey_assignments SET status='in_progress' WHERE id=$1`, assignmentID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (m *surveyModel) SetSubmissionHospital(ctx context.Context, submissionID, hospitalID int64) error {
	_, err := m.conn.Exec(ctx, `
		UPDATE survey_submissions SET hospital_id=$1, updated_at=NOW() WHERE id=$2`, hospitalID, submissionID)
	return err
}
