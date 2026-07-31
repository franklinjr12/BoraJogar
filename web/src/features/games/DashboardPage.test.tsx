import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './DashboardPage';

describe('DashboardPage', () => {
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
                  startsAt: '2026-08-01T12:00:00Z',
                  endsAt: '2026-08-01T13:30:00Z',
                  venueId: 'venue-1',
                  venueName: 'Praia Central',
                  latitude: -23.5,
                  longitude: -46.6,
                  capacity: 4,
                  confirmedPlayers: 4,
                  openSlots: 0,
                  minimumSkillLevel: 'beginner',
                  maximumSkillLevel: 'advanced',
                  visibility: 'private',
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
  it('prioritizes confirmed commitments and quick actions', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /upcoming confirmed games/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /quick create game/i })).toHaveAttribute(
      'href',
      '/games/new',
    );
  });
});
