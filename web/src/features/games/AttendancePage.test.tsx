import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttendancePage } from './AttendancePage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AttendancePage', () => {
  it('lets a participant confirm attendance', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/attendance') && init?.method === 'PUT')
        return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith('/attendance'))
        return Promise.resolve(
          response([{ userId: 'user-1', displayName: 'Ana', status: 'unknown' }]),
        );
      if (url.endsWith('/api/v1/me'))
        return Promise.resolve(
          response({
            id: 'user-1',
            displayName: 'Ana',
            email: 'ana@example.com',
            timeZone: 'America/Sao_Paulo',
            onboardingComplete: true,
            isAdmin: false,
          }),
        );
      return Promise.resolve(
        response({
          id: 'game-1',
          title: 'Sábado na areia',
          startsAt: '2099-08-01T12:00:00Z',
          endsAt: '2099-08-01T13:30:00Z',
          venueId: 'venue-1',
          venueName: 'Praia Central',
          latitude: -23.5,
          longitude: -46.6,
          capacity: 4,
          confirmedPlayers: 1,
          openSlots: 3,
          minimumSkillLevel: 'beginner',
          maximumSkillLevel: 'advanced',
          visibility: 'public',
          status: 'completed',
          currentUserRole: 'player',
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/games/game-1/attendance']}>
        <Routes>
          <Route path="/games/:id/attendance" element={<AttendancePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Ainda não informado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Foi' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/games/game-1/attendance',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ userId: 'user-1', status: 'attended' }),
        }),
      ),
    );
    expect(await screen.findByText('Compareceu')).toBeInTheDocument();
  });
});
