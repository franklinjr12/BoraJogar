package game

import (
	"fmt"
	"net/http"
	"strings"
	"time"
)

func buildICS(game gameDetails, request *http.Request) string {
	url := "https://borajogar.local/games/" + game.ID
	if request != nil {
		scheme := "https"
		if request.TLS == nil && request.Header.Get("X-Forwarded-Proto") == "" {
			scheme = "http"
		}
		if forwarded := request.Header.Get("X-Forwarded-Proto"); forwarded != "" {
			scheme = forwarded
		}
		if request.Host != "" {
			url = scheme + "://" + request.Host + "/games/" + game.ID
		}
	}
	address := ""
	if game.AddressLabel != nil {
		address = *game.AddressLabel
	}
	title := "Beach volleyball game"
	if game.Title != nil && strings.TrimSpace(*game.Title) != "" {
		title = *game.Title
	}
	notes := ""
	if game.Description != nil {
		notes = *game.Description
	}
	return fmt.Sprintf("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Bora Jogar//Games//EN\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\nUID:%s@borajogar\r\nDTSTAMP:%s\r\nDTSTART:%s\r\nDTEND:%s\r\nSUMMARY:%s\r\nLOCATION:%s\r\nURL:%s\r\nDESCRIPTION:%s\r\nGEO:%0.6f;%0.6f\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n", game.ID, time.Now().UTC().Format("20060102T150405Z"), game.StartsAt.UTC().Format("20060102T150405Z"), game.EndsAt.UTC().Format("20060102T150405Z"), escapeICS(title), escapeICS(game.VenueName+", "+address), escapeICS(url), escapeICS(notes), game.Latitude, game.Longitude)
}

func escapeICS(value string) string {
	return strings.NewReplacer("\\", "\\\\", ";", "\\;", ",", "\\,", "\r\n", "\\n", "\n", "\\n", "\r", "\\n").Replace(value)
}
