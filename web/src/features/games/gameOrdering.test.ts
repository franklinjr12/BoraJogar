import { describe, expect, it } from 'vitest';
import type { Game } from '../../api/client';
import { sortGamesForDisplay } from './gameOrdering';

function game(id: string, startsAt: string, openSlots: number): Game {
  return {
    id,
    startsAt,
    endsAt: '2099-08-01T13:30:00Z',
    venueId: `venue-${id}`,
    venueName: 'Praia Central',
    latitude: -25.4,
    longitude: -49.3,
    capacity: 4,
    confirmedPlayers: 4 - openSlots,
    openSlots,
    waitlistEnabled: false,
    waitlistSize: 0,
    waitlistCount: 0,
    minimumSkillLevel: 'beginner',
    maximumSkillLevel: 'advanced',
    visibility: 'public',
    status: 'scheduled',
  };
}

describe('sortGamesForDisplay', () => {
  it('puts full games last and sorts each group by proximity to now', () => {
    const now = Date.parse('2099-08-01T12:00:00Z');

    expect(
      sortGamesForDisplay(
        [
          game('full', '2099-08-01T12:05:00Z', 0),
          game('far-open', '2099-08-01T12:20:00Z', 2),
          game('near-open', '2099-08-01T11:55:00Z', 1),
        ],
        now,
      ).map(({ id }) => id),
    ).toEqual(['near-open', 'far-open', 'full']);
  });
});
