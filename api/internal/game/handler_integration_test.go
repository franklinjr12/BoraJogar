//go:build integration

package game

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type gameFixture struct {
	db         *pgxpool.Pool
	h          *Handler
	organizer  auth.User
	player     auth.User
	waitlisted auth.User
	gameID     uuid.UUID
}

func integrationGameFixture(t *testing.T) gameFixture {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is required for integration tests")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err = db.Ping(context.Background()); err != nil {
		db.Close()
		t.Fatal(err)
	}
	users := []auth.User{{ID: uuid.New()}, {ID: uuid.New()}, {ID: uuid.New()}}
	for i := range users {
		if _, err = db.Exec(context.Background(), `INSERT INTO users(id,google_subject,email,display_name) VALUES($1,$2,$3,$4)`, users[i].ID, "game-test-"+users[i].ID.String(), users[i].ID.String()+"@example.com", "Game Test"); err != nil {
			db.Close()
			t.Fatal(err)
		}
		if _, err = db.Exec(context.Background(), `INSERT INTO player_profiles(user_id,skill_level) VALUES($1,'beginner')`, users[i].ID); err != nil {
			db.Close()
			t.Fatal(err)
		}
	}
	venueID := uuid.New()
	if _, err = db.Exec(context.Background(), `INSERT INTO venues(id,name,city,location,active,approved_at) VALUES($1,'Game Test Court','Curitiba',ST_SetSRID(ST_MakePoint(-49.27,-25.43),4326)::geography,true,now())`, venueID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	gameID := uuid.New()
	if _, err = db.Exec(context.Background(), `INSERT INTO games(id,source_type,created_by_user_id,starts_at,ends_at,venue_id,capacity,minimum_skill_level,maximum_skill_level,visibility) VALUES($1,'manual',$2,$3,$4,$5,2,'learning','advanced','public')`, gameID, users[0].ID, time.Now().UTC().Add(24*time.Hour), time.Now().UTC().Add(25*time.Hour), venueID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if _, err = db.Exec(context.Background(), `INSERT INTO game_players(game_id,user_id,role,status,attendance_status) VALUES($1,$2,'organizer','confirmed','unknown'),($1,$3,'player','confirmed','unknown')`, gameID, users[0].ID, users[1].ID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if _, err = db.Exec(context.Background(), `INSERT INTO game_waitlist(game_id,user_id,position) VALUES($1,$2,1)`, gameID, users[2].ID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(context.Background(), `DELETE FROM games WHERE id=$1`, gameID)
		_, _ = db.Exec(context.Background(), `DELETE FROM venues WHERE id=$1`, venueID)
		for _, user := range users {
			_, _ = db.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID)
		}
		db.Close()
	})
	return gameFixture{
		db:         db,
		h:          &Handler{DB: db},
		organizer:  users[0],
		player:     users[1],
		waitlisted: users[2],
		gameID:     gameID,
	}
}

func gameIntegrationRequest(method, path string, user auth.User) *http.Request {
	return httptest.NewRequest(method, path, strings.NewReader("")).WithContext(auth.WithUserContext(context.Background(), user))
}

func TestRemovePlayerIntegrationPromotesWaitlistAndNotifies(t *testing.T) {
	fixture := integrationGameFixture(t)
	publisher := &recordingPublisher{}
	fixture.h.Notifications = publisher
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodDelete, "/api/v1/games/"+fixture.gameID.String()+"/players/"+fixture.player.ID.String(), fixture.organizer))
	if w.Code != http.StatusOK {
		t.Fatalf("remove status = %d, body=%s", w.Code, w.Body.String())
	}
	var removed, promoted string
	if err := fixture.db.QueryRow(context.Background(), `SELECT (SELECT status FROM game_players WHERE game_id=$1 AND user_id=$2),(SELECT status FROM game_players WHERE game_id=$1 AND user_id=$3)`, fixture.gameID, fixture.player.ID, fixture.waitlisted.ID).Scan(&removed, &promoted); err != nil {
		t.Fatal(err)
	}
	if removed != "removed" || promoted != "confirmed" {
		t.Fatalf("statuses = removed:%s promoted:%s", removed, promoted)
	}
	if len(publisher.events) != 2 || publisher.events[0].UserID != fixture.player.ID || publisher.events[1].UserID != fixture.waitlisted.ID {
		t.Fatalf("notifications = %+v", publisher.events)
	}

	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodDelete, "/api/v1/games/"+fixture.gameID.String()+"/players/"+fixture.organizer.ID.String(), fixture.waitlisted))
	if w.Code != http.StatusForbidden {
		t.Fatalf("non-organizer remove status = %d", w.Code)
	}
}

func TestCancelIntegrationClearsWaitlistAndNotifiesOtherPlayers(t *testing.T) {
	fixture := integrationGameFixture(t)
	publisher := &recordingPublisher{}
	fixture.h.Notifications = publisher
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/cancel", fixture.organizer))
	if w.Code != http.StatusNoContent {
		t.Fatalf("cancel status = %d, body=%s", w.Code, w.Body.String())
	}
	var status string
	var waitlistCount int
	if err := fixture.db.QueryRow(context.Background(), `SELECT status FROM games WHERE id=$1`, fixture.gameID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM game_waitlist WHERE game_id=$1`, fixture.gameID).Scan(&waitlistCount); err != nil {
		t.Fatal(err)
	}
	if status != "cancelled" || waitlistCount != 0 || len(publisher.events) != 2 {
		t.Fatalf("status=%s waitlist=%d notifications=%d", status, waitlistCount, len(publisher.events))
	}
	if publisher.events[0].Type != notification.GameCancelled || publisher.events[1].Type != notification.GameCancelled {
		t.Fatalf("notifications = %+v", publisher.events)
	}
	for _, event := range publisher.events {
		payload, ok := event.Payload.(notification.GameCancellationPayload)
		if !ok || payload.GameID != fixture.gameID.String() || payload.VenueName != "Game Test Court" || payload.StartsAt.IsZero() || payload.EndsAt.IsZero() {
			t.Fatalf("cancellation payload = %#v", event.Payload)
		}
		if event.ActionURL != "/games/"+fixture.gameID.String() {
			t.Fatalf("action URL = %q", event.ActionURL)
		}
	}
}
