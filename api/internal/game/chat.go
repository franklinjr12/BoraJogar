package game

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const gameChatPageSize = 20

type chatMessage struct {
	ID          string    `json:"id"`
	GameID      string    `json:"gameId"`
	UserID      string    `json:"userId"`
	DisplayName string    `json:"displayName"`
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"createdAt"`
}

type chatPage struct {
	Items      []chatMessage `json:"items"`
	HasMore    bool          `json:"hasMore"`
	NextCursor *string       `json:"nextCursor"`
	PageSize   int           `json:"pageSize"`
}

type chatCursor struct {
	CreatedAt time.Time
	ID        uuid.UUID
}

func (h Handler) chatList(w http.ResponseWriter, r *http.Request, gameID, userID uuid.UUID) {
	if !h.isConfirmedChatMember(r, gameID, userID) {
		writeError(w, http.StatusNotFound, "game_chat_not_found", "Game chat not found.")
		return
	}

	var cursor *chatCursor
	if raw := strings.TrimSpace(r.URL.Query().Get("before")); raw != "" {
		decoded, err := decodeChatCursor(raw)
		if err != nil {
			writeError(w, http.StatusUnprocessableEntity, "invalid_chat_cursor", "Chat history cursor is invalid.")
			return
		}
		cursor = &decoded
	}

	query := `SELECT m.id,m.game_id,m.user_id,u.display_name,m.body,m.created_at
		FROM game_chat_messages m
		JOIN users u ON u.id=m.user_id
		WHERE m.game_id=$1`
	args := []any{gameID}
	if cursor != nil {
		query += ` AND (m.created_at,m.id) < ($2,$3)`
		args = append(args, cursor.CreatedAt, cursor.ID)
	}
	query += ` ORDER BY m.created_at DESC,m.id DESC LIMIT $` + strconv.Itoa(len(args)+1)
	args = append(args, gameChatPageSize+1)

	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	items := make([]chatMessage, 0, gameChatPageSize+1)
	for rows.Next() {
		var item chatMessage
		var messageID, itemGameID, itemUserID uuid.UUID
		if err := rows.Scan(&messageID, &itemGameID, &itemUserID, &item.DisplayName, &item.Body, &item.CreatedAt); err != nil {
			http.Error(w, "game chat unavailable", http.StatusInternalServerError)
			return
		}
		item.ID, item.GameID, item.UserID = messageID.String(), itemGameID.String(), itemUserID.String()
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}

	hasMore := len(items) > gameChatPageSize
	if hasMore {
		items = items[:gameChatPageSize]
	}
	var nextCursor *string
	if hasMore {
		encoded := encodeChatCursor(chatCursor{CreatedAt: items[len(items)-1].CreatedAt, ID: uuid.MustParse(items[len(items)-1].ID)})
		nextCursor = &encoded
	}
	for left, right := 0, len(items)-1; left < right; left, right = left+1, right-1 {
		items[left], items[right] = items[right], items[left]
	}
	writeJSON(w, http.StatusOK, chatPage{Items: items, HasMore: hasMore, NextCursor: nextCursor, PageSize: gameChatPageSize})
}

func (h Handler) chatCreate(w http.ResponseWriter, r *http.Request, gameID, userID uuid.UUID) {
	var input struct {
		Body string `json:"body"`
	}
	if json.NewDecoder(r.Body).Decode(&input) != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_chat_message", "Chat message is invalid.")
		return
	}
	body := strings.TrimSpace(input.Body)
	if utf8.RuneCountInString(body) < 1 || utf8.RuneCountInString(body) > 2000 {
		writeError(w, http.StatusUnprocessableEntity, "invalid_chat_message", "Chat message must contain between 1 and 2000 characters.")
		return
	}

	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	var status string
	var confirmed bool
	var matchName string
	var displayName string
	if err := tx.QueryRow(r.Context(), `
		SELECT g.status,
		       EXISTS(SELECT 1 FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$2 AND gp.status='confirmed'),
		       COALESCE(NULLIF(trim(g.title), ''), 'Partida de vôlei de praia'),
		       u.display_name
		FROM games g
		JOIN users u ON u.id=$2
		WHERE g.id=$1
		FOR UPDATE OF g`, gameID, userID).Scan(&status, &confirmed, &matchName, &displayName); errors.Is(err, pgx.ErrNoRows) || !confirmed {
		writeError(w, http.StatusNotFound, "game_chat_not_found", "Game chat not found.")
		return
	} else if err != nil {
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}
	if status != "scheduled" {
		writeError(w, http.StatusConflict, "game_chat_closed", "Chat is closed for this game.")
		return
	}

	messageID := uuid.New()
	createdAt := h.now()
	if _, err := tx.Exec(r.Context(), `INSERT INTO game_chat_messages(id,game_id,user_id,body,created_at) VALUES($1,$2,$3,$4,$5)`, messageID, gameID, userID, body, createdAt); err != nil {
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}
	recipients := []uuid.UUID{}
	rows, err := tx.Query(r.Context(), `SELECT user_id FROM game_players WHERE game_id=$1 AND status='confirmed' AND user_id<>$2`, gameID, userID)
	if err != nil {
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}
	for rows.Next() {
		var recipient uuid.UUID
		if err := rows.Scan(&recipient); err != nil {
			rows.Close()
			http.Error(w, "game chat unavailable", http.StatusInternalServerError)
			return
		}
		recipients = append(recipients, recipient)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}
	rows.Close()
	if err := tx.Commit(r.Context()); err != nil {
		http.Error(w, "game chat unavailable", http.StatusInternalServerError)
		return
	}

	if h.Notifications != nil {
		matchName = strings.TrimRight(strings.TrimSpace(matchName), ".")
		for _, recipient := range recipients {
			_ = h.Notifications.Publish(r.Context(), notification.EventInput{
				UserID:    recipient,
				Type:      notification.GameChatMessage,
				Title:     "Nova mensagem na partida",
				Body:      "Uma nova mensagem foi enviada no chat da sua partida " + matchName + ".",
				ActionURL: "/games/" + gameID.String(),
				Payload: map[string]string{
					"gameId":    gameID.String(),
					"messageId": messageID.String(),
					"senderId":  userID.String(),
				},
				Channels: []string{"in_app"},
			})
		}
	}

	writeJSON(w, http.StatusCreated, chatMessage{
		ID: messageID.String(), GameID: gameID.String(), UserID: userID.String(),
		DisplayName: displayName, Body: body, CreatedAt: createdAt,
	})
}

func (h Handler) isConfirmedChatMember(r *http.Request, gameID, userID uuid.UUID) bool {
	var confirmed bool
	err := h.DB.QueryRow(r.Context(), `SELECT EXISTS(
		SELECT 1 FROM games g
		JOIN game_players gp ON gp.game_id=g.id
		WHERE g.id=$1 AND gp.user_id=$2 AND gp.status='confirmed'
	)`, gameID, userID).Scan(&confirmed)
	return err == nil && confirmed
}

func encodeChatCursor(cursor chatCursor) string {
	raw := cursor.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + cursor.ID.String()
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeChatCursor(raw string) (chatCursor, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return chatCursor{}, err
	}
	parts := strings.Split(string(decoded), "|")
	if len(parts) != 2 {
		return chatCursor{}, errors.New("invalid chat cursor")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return chatCursor{}, err
	}
	id, err := uuid.Parse(parts[1])
	if err != nil {
		return chatCursor{}, err
	}
	return chatCursor{CreatedAt: createdAt, ID: id}, nil
}
