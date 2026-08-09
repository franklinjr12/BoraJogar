import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';

describe('CalendarPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'game-1',
                  title: 'Saturday match',
                  startsAt: '2026-08-01T12:00:00Z',
                  endsAt: '2026-08-01T13:30:00Z',
                  venueId: 'venue-1',
                  venueName: 'Praia Central',
                  addressLabel: 'Rua A, 10',
                  latitude: -23.5,
                  longitude: -46.6,
                  capacity: 4,
                  confirmedPlayers: 2,
                  openSlots: 2,
                  minimumSkillLevel: 'beginner',
                  maximumSkillLevel: 'advanced',
                  visibility: 'public',
                  status: 'scheduled',
                  currentUserStatus: 'confirmed',
                  currentUserRole: 'player',
                },
              ],
              page: 1,
              pageSize: 30,
              hasMore: false,
            }),
            { status: 200 },
          ),
        ),
      ),
    );
  });
  it('defaults to mobile-friendly agenda and exposes map/calendar links', async () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /saturday match/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Agenda' })).toHaveClass('selected');
    fireEvent.click(screen.getByText(/abrir mapa do local/i));
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
    expect(screen.getByRole('link', { name: /adicionar ao calendário/i })).toHaveAttribute(
      'href',
      '/api/v1/games/game-1/calendar.ics',
    );
  });
});
