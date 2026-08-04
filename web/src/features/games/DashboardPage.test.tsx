import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
      expect(screen.getByRole('heading', { name: /your next game/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/good to see you, Franklin/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /directions/i })).toHaveAttribute(
      'href',
      expect.stringContaining('openstreetmap'),
    );
    expect(screen.getByText(/Mon/)).toBeInTheDocument();
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
    expect(await screen.findByRole('heading', { name: /you're ready/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /your next game/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /create a game/i })[0]).toHaveAttribute(
      'href',
      '/games/new',
    );
  });
});
