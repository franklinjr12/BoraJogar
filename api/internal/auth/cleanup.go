package auth

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

func CleanupExpiredSessions(ctx context.Context, db *pgxpool.Pool) (int64, error) {
	result, err := db.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected(), nil
}
