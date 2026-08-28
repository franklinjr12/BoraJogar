//go:build integration

package game

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type gameFixture struct {
	db               *pgxpool.Pool
	h                *Handler
	organizer        auth.User
	player           auth.User
	waitlisted       auth.User
	secondWaitlisted auth.User
	outsider         auth.User
	gameID           uuid.UUID
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
	users := []auth.User{{ID: uuid.New()}, {ID: uuid.New()}, {ID: uuid.New()}, {ID: uuid.New()}, {ID: uuid.New()}}
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
	if _, err = db.Exec(context.Background(), `INSERT INTO games(id,source_type,created_by_user_id,title,starts_at,ends_at,venue_id,capacity,waitlist_enabled,waitlist_size,minimum_skill_level,maximum_skill_level,visibility) VALUES($1,'manual',$2,'Game Test Match',$3,$4,$5,2,true,2,'learning','advanced','public')`, gameID, users[0].ID, time.Now().UTC().Add(24*time.Hour), time.Now().UTC().Add(25*time.Hour), venueID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if _, err = db.Exec(context.Background(), `INSERT INTO game_players(game_id,user_id,role,status,attendance_status) VALUES($1,$2,'organizer','confirmed','unknown'),($1,$3,'player','confirmed','unknown')`, gameID, users[0].ID, users[1].ID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if _, err = db.Exec(context.Background(), `INSERT INTO game_waitlist(game_id,user_id,position) VALUES($1,$2,1),($1,$3,2)`, gameID, users[2].ID, users[3].ID); err != nil {
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
		db:               db,
		h:                &Handler{DB: db},
		organizer:        users[0],
		player:           users[1],
		waitlisted:       users[2],
		secondWaitlisted: users[3],
		outsider:         users[4],
		gameID:           gameID,
	}
}

func gameIntegrationRequest(method, path string, user auth.User) *http.Request {
	return httptest.NewRequest(method, path, strings.NewReader("")).WithContext(auth.WithUserContext(context.Background(), user))
}

func gameIntegrationRequestWithBody(method, path, body string, user auth.User) *http.Request {
	request := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(auth.WithUserContext(context.Background(), user))
	request.Header.Set("Content-Type", "application/json")
	return request
}

func TestChatIntegrationPaginatesLatestAndOlderMessages(t *testing.T) {
	fixture := integrationGameFixture(t)
	base := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	for index := 0; index < 25; index++ {
		if _, err := fixture.db.Exec(context.Background(), `INSERT INTO game_chat_messages(id,game_id,user_id,body,created_at) VALUES($1,$2,$3,$4,$5)`, uuid.New(), fixture.gameID, fixture.organizer.ID, "message-"+strconv.Itoa(index), base.Add(time.Duration(index)*time.Second)); err != nil {
			t.Fatal(err)
		}
	}

	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String()+"/chat", fixture.player))
	if w.Code != http.StatusOK {
		t.Fatalf("latest status = %d, body=%s", w.Code, w.Body.String())
	}
	var latest chatPage
	if err := json.Unmarshal(w.Body.Bytes(), &latest); err != nil {
		t.Fatal(err)
	}
	if len(latest.Items) != 20 || latest.Items[0].Body != "message-5" || latest.Items[19].Body != "message-24" || !latest.HasMore || latest.NextCursor == nil {
		t.Fatalf("latest page = %+v", latest)
	}

	w = httptest.NewRecorder()
	request := gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String()+"/chat?before="+*latest.NextCursor, fixture.player)
	fixture.h.gameByID(w, request)
	if w.Code != http.StatusOK {
		t.Fatalf("older status = %d, body=%s", w.Code, w.Body.String())
	}
	var older chatPage
	if err := json.Unmarshal(w.Body.Bytes(), &older); err != nil {
		t.Fatal(err)
	}
	if len(older.Items) != 5 || older.Items[0].Body != "message-0" || older.Items[4].Body != "message-4" || older.HasMore || older.NextCursor != nil {
		t.Fatalf("older page = %+v", older)
	}
}

func TestChatIntegrationOrdersEqualTimestampsByMessageID(t *testing.T) {
	fixture := integrationGameFixture(t)
	createdAt := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	lowID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	highID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	for _, message := range []struct {
		id   uuid.UUID
		body string
	}{{lowID, "lower id"}, {highID, "higher id"}} {
		if _, err := fixture.db.Exec(context.Background(), `INSERT INTO game_chat_messages(id,game_id,user_id,body,created_at) VALUES($1,$2,$3,$4,$5)`, message.id, fixture.gameID, fixture.organizer.ID, message.body, createdAt); err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String()+"/chat", fixture.player))
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body=%s", w.Code, w.Body.String())
	}
	var result chatPage
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 2 || result.Items[0].Body != "lower id" || result.Items[1].Body != "higher id" {
		t.Fatalf("items = %+v", result.Items)
	}
}

func TestChatIntegrationValidatesMessageBody(t *testing.T) {
	fixture := integrationGameFixture(t)
	for _, body := range []string{" ", strings.Repeat("x", 2001)} {
		w := httptest.NewRecorder()
		fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/chat", `{"body":"`+body+`"}`, fixture.player))
		if w.Code != http.StatusUnprocessableEntity || !strings.Contains(w.Body.String(), `"code":"invalid_chat_message"`) {
			t.Fatalf("body length %d status = %d, body=%s", len(body), w.Code, w.Body.String())
		}
	}
}

func TestChatIntegrationAllowsOnlyConfirmedPlayersAndLateJoinersSeeHistory(t *testing.T) {
	fixture := integrationGameFixture(t)
	if _, err := fixture.db.Exec(context.Background(), `UPDATE games SET capacity=3 WHERE id=$1`, fixture.gameID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(context.Background(), `INSERT INTO game_chat_messages(id,game_id,user_id,body) VALUES($1,$2,$3,'before join')`, uuid.New(), fixture.gameID, fixture.organizer.ID); err != nil {
		t.Fatal(err)
	}

	for _, user := range []auth.User{fixture.waitlisted, fixture.outsider} {
		w := httptest.NewRecorder()
		fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String()+"/chat", user))
		if w.Code != http.StatusNotFound {
			t.Fatalf("unauthorized chat status = %d, body=%s", w.Code, w.Body.String())
		}
	}

	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/join", fixture.outsider))
	if w.Code != http.StatusOK {
		t.Fatalf("late join status = %d, body=%s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String()+"/chat", fixture.outsider))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "before join") {
		t.Fatalf("late join chat status = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestChatIntegrationCreatesInAppNotificationsForOtherConfirmedPlayers(t *testing.T) {
	fixture := integrationGameFixture(t)
	publisher := &recordingPublisher{}
	fixture.h.Notifications = publisher
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/chat", `{"body":"Bring a net"}`, fixture.player))
	if w.Code != http.StatusCreated {
		t.Fatalf("send status = %d, body=%s", w.Code, w.Body.String())
	}
	if len(publisher.events) != 1 {
		t.Fatalf("events = %+v", publisher.events)
	}
	event := publisher.events[0]
	if event.UserID != fixture.organizer.ID || event.Type != notification.GameChatMessage || event.ActionURL != "/games/"+fixture.gameID.String() || len(event.Channels) != 1 || event.Channels[0] != "in_app" {
		t.Fatalf("event = %+v", event)
	}
	if event.Body != "Uma nova mensagem foi enviada no chat da sua partida Game Test Match." {
		t.Fatalf("event body = %q", event.Body)
	}
	payload, ok := event.Payload.(map[string]string)
	if !ok || payload["gameId"] != fixture.gameID.String() || payload["senderId"] != fixture.player.ID.String() || payload["messageId"] == "" {
		t.Fatalf("payload = %#v", event.Payload)
	}

	var body string
	if err := fixture.db.QueryRow(context.Background(), `SELECT body FROM game_chat_messages WHERE game_id=$1 AND user_id=$2`, fixture.gameID, fixture.player.ID).Scan(&body); err != nil {
		t.Fatal(err)
	}
	if body != "Bring a net" {
		t.Fatalf("body = %q", body)
	}
}

func TestChatIntegrationPreservesHistoryButClosesSendingAfterCancellation(t *testing.T) {
	fixture := integrationGameFixture(t)
	if _, err := fixture.db.Exec(context.Background(), `INSERT INTO game_chat_messages(id,game_id,user_id,body) VALUES($1,$2,$3,'history')`, uuid.New(), fixture.gameID, fixture.organizer.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(context.Background(), `UPDATE games SET status='cancelled' WHERE id=$1`, fixture.gameID); err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodGet, "/api/v1/games/"+fixture.gameID.String()+"/chat", fixture.player))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "history") {
		t.Fatalf("history status = %d, body=%s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequestWithBody(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/chat", `{"body":"too late"}`, fixture.player))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), `"code":"game_chat_closed"`) {
		t.Fatalf("closed send status = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestRemovePlayerIntegrationNotifiesEntireWaitlistWithoutPromotion(t *testing.T) {
	fixture := integrationGameFixture(t)
	publisher := &recordingPublisher{}
	fixture.h.Notifications = publisher
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodDelete, "/api/v1/games/"+fixture.gameID.String()+"/players/"+fixture.player.ID.String(), fixture.organizer))
	if w.Code != http.StatusOK {
		t.Fatalf("remove status = %d, body=%s", w.Code, w.Body.String())
	}
	var removed string
	var confirmed, waitlistCount int
	if err := fixture.db.QueryRow(context.Background(), `SELECT status FROM game_players WHERE game_id=$1 AND user_id=$2`, fixture.gameID, fixture.player.ID).Scan(&removed); err != nil {
		t.Fatal(err)
	}
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM game_players WHERE game_id=$1 AND user_id=$2 AND status='confirmed'`, fixture.gameID, fixture.waitlisted.ID).Scan(&confirmed); err != nil {
		t.Fatal(err)
	}
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM game_waitlist WHERE game_id=$1`, fixture.gameID).Scan(&waitlistCount); err != nil {
		t.Fatal(err)
	}
	if removed != "removed" || confirmed != 0 || waitlistCount != 2 {
		t.Fatalf("statuses = removed:%s confirmed:%d waitlist:%d", removed, confirmed, waitlistCount)
	}
	if len(publisher.events) != 3 || publisher.events[0].UserID != fixture.player.ID || publisher.events[1].Type != notification.WaitlistOpen || publisher.events[2].Type != notification.WaitlistOpen {
		t.Fatalf("notifications = %+v", publisher.events)
	}
	if publisher.events[1].UserID != fixture.waitlisted.ID || publisher.events[2].UserID != fixture.secondWaitlisted.ID {
		t.Fatalf("waitlist notifications = %+v", publisher.events)
	}

	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodDelete, "/api/v1/games/"+fixture.gameID.String()+"/players/"+fixture.organizer.ID.String(), fixture.waitlisted))
	if w.Code != http.StatusForbidden {
		t.Fatalf("non-organizer remove status = %d", w.Code)
	}
}

func TestLeaveIntegrationAllowsWaitlistedPlayerToClaimSlot(t *testing.T) {
	fixture := integrationGameFixture(t)
	publisher := &recordingPublisher{}
	fixture.h.Notifications = publisher
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/leave", fixture.player))
	if w.Code != http.StatusOK {
		t.Fatalf("leave status = %d, body=%s", w.Code, w.Body.String())
	}
	if len(publisher.events) != 2 || publisher.events[0].Type != notification.WaitlistOpen || publisher.events[1].Type != notification.WaitlistOpen {
		t.Fatalf("notifications = %+v", publisher.events)
	}

	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/join", fixture.waitlisted))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"result":"confirmed"`) {
		t.Fatalf("claim status = %d, body=%s", w.Code, w.Body.String())
	}
	var confirmed, remaining int
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM game_players WHERE game_id=$1 AND user_id=$2 AND status='confirmed'`, fixture.gameID, fixture.waitlisted.ID).Scan(&confirmed); err != nil {
		t.Fatal(err)
	}
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM game_waitlist WHERE game_id=$1`, fixture.gameID).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if confirmed != 1 || remaining != 1 {
		t.Fatalf("claim state = confirmed:%d remaining:%d", confirmed, remaining)
	}
}

func TestJoinIntegrationCreatesDefaultProfileForNewLinkPlayer(t *testing.T) {
	fixture := integrationGameFixture(t)
	if _, err := fixture.db.Exec(context.Background(), `DELETE FROM player_profiles WHERE user_id=$1`, fixture.outsider.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(context.Background(), `UPDATE games SET capacity=3 WHERE id=$1`, fixture.gameID); err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/join", fixture.outsider))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"result":"confirmed"`) {
		t.Fatalf("join status = %d, body=%s", w.Code, w.Body.String())
	}
	var skill string
	if err := fixture.db.QueryRow(context.Background(), `SELECT skill_level FROM player_profiles WHERE user_id=$1`, fixture.outsider.ID).Scan(&skill); err != nil {
		t.Fatal(err)
	}
	if skill != "learning" {
		t.Fatalf("default skill = %q, want learning", skill)
	}
}

func TestJoinIntegrationReturnsConflictingGameDetails(t *testing.T) {
	fixture := integrationGameFixture(t)
	conflictID := uuid.New()
	var starts, ends time.Time
	var venueID uuid.UUID
	if err := fixture.db.QueryRow(context.Background(), `SELECT starts_at,ends_at,venue_id FROM games WHERE id=$1`, fixture.gameID).Scan(&starts, &ends, &venueID); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.db.Exec(context.Background(), `INSERT INTO games(id,source_type,created_by_user_id,title,starts_at,ends_at,venue_id,capacity,waitlist_enabled,waitlist_size,minimum_skill_level,maximum_skill_level,visibility) VALUES($1,'manual',$2,'Existing match',$3,$4,$5,4,false,0,'learning','advanced','public')`, conflictID, fixture.organizer.ID, starts, ends, venueID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = fixture.db.Exec(context.Background(), `DELETE FROM games WHERE id=$1`, conflictID)
	})
	if _, err := fixture.db.Exec(context.Background(), `INSERT INTO game_players(game_id,user_id,role,status,attendance_status) VALUES($1,$2,'player','confirmed','unknown')`, conflictID, fixture.outsider.ID); err != nil {
		t.Fatal(err)
	}

	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/join", fixture.outsider))
	body := w.Body.String()
	if w.Code != http.StatusConflict || !strings.Contains(body, `"code":"conflicting_game"`) {
		t.Fatalf("conflict status = %d, body=%s", w.Code, body)
	}
	for _, value := range []string{conflictID.String(), "Existing match", "Game Test Court"} {
		if !strings.Contains(body, value) {
			t.Fatalf("conflict body missing %q: %s", value, body)
		}
	}
}

func TestJoinIntegrationHonorsWaitlistCapacityAndDisabledGames(t *testing.T) {
	fixture := integrationGameFixture(t)
	w := httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/join", fixture.outsider))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), `"code":"waitlist_full"`) {
		t.Fatalf("waitlist capacity status = %d, body=%s", w.Code, w.Body.String())
	}
	if _, err := fixture.db.Exec(context.Background(), `UPDATE games SET waitlist_enabled=false,waitlist_size=0 WHERE id=$1`, fixture.gameID); err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	fixture.h.gameByID(w, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/join", fixture.outsider))
	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), `"code":"game_full"`) {
		t.Fatalf("disabled waitlist status = %d, body=%s", w.Code, w.Body.String())
	}
}

func TestJoinIntegrationFirstConcurrentWaitlistedPlayerWins(t *testing.T) {
	fixture := integrationGameFixture(t)
	fixture.h.Notifications = nil
	leave := httptest.NewRecorder()
	fixture.h.gameByID(leave, gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/leave", fixture.player))
	if leave.Code != http.StatusOK {
		t.Fatalf("prepare leave status = %d, body=%s", leave.Code, leave.Body.String())
	}

	users := []auth.User{fixture.waitlisted, fixture.secondWaitlisted}
	responses := make([]*httptest.ResponseRecorder, len(users))
	var group sync.WaitGroup
	group.Add(len(users))
	for index, user := range users {
		go func(index int, user auth.User) {
			defer group.Done()
			responses[index] = httptest.NewRecorder()
			fixture.h.gameByID(responses[index], gameIntegrationRequest(http.MethodPost, "/api/v1/games/"+fixture.gameID.String()+"/join", user))
		}(index, user)
	}
	group.Wait()

	confirmed := 0
	conflicts := 0
	for _, response := range responses {
		switch response.Code {
		case http.StatusOK:
			confirmed++
		case http.StatusConflict:
			conflicts++
		default:
			t.Fatalf("unexpected concurrent status = %d, body=%s", response.Code, response.Body.String())
		}
	}
	if confirmed != 1 || conflicts != 1 {
		t.Fatalf("concurrent results = confirmed:%d conflicts:%d", confirmed, conflicts)
	}
	var confirmedPlayers int
	if err := fixture.db.QueryRow(context.Background(), `SELECT count(*) FROM game_players WHERE game_id=$1 AND status='confirmed'`, fixture.gameID).Scan(&confirmedPlayers); err != nil {
		t.Fatal(err)
	}
	if confirmedPlayers != 2 {
		t.Fatalf("confirmed players = %d, want 2", confirmedPlayers)
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
	if status != "cancelled" || waitlistCount != 0 || len(publisher.events) != 3 {
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
