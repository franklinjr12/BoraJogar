package availability

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ExpandFuture replaces generated future rows in one transaction. Re-running is safe.
func ExpandFuture(ctx context.Context, db *pgxpool.Pool, now time.Time) error {
	from := now.UTC().Truncate(24 * time.Hour)
	to := from.AddDate(0, 0, 21)
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `DELETE FROM availability_occurrences WHERE starts_at >= $1`, from); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT id,user_id,weekday,to_char(start_local_time,'HH24:MI'),to_char(end_local_time,'HH24:MI'),timezone,valid_from,valid_until,active FROM availability_rules`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var rule Rule
		var fromDate time.Time
		if err = rows.Scan(&rule.ID, &rule.UserID, &rule.Weekday, &rule.Start, &rule.End, &rule.Timezone, &fromDate, &rule.ValidUntil, &rule.Active); err != nil {
			return err
		}
		rule.ValidFrom = fromDate
		if rule.VenueIDs, rule.AreaIDs, err = loadRuleLocations(ctx, tx, rule.ID); err != nil {
			return err
		}
		exceptions, queryErr := loadExceptions(ctx, tx, rule.UserID, from, to)
		if queryErr != nil {
			return queryErr
		}
		items, expandErr := Expand(rule, exceptions, from, to)
		if expandErr != nil {
			return expandErr
		}
		for _, item := range items {
			if _, err = tx.Exec(ctx, `INSERT INTO availability_occurrences(id,user_id,starts_at,ends_at,source_type,source_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, uuid.New(), rule.UserID, item.StartsAt, item.EndsAt, item.SourceType, item.SourceID); err != nil {
				return err
			}
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}
	rows.Close()
	exceptions, err := tx.Query(ctx, `SELECT id,user_id,exception_date,exception_type,COALESCE(to_char(start_local_time,'HH24:MI'),''),COALESCE(to_char(end_local_time,'HH24:MI'),''),timezone FROM availability_exceptions WHERE exception_type=$1 AND exception_date >= $2 AND exception_date < $3`, AvailableInterval, from, to)
	if err != nil {
		return err
	}
	defer exceptions.Close()
	for exceptions.Next() {
		var item Exception
		var userID string
		if err = exceptions.Scan(&item.ID, &userID, &item.Date, &item.Type, &item.Start, &item.End, &item.Timezone); err != nil {
			return err
		}
		occurrence, expandErr := ExpandAvailableException(item)
		if expandErr != nil {
			return expandErr
		}
		if _, err = tx.Exec(ctx, `INSERT INTO availability_occurrences(id,user_id,starts_at,ends_at,source_type,source_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, uuid.New(), userID, occurrence.StartsAt, occurrence.EndsAt, occurrence.SourceType, occurrence.SourceID); err != nil {
			return err
		}
	}
	if err = exceptions.Err(); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func loadRuleLocations(ctx context.Context, tx pgx.Tx, ruleID string) ([]string, []string, error) {
	rows, err := tx.Query(ctx, `SELECT venue_id::text,'' FROM availability_rule_venues WHERE availability_rule_id=$1 UNION ALL SELECT '',preferred_area_id::text FROM availability_rule_areas WHERE availability_rule_id=$1`, ruleID)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	venues := []string{}
	areas := []string{}
	for rows.Next() {
		var venue, area string
		if err = rows.Scan(&venue, &area); err != nil {
			return nil, nil, err
		}
		if venue != "" {
			venues = append(venues, venue)
		} else {
			areas = append(areas, area)
		}
	}
	return venues, areas, rows.Err()
}

func loadExceptions(ctx context.Context, tx pgx.Tx, userID string, from, to time.Time) ([]Exception, error) {
	rows, err := tx.Query(ctx, `SELECT id,exception_date,exception_type,COALESCE(to_char(start_local_time,'HH24:MI'),''),COALESCE(to_char(end_local_time,'HH24:MI'),''),timezone FROM availability_exceptions WHERE user_id=$1 AND exception_date >= $2 AND exception_date < $3`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Exception{}
	for rows.Next() {
		var item Exception
		if err := rows.Scan(&item.ID, &item.Date, &item.Type, &item.Start, &item.End, &item.Timezone); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
