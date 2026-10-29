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
