import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicProfilePage } from './PublicProfilePage';

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

describe('PublicProfilePage', () => {
  it('shows a public profile and supports block/report actions', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/public-profile'))
        return Promise.resolve(
          response({
            userId: 'player-1',
            displayName: 'Bruno',
            skillLevel: 'intermediate',
            styles: ['casual'],
            completedGames: 4,
            playedTogether: true,
          }),
        );
      if (url.endsWith('/block') && init?.method === 'POST')
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url === '/api/v1/reports' && init?.method === 'POST')
        return Promise.resolve(response({ id: 'report-1', status: 'received' }));
      return Promise.resolve(response({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/players/player-1?gameId=game-1']}>
        <Routes>
          <Route path="/players/:id" element={<PublicProfilePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Bruno' })).toBeInTheDocument();
    expect(screen.getByText(/jogaram juntos/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /bloquear jogador/i }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Bloquear jogador' })[1]!);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/users/player-1/block',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(await screen.findByRole('button', { name: /desbloquear jogador/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /relatar problema/i }));
    fireEvent.change(screen.getByLabelText(/descreva/i), {
      target: { value: 'Comportamento inadequado.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar relato/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/reports',
        expect.objectContaining({ method: 'POST', body: expect.stringContaining('player-1') }),
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/relato enviado/i);
  });
});
