import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SafetyPage } from './SafetyPage';

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SafetyPage', () => {
  it('lists blocked players and unblocks one', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/v1/me/blocked-users')
        return Promise.resolve(
          response([
            { userId: 'player-1', displayName: 'Bruno', createdAt: '2099-01-01T00:00:00Z' },
          ]),
        );
      if (url.endsWith('/block') && init?.method === 'DELETE')
        return Promise.resolve(new Response(null, { status: 204 }));
      return Promise.resolve(response({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/settings/safety']}>
        <Routes>
          <Route path="/settings/safety" element={<SafetyPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Bruno')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/users/player-1/block',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    expect(await screen.findByText(/nenhum jogador bloqueado/i)).toBeInTheDocument();
  });
});
