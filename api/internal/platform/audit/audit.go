package audit

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

type Execer interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

const (
	UserDisabled       = "user_disabled"
	UserReEnabled      = "user_re_enabled"
	VenueApproved      = "venue_approved"
	VenueRejected      = "venue_rejected"
	ProposalCancelled  = "proposal_cancelled_by_admin"
	ReportResolved     = "report_resolved"
	InvitationCreated  = "invitation_created"
	InvitationDisabled = "invitation_disabled"
)

func Record(ctx context.Context, db Execer, actorID uuid.UUID, action string, targetType string, targetID uuid.UUID, details map[string]string) error {
	if details == nil {
		details = map[string]string{}
	}
	payload, err := json.Marshal(details)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5,$6)`, uuid.New(), actorID, action, targetType, targetID, payload)
	return err
}
