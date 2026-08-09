import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotificationsPage } from './NotificationsPage';

afterEach(() => vi.unstubAllGlobals());

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
});
