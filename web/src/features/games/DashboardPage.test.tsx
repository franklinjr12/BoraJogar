import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

const readiness = {
  profile: true,
  location: true,
  availability: true,
  profileCount: 1,
  favoriteVenueCount: 1,
  preferredAreaCount: 0,
  availabilityCount: 1,
  canComplete: true,
  missing: [],
};

describe('DashboardPage', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('prioritizes next game, availability, and directions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              displayName: 'Franklin Silva',
              readiness,
              nextGame: {
                id: 'game-1',
                startsAt: '2026-08-08T12:00:00Z',
                endsAt: '2026-08-08T13:30:00Z',
                venueId: 'venue-1',
                venueName: 'Parque Barigui',
                latitude: -25.4,
                longitude: -49.3,
                capacity: 4,
                confirmedPlayers: 4,
                openSlots: 0,
                minimumSkillLevel: 'beginner',
                maximumSkillLevel: 'advanced',
                visibility: 'private',
                status: 'scheduled',
                currentUserStatus: 'confirmed',
              },
              openGames: [],
              availabilitySummary: [
                { id: 'rule-1', weekday: 1, start: '07:00', end: '09:00', labels: ['Near home'] },
              ],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /sua próxima partida/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/que bom ver você, Franklin/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/como chegar/i));
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps/dir'),
    );
    expect(screen.getByText(/Seg/)).toBeInTheDocument();
  });

  it('shows a productive empty state without empty sections', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              displayName: 'Franklin',
              readiness,
              openGames: [],
              availabilitySummary: [],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: /você está pronto/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /sua próxima partida/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /criar uma partida/i })[0]).toHaveAttribute(
      'href',
      '/games/new',
    );
  });

  it('keeps full games after games with available slots', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              displayName: 'Franklin',
              readiness,
              openGames: [
                { id: 'full-game', startsAt: '2099-08-01T12:05:00Z', openSlots: 0 },
                { id: 'far-open-game', startsAt: '2099-08-01T12:20:00Z', openSlots: 2 },
                { id: 'near-open-game', startsAt: '2099-08-01T12:10:00Z', openSlots: 1 },
              ],
              availabilitySummary: [],
            }),
            { status: 200 },
          ),
        ),
      ),
    );
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: /partidas que podem funcionar/i });
    const cards = screen.getAllByRole('link').filter((card) => {
      const href = card.getAttribute('href');
      return href?.startsWith('/games/') && href !== '/games/new';
    });
    expect(cards.map((card) => card.getAttribute('href'))).toEqual([
      '/games/near-open-game',
      '/games/far-open-game',
      '/games/full-game',
    ]);
    expect(screen.getByText(/partida confirmada/i)).toBeInTheDocument();
  });
});
