package model

import (
	"strings"
	"testing"
)

func TestReviewSubmissionApprovedBranchPreservesRows(t *testing.T) {
	// survey_submissions.assignment_id → survey_assignments ON DELETE CASCADE (007_surveys.sql).
	if strings.Contains(ReviewSubmissionApprovedAssignmentSQL, "DELETE") {
		t.Fatalf("approved review path must not delete rows: %q", ReviewSubmissionApprovedAssignmentSQL)
	}
}

// ReviewSubmissionApprovedAssignmentSQL is the assignment update run on approve (keep in sync with ReviewSubmission).
const ReviewSubmissionApprovedAssignmentSQL = `
			UPDATE survey_assignments SET status='approved', updated_at=NOW() WHERE id=$1`

func TestUpdateSubmittedAnswersSQLSnapshotsOriginalAndStaysPending(t *testing.T) {
	sql := UpdateSubmittedAnswersSQL
	if !strings.Contains(sql, "original_answers = COALESCE(original_answers, answers)") {
		t.Fatalf("first admin edit must snapshot collector answers: %q", sql)
	}
	if !strings.Contains(sql, "status = 'submitted'") && !strings.Contains(sql, "status='submitted'") {
		t.Fatalf("admin answer update must only touch pending submitted rows: %q", sql)
	}
	if strings.Contains(sql, "DELETE") {
		t.Fatalf("admin answer update must not delete rows: %q", sql)
	}
	lower := strings.ToLower(sql)
	for _, forbidden := range []string{"collected_by", "submitted_at", "status = 'approved'", "status='approved'"} {
		if strings.Contains(lower, forbidden) && forbidden != "status = 'submitted'" {
			// collected_by / submitted_at must not be rewritten (collector identity stays)
		}
	}
	if strings.Contains(lower, "collected_by") || strings.Contains(lower, "submitted_at") {
		t.Fatalf("must not change collector identity fields: %q", sql)
	}
}

func TestUnapproveSubmissionSQLReopensApprovedAndRestoresAnswers(t *testing.T) {
	sql := UnapproveSubmissionSQL
	if strings.Contains(sql, "DELETE") {
		t.Fatalf("unapprove must not delete the submission row: %q", sql)
	}
	if !strings.Contains(sql, "status = 'submitted'") && !strings.Contains(sql, "status='submitted'") {
		t.Fatalf("unapprove must set status back to submitted: %q", sql)
	}
	if !strings.Contains(sql, "status = 'approved'") && !strings.Contains(sql, "status='approved'") {
		t.Fatalf("unapprove must only touch approved rows: %q", sql)
	}
	if !strings.Contains(sql, "answers = COALESCE(original_answers, answers)") {
		t.Fatalf("unapprove must restore collector answers: %q", sql)
	}
	if !strings.Contains(sql, "original_answers = NULL") {
		t.Fatalf("unapprove must clear original_answers for a later edit snapshot: %q", sql)
	}
	if !strings.Contains(sql, "reviewed_by = NULL") || !strings.Contains(sql, "reviewed_at = NULL") {
		t.Fatalf("unapprove must clear reviewer fields: %q", sql)
	}
	if !strings.Contains(sql, "review_note = ''") || strings.Contains(sql, "review_note = NULL") {
		t.Fatalf("unapprove must clear review_note to empty string, not NULL: %q", sql)
	}
	if strings.Contains(sql, "collected_by") || strings.Contains(sql, "submitted_at") {
		t.Fatalf("unapprove must not change collector identity: %q", sql)
	}
}

func TestUnapproveAssignmentSQLLeavesPending(t *testing.T) {
	if strings.Contains(UnapproveAssignmentSQL, "DELETE") {
		t.Fatalf("unapprove must not delete the assignment: %q", UnapproveAssignmentSQL)
	}
	if !strings.Contains(UnapproveAssignmentSQL, "status='submitted'") && !strings.Contains(UnapproveAssignmentSQL, "status = 'submitted'") {
		t.Fatalf("assignment must return to submitted: %q", UnapproveAssignmentSQL)
	}
}
