//go:build integration

package game

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/notification"
)

func prepareConfirmationGame(t *testing.T, fixture gameFixture, now, startsAt, endsAt time.Time, enabled bool, status string) {
	t.Helper()
	if _, err := fixture.db.Exec(context.Background(), `UPDATE games SET confirmation_enabled=$1,starts_at=$2,ends_at=$3,status=$4 WHERE id=$5`, enabled, startsAt, endsAt, status, fixture.gameID); err != nil {
		t.Fatal(err)
	}
	fixture.h.Now = func() time.Time { return now }
	t.Cleanup(func() {
		_, _ = fixture.db.Exec(context.Background(), `DELETE FROM notification_events WHERE payload->>'gameId'=$1`, fixture.gameID.String())
	})
}

func TestConfirmationIntegrationAuthorizesPersistsAndExposesRosterState(t *testing.T) {
	fixture := integrationGameFixture(t)
	now := time.Now().UTC().Truncate(time.Microsecond)
	prepareConfirmationGame(t, fixture, now, now.Add(23*time.Hour), now.Add(24*time.Hour+30*time.Minute), true, "scheduled")

	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String(), fixture.player))
	if w.Code != http.StatusOK {
		t.Fatalf("details status = %d, body=%s", w.Code, w.Body.String())
	}
	var details gameDetails
	if err := json.Unmarshal(w.Body.Bytes(), &details); err != nil {
		t.Fatal(err)
	}
	if details.Confirmation == nil || !details.Confirmation.Enabled || details.Confirmation.ConfirmedCount != 0 || details.Confirmation.TotalPlayers != 2 {
		t.Fatalf("confirmation summary = %+v", details.Confirmation)
	}
	if len(details.Players) != 2 || len(details.Waitlist) != 2 {
		t.Fatalf("roster sizes = players:%d waitlist:%d", len(details.Players), len(details.Waitlist))
	}
	for _, player := range details.Players {
		if player.ConfirmationConfirmed == nil {
			t.Fatalf("missing confirmation state for roster player %+v", player)
		}
		if (player.ID == fixture.player.ID.String()) != player.IsCurrentUser {
			t.Fatalf("current user marker = %+v", player)
		}
	}
	for _, player := range details.Waitlist {
		if player.ConfirmationConfirmed != nil || player.IsCurrentUser {
			t.Fatalf("waitlist leaked confirmation state = %+v", player)
		}
	}

	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPut, "/api/v1/games/"+fixture.gameID.String()+"/confirmation", `{"confirmed":true}`, fixture.player))
	if w.Code != http.StatusNoContent {
		t.Fatalf("confirm status = %d, body=%s", w.Code, w.Body.String())
	}
	var confirmed bool
	var confirmedAt *time.Time
	if err := fixture.db.QueryRow(context.Background(), `SELECT confirmation_confirmed,confirmation_at FROM game_players WHERE game_id=$1 AND user_id=$2`, fixture.gameID, fixture.player.ID).Scan(&confirmed, &confirmedAt); err != nil {
		t.Fatal(err)
	}
	if !confirmed || confirmedAt == nil {
		t.Fatalf("persisted confirmation = %v at %v", confirmed, confirmedAt)
	}

	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String(), fixture.player))
	if w.Code != http.StatusOK {
		t.Fatalf("refetch status = %d, body=%s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &details); err != nil {
		t.Fatal(err)
	}
	if details.Confirmation == nil || details.Confirmation.ConfirmedCount != 1 {
		t.Fatalf("refetched confirmation summary = %+v", details.Confirmation)
	}

	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPut, "/api/v1/games/"+fixture.gameID.String()+"/confirmation", `{"confirmed":false}`, fixture.player))
	if w.Code != http.StatusNoContent {
		t.Fatalf("unconfirm status = %d, body=%s", w.Code, w.Body.String())
	}
	if err := fixture.db.QueryRow(context.Background(), `SELECT confirmation_confirmed,confirmation_at FROM game_players WHERE game_id=$1 AND user_id=$2`, fixture.gameID, fixture.player.ID).Scan(&confirmed, &confirmedAt); err != nil {
		t.Fatal(err)
	}
	if confirmed || confirmedAt != nil {
		t.Fatalf("cleared confirmation = %v at %v", confirmed, confirmedAt)
	}

	for _, user := range []struct {
		name        string
		requestUser auth.User
	}{
		{"waitlisted", fixture.waitlisted},
		{"outsider", fixture.outsider},
	} {
		w = httptest.NewRecorder()
		fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPut, "/api/v1/games/"+fixture.gameID.String()+"/confirmation", `{"confirmed":true}`, user.requestUser))
		if w.Code != http.StatusForbidden {
			t.Errorf("%s status = %d, body=%s", user.name, w.Code, w.Body.String())
		}
	}
}

func TestConfirmationIntegrationDefaultDisabledMatchHasNoConfirmationData(t *testing.T) {
	fixture := integrationGameFixture(t)
	now := time.Now().UTC().Truncate(time.Microsecond)
	fixture.h.Now = func() time.Time { return now }
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String(), fixture.player))
	if w.Code != http.StatusOK {
		t.Fatalf("details status = %d, body=%s", w.Code, w.Body.String())
	}
	var details gameDetails
	if err := json.Unmarshal(w.Body.Bytes(), &details); err != nil {
		t.Fatal(err)
	}
	if details.Confirmation == nil || details.Confirmation.Enabled {
		t.Fatalf("default confirmation = %+v", details.Confirmation)
	}
	for _, player := range details.Players {
		if player.ConfirmationConfirmed != nil {
			t.Fatalf("disabled game exposed player confirmation = %+v", player)
		}
	}
	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPut, "/api/v1/games/"+fixture.gameID.String()+"/confirmation", `{"confirmed":true}`, fixture.player))
	if w.Code != http.StatusConflict {
		t.Fatalf("disabled confirmation status = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestConfirmationIntegrationRejectsOutsideWindowAndClosedStates(t *testing.T) {
	fixture := integrationGameFixture(t)
	now := time.Now().UTC().Truncate(time.Microsecond)
	prepareConfirmationGame(t, fixture, now, now.Add(25*time.Hour), now.Add(26*time.Hour), true, "scheduled")
	path := "/api/v1/games/" + fixture.gameID.String() + "/confirmation"
	invalid := httptest.NewRecorder()
	fixture.h.gameByID(invalid, gameIntegrationRequestWithBody(http.MethodPut, path, `{}`, fixture.player))
	if invalid.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid input status = %d, body=%s", invalid.Code, invalid.Body.String())
	}
	put := func() int {
		w := httptest.NewRecorder()
		fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPut, path, `{"confirmed":true}`, fixture.player))
		return w.Code
	}
	if got := put(); got != http.StatusConflict {
		t.Fatalf("25-hour status = %d", got)
	}

	for _, test := range []struct {
		name     string
		startsAt time.Time
		endsAt   time.Time
		status   string
		enabled  bool
		wantCode int
	}{
		{"exactly 24 hours before", now.Add(24 * time.Hour), now.Add(25 * time.Hour), "scheduled", true, http.StatusNoContent},
		{"at start", now, now.Add(90 * time.Minute), "scheduled", true, http.StatusNoContent},
		{"at end", now.Add(-90 * time.Minute), now, "scheduled", true, http.StatusNoContent},
		{"after end", now.Add(-2 * time.Hour), now.Add(-time.Minute), "scheduled", true, http.StatusConflict},
		{"disabled", now.Add(23 * time.Hour), now.Add(24 * time.Hour), "scheduled", false, http.StatusConflict},
		{"cancelled", now.Add(23 * time.Hour), now.Add(24 * time.Hour), "cancelled", true, http.StatusConflict},
		{"completed", now.Add(23 * time.Hour), now.Add(24 * time.Hour), "completed", true, http.StatusConflict},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := fixture.db.Exec(context.Background(), `UPDATE game_players SET confirmation_confirmed=false,confirmation_at=NULL WHERE game_id=$1`, fixture.gameID); err != nil {
				t.Fatal(err)
			}
			if _, err := fixture.db.Exec(context.Background(), `UPDATE games SET confirmation_enabled=$1,starts_at=$2,ends_at=$3,status=$4 WHERE id=$5`, test.enabled, test.startsAt, test.endsAt, test.status, fixture.gameID); err != nil {
				t.Fatal(err)
			}
			if got := put(); got != test.wantCode {
				t.Fatalf("status = %d, want %d", got, test.wantCode)
			}
			if test.name == "exactly 24 hours before" {
				if got := put(); got != http.StatusNoContent {
					t.Fatalf("idempotent status = %d", got)
				}
			}
		})
	}
}

func TestConfirmationSchedulerIntegrationIsDeduplicatedAndExcludesWaitlist(t *testing.T) {
	fixture := integrationGameFixture(t)
	now := time.Now().UTC().Truncate(time.Microsecond)
	prepareConfirmationGame(t, fixture, now, now.Add(23*time.Hour), now.Add(24*time.Hour+30*time.Minute), true, "scheduled")
	service := notification.Service{DB: fixture.db}
	if _, err := SendDueConfirmationNotifications(context.Background(), fixture.db, service, now); err != nil {
		t.Fatal(err)
	}

	assertNotificationCounts := func(wantConfirmation, wantReminder int) {
		t.Helper()
		var confirmationCount, reminderCount, eventCount, deliveryCount, waitlistCount int
		if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FILTER (WHERE type='match_confirmation'),count(*) FILTER (WHERE type='game_reminder'),count(*) FROM notification_events WHERE payload->>'gameId'=$1`, fixture.gameID.String()).Scan(&confirmationCount, &reminderCount, &eventCount); err != nil {
			t.Fatal(err)
		}
		if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM notification_deliveries d JOIN notification_events e ON e.id=d.notification_event_id WHERE e.payload->>'gameId'=$1`, fixture.gameID.String()).Scan(&deliveryCount); err != nil {
			t.Fatal(err)
		}
		if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM notification_events WHERE payload->>'gameId'=$1 AND user_id IN ($2,$3)`, fixture.gameID.String(), fixture.waitlisted.ID, fixture.secondWaitlisted.ID).Scan(&waitlistCount); err != nil {
			t.Fatal(err)
		}
		if confirmationCount != wantConfirmation || reminderCount != wantReminder || eventCount != wantConfirmation+wantReminder || deliveryCount != (wantConfirmation+wantReminder)*2 || waitlistCount != 0 {
			t.Fatalf("events confirmation=%d reminder=%d events=%d deliveries=%d waitlist=%d", confirmationCount, reminderCount, eventCount, deliveryCount, waitlistCount)
		}
	}
	assertNotificationCounts(2, 0)

	if _, err := fixture.db.Exec(context.Background(), `UPDATE games SET starts_at=$1,ends_at=$2 WHERE id=$3`, now.Add(30*time.Minute), now.Add(90*time.Minute), fixture.gameID); err != nil {
		t.Fatal(err)
	}
	var group sync.WaitGroup
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			if _, err := SendDueConfirmationNotifications(context.Background(), fixture.db, service, now); err != nil {
				t.Errorf("scheduler error: %v", err)
			}
		}()
	}
	group.Wait()
	assertNotificationCounts(2, 2)

	var inApp, email int
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FILTER (WHERE d.channel='in_app'),count(*) FILTER (WHERE d.channel='email') FROM notification_deliveries d JOIN notification_events e ON e.id=d.notification_event_id WHERE e.payload->>'gameId'=$1`, fixture.gameID.String()).Scan(&inApp, &email); err != nil {
		t.Fatal(err)
	}
	if inApp != 4 || email != 4 {
		t.Fatalf("delivery channels in_app=%d email=%d", inApp, email)
	}
	if _, err := fixture.db.Exec(context.Background(), `UPDATE notification_deliveries AS d SET status='delivered',delivered_at=now() FROM notification_events AS e WHERE d.notification_event_id=e.id AND e.payload->>'gameId'=$1`, fixture.gameID.String()); err != nil {
		t.Fatal(err)
	}
}

func TestConfirmationSchedulerIntegrationCancellationDisablesPendingDeliveries(t *testing.T) {
	fixture := integrationGameFixture(t)
	now := time.Now().UTC().Truncate(time.Microsecond)
	prepareConfirmationGame(t, fixture, now, now.Add(30*time.Minute), now.Add(90*time.Minute), true, "scheduled")
	service := notification.Service{DB: fixture.db}
	if _, err := SendDueConfirmationNotifications(context.Background(), fixture.db, service, now); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/cancel", `{}`, fixture.organizer))
	if w.Code != http.StatusNoContent {
		t.Fatalf("cancel status = %d, body=%s", w.Code, w.Body.String())
	}
	var pending, disabled int
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FILTER (WHERE d.status='pending'),count(*) FILTER (WHERE d.status='disabled') FROM notification_deliveries d JOIN notification_events e ON e.id=d.notification_event_id WHERE e.payload->>'gameId'=$1`, fixture.gameID.String()).Scan(&pending, &disabled); err != nil {
		t.Fatal(err)
	}
	if pending != 0 || disabled != 8 {
		t.Fatalf("delivery statuses pending=%d disabled=%d", pending, disabled)
	}
}
