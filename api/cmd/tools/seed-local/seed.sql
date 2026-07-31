BEGIN;

-- Fixture IDs are intentionally stable. Remove only rows owned by this seed.
DELETE FROM notification_events WHERE id IN ('91000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002');
DELETE FROM notification_preferences WHERE user_id IN ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');
DELETE FROM proposal_participants WHERE proposal_id IN ('90000000-0000-0000-0000-000000000001');
DELETE FROM match_proposals WHERE id IN ('90000000-0000-0000-0000-000000000001');
DELETE FROM matchmaking_runs WHERE id IN ('80000000-0000-0000-0000-000000000001');
DELETE FROM game_waitlist WHERE game_id IN ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003');
DELETE FROM game_invitations WHERE game_id IN ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003');
DELETE FROM game_players WHERE game_id IN ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003');
DELETE FROM games WHERE id IN ('60000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003');

DELETE FROM availability_occurrences WHERE id IN ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002');
DELETE FROM availability_exceptions WHERE id = '40000000-0000-0000-0000-000000000001';
DELETE FROM availability_rule_venues WHERE availability_rule_id IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
DELETE FROM availability_rule_areas WHERE availability_rule_id IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
DELETE FROM availability_rules WHERE id IN ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');

DELETE FROM user_favorite_venues WHERE user_id IN ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');
DELETE FROM preferred_areas WHERE id IN ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003');
DELETE FROM venues WHERE id IN ('20000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000103');

DELETE FROM sessions WHERE token_hash IN ('seed-session-ana', 'seed-session-bruno');
DELETE FROM invitations WHERE id = '20000000-0000-0000-0000-000000000201';
DELETE FROM onboarding_progress WHERE user_id IN ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');
DELETE FROM player_style_preferences WHERE user_id IN ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');
DELETE FROM player_profiles WHERE user_id IN ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');
DELETE FROM users WHERE id IN ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000004');

INSERT INTO users (id, google_subject, email, display_name, avatar_url, time_zone, onboarding_completed, is_admin, status, onboarding_completed_at)
VALUES
 ('10000000-0000-0000-0000-000000000001', 'seed-google-ana', 'ana@borajogar.local', 'Ana Admin', 'https://i.pravatar.cc/160?img=47', 'America/Sao_Paulo', true, true, 'active', '2026-07-01 12:00:00+00'),
 ('10000000-0000-0000-0000-000000000002', 'seed-google-bruno', 'bruno@borajogar.local', 'Bruno Costa', 'https://i.pravatar.cc/160?img=12', 'America/Sao_Paulo', true, false, 'active', '2026-07-02 12:00:00+00'),
 ('10000000-0000-0000-0000-000000000003', 'seed-google-carla', 'carla@borajogar.local', 'Carla Lima', 'https://i.pravatar.cc/160?img=32', 'America/Sao_Paulo', true, false, 'active', '2026-07-03 12:00:00+00'),
 ('10000000-0000-0000-0000-000000000004', 'seed-google-diego', 'diego@borajogar.local', 'Diego Souza', NULL, 'America/Sao_Paulo', false, false, 'active', NULL);

INSERT INTO notification_preferences (user_id) VALUES
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002'),
 ('10000000-0000-0000-0000-000000000003'),
 ('10000000-0000-0000-0000-000000000004');

INSERT INTO notification_events (id, user_id, type, title, body, action_url, payload, created_at) VALUES
 ('91000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'match_proposal', 'New match proposal', 'You have a new game proposal to review.', '/proposals/90000000-0000-0000-0000-000000000001', '{"proposalId":"90000000-0000-0000-0000-000000000001"}'::jsonb, '2026-07-30 13:00:00+00'),
 ('91000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'game_reminder', 'Game reminder', 'Your game starts tomorrow at Praia do Sol.', '/games/60000000-0000-0000-0000-000000000001', '{"gameId":"60000000-0000-0000-0000-000000000001"}'::jsonb, '2026-07-30 14:00:00+00');

INSERT INTO notification_deliveries (id, notification_event_id, channel, status, attempt_count, delivered_at) VALUES
 ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'in_app', 'delivered', 1, '2026-07-30 13:00:01+00'),
 ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'in_app', 'delivered', 1, '2026-07-30 14:00:01+00');

INSERT INTO invitations (id, code_hash, created_by_user_id, email, max_uses, current_uses, expires_at)
VALUES ('20000000-0000-0000-0000-000000000201', 'seed-invitation-code-hash', '10000000-0000-0000-0000-000000000001', 'diego@borajogar.local', 3, 1, '2026-12-31 02:59:59+00');

INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip_hash)
VALUES
 ('seed-session-ana', '10000000-0000-0000-0000-000000000001', '2026-12-31 02:59:59+00', 'local-seed', 'seed-ip-ana'),
 ('seed-session-bruno', '10000000-0000-0000-0000-000000000002', '2026-12-31 02:59:59+00', 'local-seed', 'seed-ip-bruno');

INSERT INTO player_profiles (user_id, skill_level, bio, preferred_game_duration_minutes, minimum_notice_minutes, active_for_matchmaking)
VALUES
 ('10000000-0000-0000-0000-000000000001', 'advanced', 'Organiza partidas e gosta de jogos equilibrados.', 90, 60, true),
 ('10000000-0000-0000-0000-000000000002', 'intermediate', 'Jogo para competir e conhecer gente nova.', 90, 120, true),
 ('10000000-0000-0000-0000-000000000003', 'beginner', 'Aprendendo e procurando partidas tranquilas.', 60, 180, true),
 ('10000000-0000-0000-0000-000000000004', 'learning', NULL, 90, 120, false);

INSERT INTO player_style_preferences (user_id, style) VALUES
 ('10000000-0000-0000-0000-000000000001', 'competitive'), ('10000000-0000-0000-0000-000000000001', 'mixed'),
 ('10000000-0000-0000-0000-000000000002', 'competitive'),
 ('10000000-0000-0000-0000-000000000003', 'casual'), ('10000000-0000-0000-0000-000000000003', 'training_focused'),
 ('10000000-0000-0000-0000-000000000004', 'casual');

INSERT INTO onboarding_progress (user_id, current_step, completed_steps) VALUES
 ('10000000-0000-0000-0000-000000000001', 8, ARRAY[1,2,3,4,5,6,7,8]),
 ('10000000-0000-0000-0000-000000000002', 8, ARRAY[1,2,3,4,5,6,7,8]),
 ('10000000-0000-0000-0000-000000000003', 8, ARRAY[1,2,3,4,5,6,7,8]),
 ('10000000-0000-0000-0000-000000000004', 3, ARRAY[1,2,3]);

INSERT INTO venues (id, name, description, address_label, city, location, lighting_status, surface_type, access_type, active, created_by_user_id, approved_at, rejected_at)
VALUES
 ('20000000-0000-0000-0000-000000000101', 'Praia do Sol', 'Quadras públicas perto do calçadão.', 'Av. Atlântica, 100', 'Rio de Janeiro', ST_GeogFromText('SRID=4326;POINT(-43.1760 -22.9670)'), 'has_lighting', 'sand', 'public', true, '10000000-0000-0000-0000-000000000001', '2026-06-20 12:00:00+00', NULL),
 ('20000000-0000-0000-0000-000000000102', 'Arena Copacabana', 'Arena paga com quatro quadras.', 'Rua Xavier da Silveira, 50', 'Rio de Janeiro', ST_GeogFromText('SRID=4326;POINT(-43.1860 -22.9750)'), 'has_lighting', 'sand', 'paid_entry', true, '10000000-0000-0000-0000-000000000002', '2026-06-21 12:00:00+00', NULL),
 ('20000000-0000-0000-0000-000000000103', 'Quadra em avaliação', 'Sugestão aguardando moderação.', 'Rua das Flores, 20', 'Rio de Janeiro', ST_GeogFromText('SRID=4326;POINT(-43.1900 -22.9800)'), 'unknown', 'sand', 'unknown', false, '10000000-0000-0000-0000-000000000003', NULL, '2026-07-10 12:00:00+00');

INSERT INTO preferred_areas (id, user_id, label, center, radius_meters, priority, active)
VALUES
 ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Copacabana', ST_GeogFromText('SRID=4326;POINT(-43.1820 -22.9710)'), 5000, 1, true),
 ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Ipanema', ST_GeogFromText('SRID=4326;POINT(-43.2050 -22.9840)'), 7000, 1, true),
 ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Zona Sul', ST_GeogFromText('SRID=4326;POINT(-43.1900 -22.9800)'), 10000, 1, true);

INSERT INTO user_favorite_venues (user_id, venue_id, priority) VALUES
 ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000101', 1),
 ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000102', 2),
 ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000102', 1),
 ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000101', 1);

INSERT INTO availability_rules (id, user_id, weekday, start_local_time, end_local_time, timezone, valid_from, valid_until)
VALUES
 ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 6, '08:00', '12:00', 'America/Sao_Paulo', '2026-07-01', NULL),
 ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 6, '09:00', '13:00', 'America/Sao_Paulo', '2026-07-01', NULL);
INSERT INTO availability_rule_venues (availability_rule_id, venue_id) VALUES
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000101'),
 ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000102');
INSERT INTO availability_rule_areas (availability_rule_id, preferred_area_id) VALUES
 ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');
INSERT INTO availability_exceptions (id, user_id, exception_date, exception_type, timezone)
VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-08', 'unavailable_all_day', 'America/Sao_Paulo');
INSERT INTO availability_occurrences (id, user_id, starts_at, ends_at, source_type, source_id)
VALUES
 ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-08-01 08:00:00-03', '2026-08-01 12:00:00-03', 'rule', '30000000-0000-0000-0000-000000000001'),
 ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '2026-08-01 09:00:00-03', '2026-08-01 13:00:00-03', 'rule', '30000000-0000-0000-0000-000000000002');

INSERT INTO games (id, source_type, created_by_user_id, title, description, starts_at, ends_at, venue_id, capacity, minimum_skill_level, maximum_skill_level, visibility, status)
VALUES
 ('60000000-0000-0000-0000-000000000001', 'manual', '10000000-0000-0000-0000-000000000001', 'Sábado na Praia do Sol', 'Jogo aberto para nível iniciante a avançado.', '2026-08-01 09:00:00-03', '2026-08-01 10:30:00-03', '20000000-0000-0000-0000-000000000101', 4, 'beginner', 'advanced', 'public', 'scheduled'),
 ('60000000-0000-0000-0000-000000000002', 'manual', '10000000-0000-0000-0000-000000000002', 'Treino Arena Copacabana', 'Treino competitivo; confirme presença.', '2026-08-02 10:00:00-03', '2026-08-02 12:00:00-03', '20000000-0000-0000-0000-000000000102', 6, 'intermediate', 'competitive', 'link-only', 'scheduled'),
 ('60000000-0000-0000-0000-000000000003', 'manual', '10000000-0000-0000-0000-000000000003', 'Jogo encerrado', NULL, '2026-07-20 09:00:00-03', '2026-07-20 10:30:00-03', '20000000-0000-0000-0000-000000000101', 4, 'learning', 'advanced', 'public', 'completed');
INSERT INTO game_players (game_id, user_id, role, status, attendance_status, invited_by_user_id) VALUES
 ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'organizer', 'confirmed', 'attended', NULL),
 ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'player', 'confirmed', 'unknown', '10000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'player', 'confirmed', 'unknown', '10000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'organizer', 'confirmed', 'unknown', NULL),
 ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'player', 'confirmed', 'unknown', '10000000-0000-0000-0000-000000000002'),
 ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'organizer', 'confirmed', 'attended', NULL),
 ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'player', 'confirmed', 'attended', '10000000-0000-0000-0000-000000000003');
INSERT INTO game_invitations (id, game_id, invited_user_id, invited_email, invitation_token_hash, status, expires_at) VALUES
 ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', NULL, 'seed-game-invite-1', 'pending', '2026-08-01 11:00:00-03'),
 ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', NULL, 'guest@borajogar.local', 'seed-game-invite-2', 'pending', '2026-08-02 12:00:00-03');
INSERT INTO game_waitlist (game_id, user_id, position) VALUES
 ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 1),
 ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 1);

INSERT INTO matchmaking_runs (id, started_at, completed_at, status, candidate_slot_count, proposal_count, configuration_snapshot)
VALUES ('80000000-0000-0000-0000-000000000001', '2026-07-30 12:00:00+00', '2026-07-30 12:00:05+00', 'completed', 4, 1,
        '{"lookaheadDays":14,"durationMinutes":90,"playerCount":3,"slotIncrementMinutes":30,"maxSkillDifference":1,"minimumNoticeMinutes":720}'::jsonb);

INSERT INTO match_proposals (id, matchmaking_run_id, starts_at, ends_at, venue_id, required_player_count, status, expires_at, score_summary)
VALUES ('90000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '2026-08-08 12:00:00+00', '2026-08-08 13:30:00+00', '20000000-0000-0000-0000-000000000101', 3, 'pending', '2026-08-08 20:00:00+00',
        '{"total":275,"timeOverlap":90,"venuePreference":80,"distance":70,"skillBalance":35,"reliability":0}'::jsonb);

INSERT INTO proposal_participants (proposal_id, user_id, response_status) VALUES
 ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'pending'),
 ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'pending'),
 ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'pending');

COMMIT;
