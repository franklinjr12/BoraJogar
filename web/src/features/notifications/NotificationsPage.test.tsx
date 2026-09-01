import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage } from './NotificationsPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('NotificationsPage', () => {
  it('traduz notificações geradas pelo sistema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'notification-1',
                  userId: 'user-1',
                  type: 'attendance_requested',
                  title: 'Record attendance',
                  body: 'Your game is complete. Record player attendance.',
                  actionUrl: null,
                  payload: {},
                  readAt: null,
                  createdAt: '2026-08-05T12:00:00Z',
                },
              ],
              unreadCount: 1,
              hasMore: false,
              page: 1,
              pageSize: 20,
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Registre a presença' })).toBeInTheDocument();
    expect(
      screen.getByText('Sua partida terminou. Registre a presença dos jogadores.'),
    ).toBeInTheDocument();
  });

  it('only renders internal notification destinations as app links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'internal',
                  userId: 'user-1',
                  type: 'game_changed',
                  title: 'Internal',
                  body: 'Internal destination',
                  actionUrl: '/games/game-1',
                  payload: {},
                  readAt: null,
                  createdAt: '2026-08-05T12:00:00Z',
                },
                {
                  id: 'external',
                  userId: 'user-1',
                  type: 'game_changed',
                  title: 'External',
                  body: 'External destination',
                  actionUrl: 'https://example.com',
                  payload: {},
                  readAt: null,
                  createdAt: '2026-08-05T12:00:00Z',
                },
              ],
              unreadCount: 2,
              hasMore: false,
              page: 1,
              pageSize: 20,
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    const links = await screen.findAllByRole('link', { name: 'Abrir' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/games/game-1');
  });

  it('renders the match name in game chat notifications', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'chat-notification',
                  userId: 'user-1',
                  type: 'game_chat_message',
                  title: 'Generic title',
                  body: 'Uma nova mensagem foi enviada no chat da sua partida Sábado na Praia.',
                  actionUrl: '/games/game-1',
                  payload: {},
                  readAt: null,
                  createdAt: '2026-08-05T12:00:00Z',
                },
              ],
              unreadCount: 1,
              hasMore: false,
              page: 1,
              pageSize: 20,
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Nova mensagem na partida' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Uma nova mensagem foi enviada no chat da sua partida Sábado na Praia.'),
    ).toBeInTheDocument();
  });

  it('localizes match confirmations and links to the match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'confirmation-notification',
                  userId: 'user-1',
                  type: 'match_confirmation',
                  title: 'Confirm attendance',
                  body: 'Please confirm attendance.',
                  actionUrl: '/games/game-1',
                  payload: {},
                  readAt: null,
                  createdAt: '2026-08-05T12:00:00Z',
                },
              ],
              unreadCount: 1,
              hasMore: false,
              page: 1,
              pageSize: 20,
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Confirme sua presença' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Confirme sua presença na partida antes do horário do jogo.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/games/game-1');
  });
});
